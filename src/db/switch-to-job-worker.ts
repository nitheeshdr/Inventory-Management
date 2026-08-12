/**
 * Turns the books around: this app belongs to the job worker, not to the
 * principal.
 *
 * That inverts every document:
 *
 *   the principal's delivery challan  →  goods arrive at our factory (inward)
 *   our return note                   →  goods go back to them (outward)
 *   the job-work invoice              →  raised by us, not received by us
 *
 * What this script changes:
 *   · every job-worker party becomes a customer, keeping its own name, GSTIN
 *     and address exactly as entered
 *   · their stock locations are re-kinded to match
 *   · job-work bills move from purchase invoices to sales invoices
 *
 * No identity is written here. Company name, GSTIN, address and bank details
 * are business data and belong in the database — set them at Masters → Company
 * before running this. Items, process routes and rates are untouched.
 *
 * Run with:  npm run switch-role
 */
import "./load-env";

import { Types } from "mongoose";
import { connectDb, mongoose } from "./connect";
import {
  CompanyProfile,
  Location,
  Party,
  PurchaseInvoice,
  SalesInvoice,
} from "./models";
import { amountInWords, round2, round3 } from "@/lib/format";
import { isInterState, roundOffDelta, splitTax } from "@/lib/gst";

async function main() {
  await connectDb();
  console.log(`Connected to ${mongoose.connection.name}\n`);

  const company = await CompanyProfile.findOne();
  if (!company) {
    throw new Error("No company profile. Run `npm run bootstrap` first.");
  }
  if (!company.gstin) {
    console.log("! Company GSTIN is blank — set it at Masters → Company.");
    console.log("  Tax will be treated as intra-state until you do.\n");
  }
  console.log(`• Trading as ${company.name}${company.gstin ? ` (${company.gstin})` : ""}`);

  /* ----------------------------------- job workers become customers */

  const workers = await Party.find({ partyType: "job_worker" });

  for (const party of workers) {
    party.partyType = "customer";
    await party.save();

    await Location.findOneAndUpdate(
      { partyId: party._id },
      { $set: { name: `At ${party.name}`, kind: "customer", partyId: party._id } },
      { upsert: true },
    );

    console.log(`• ${party.code} → customer account "${party.name}"`);
  }

  if (workers.length === 0) console.log("• No job-worker records left to convert");

  /* --------------------------- job-work bill becomes a sale invoice */

  const bills = await PurchaseInvoice.find({ status: { $ne: "cancelled" } }).lean();
  const factory = await Location.findOne({ kind: "plant" }).lean();
  let moved = 0;

  for (const bill of bills) {
    if (await SalesInvoice.findOne({ invoiceNo: bill.invoiceNo })) continue;

    const party = await Party.findById(bill.partyId).lean();
    if (!party || !factory) continue;

    // Only job-work charges move across. A bill from a genuine supplier stays
    // where it is.
    const isJobWork =
      bill.lines.length > 0 && bill.lines.every((line) => line.hsnCode === "998898");
    if (!isJobWork) continue;

    const interState = isInterState(company.stateCode, party.stateCode);

    const lines = bill.lines.map((line) => {
      const tax = splitTax(line.taxableAmount, line.taxPct, interState);
      return {
        _id: new Types.ObjectId(),
        srNo: line.srNo,
        itemId: line.itemId,
        itemCode: line.itemCode,
        description: line.description,
        hsnCode: line.hsnCode,
        qty: line.qty,
        uom: line.uom,
        rate: line.rate,
        discountPct: line.discountPct,
        taxableAmount: line.taxableAmount,
        taxPct: line.taxPct,
        cgstAmount: tax.cgstAmount,
        sgstAmount: tax.sgstAmount,
        igstAmount: tax.igstAmount,
        amount: round2(line.taxableAmount + tax.totalTax),
      };
    });

    const subtotal = round2(lines.reduce((t, l) => t + l.taxableAmount, 0));
    const cgstAmount = round2(lines.reduce((t, l) => t + l.cgstAmount, 0));
    const sgstAmount = round2(lines.reduce((t, l) => t + l.sgstAmount, 0));
    const igstAmount = round2(lines.reduce((t, l) => t + l.igstAmount, 0));
    const totalTax = round2(cgstAmount + sgstAmount + igstAmount);
    const { roundOff, rounded } = roundOffDelta(round2(subtotal + totalTax));

    await SalesInvoice.create({
      invoiceNo: bill.invoiceNo,
      invoiceDate: bill.invoiceDate,
      partyId: bill.partyId,
      locationId: factory._id,
      shipToLines: party.addressLines,
      poNo: bill.poRefs.join(", "),
      vehicleNo: bill.vehicleNo,
      transport: bill.transport,
      destination: bill.destination,
      isInterState: interState,
      lines,
      totalQty: round3(lines.reduce((t, l) => t + l.qty, 0)),
      subtotal,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalTax,
      roundOff,
      grandTotal: rounded,
      amountInWords: amountInWords(rounded),
      // A job-work invoice bills a service. The goods moved on the return note,
      // so this document must not touch the stock ledger.
      status: "open",
      notes: [
        bill.notes,
        bill.ackNo ? `ACK ${bill.ackNo}` : null,
        bill.irn ? `IRN ${bill.irn}` : null,
        "Moved from purchase invoices when the books were switched to the job-worker view.",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    await PurchaseInvoice.deleteOne({ _id: bill._id });
    moved += 1;
    console.log(
      `• Bill ${bill.invoiceNo} is now a sale invoice — ₹${rounded.toLocaleString("en-IN")}`,
    );
  }

  if (moved === 0) console.log("• No job-work bills needed moving");

  console.log("\nDone. The app now reads from the job worker's side:");
  console.log("  · Inward challans   — the principal's goods arriving for processing");
  console.log("  · Outward returns   — processed goods and rejections going back");
  console.log("  · Job-work invoices — what you bill them for the work");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
