/**
 * Turns the books around: this app belongs to BEST ENTERPRISES, the job worker,
 * not to Hamilton, the principal.
 *
 * That inverts every document:
 *
 *   Hamilton's delivery challan  →  goods arrive at our factory (inward)
 *   our return note              →  goods go back to Hamilton (outward)
 *   BE/26-27/0344                →  a sale invoice we raise, not a bill we pay
 *
 * What this script changes:
 *   · company profile becomes Best Enterprises, with the bank details printed
 *     on their return note
 *   · the three vendor accounts (1303807 / 1105306 / 1309486) were Hamilton's
 *     codes for us all along — they become customer accounts under Hamilton's
 *     GSTIN, one per process, each keeping its own stock location
 *   · the job-work bill moves from purchase invoices to sales invoices
 *
 * Items, process routes and rates are untouched.
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

/** Best Enterprises — from their tax invoice and return note letterheads. */
const US = {
  name: "BEST ENTERPRISES",
  gstin: "37ALAPP4700H1ZB",
  addressLines: [
    "PLOT NO. UDL-2A/2, S.NO. 112-1",
    "APIIC CHINNAPANDURU, VARADAIAHPALEM",
    "TIRUPATI 517541",
  ],
  state: "Andhra Pradesh",
  stateCode: "37",
  phone: "9913775149",
  bankName: "STATE BANK OF INDIA",
  bankAccount: "30908707175",
  bankIfsc: "SBIN0012",
  salesInvoicePrefix: "BE",
  grnPrefix: "RN",
  challanPrefix: "IN",
};

/** Hamilton Housewares — from the challan they issue us. */
const CUSTOMER = {
  name: "HAMILTON HOUSEWARES PVT LTD",
  gstin: "37AABCD1683Q3Z3",
  addressLines: [
    "PLOT NO 755, CHIGURUPALEM ROAD",
    "SATYAVEDU MANDAL, SRI CITY",
    "CHITTOOR 517646",
  ],
  state: "Andhra Pradesh",
  stateCode: "37",
  phone: "9533721680",
};

/** Their vendor codes for us, and what each covers. */
const ACCOUNTS: Record<string, string> = {
  "1303807": "ELECTROLYSIS & COPPER",
  "1105306": "PAINTING & POWDER",
  "1309486": "FOC",
};

async function main() {
  await connectDb();
  console.log(`Connected to ${mongoose.connection.name}\n`);

  /* --------------------------------------------------------- our company */

  await CompanyProfile.findOneAndUpdate({}, { $set: US }, { upsert: true });
  console.log(`• Company is now ${US.name} (${US.gstin})`);

  await Location.findOneAndUpdate(
    { kind: "plant" },
    { $set: { name: "Chinnapanduru Factory" } },
  );
  console.log("• Plant renamed to Chinnapanduru Factory");

  /* ------------------------------------------------ Hamilton's accounts */

  for (const [code, process] of Object.entries(ACCOUNTS)) {
    const name = `${CUSTOMER.name} — ${process}`;

    const party = await Party.findOneAndUpdate(
      { code },
      {
        $set: {
          name,
          partyType: "customer",
          gstin: CUSTOMER.gstin,
          addressLines: CUSTOMER.addressLines,
          state: CUSTOMER.state,
          stateCode: CUSTOMER.stateCode,
          phone: CUSTOMER.phone,
          notes: `Our vendor code with them is ${code} · ${process}`,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    await Location.findOneAndUpdate(
      { partyId: party!._id },
      { $set: { name: `At ${name}`, kind: "customer", partyId: party!._id } },
      { upsert: true },
    );

    console.log(`• ${code} → customer account "${name}"`);
  }

  // Anything still marked as a job worker was created under the old direction.
  const leftovers = await Party.updateMany(
    { partyType: "job_worker", gstin: CUSTOMER.gstin },
    { $set: { partyType: "customer" } },
  );
  if (leftovers.modifiedCount) {
    console.log(`• ${leftovers.modifiedCount} leftover job-worker records converted`);
  }

  /* ------------------------------- job-work bill becomes a sale invoice */

  const bills = await PurchaseInvoice.find({ status: { $ne: "cancelled" } }).lean();
  let moved = 0;

  for (const bill of bills) {
    if (await SalesInvoice.findOne({ invoiceNo: bill.invoiceNo })) continue;

    const party = await Party.findById(bill.partyId).lean();
    const plant = await Location.findOne({ kind: "plant" }).lean();
    if (!party || !plant) continue;

    const interState = isInterState(US.stateCode, party.stateCode);

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
      locationId: plant._id,
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
        `ACK ${bill.ackNo ?? "—"} · IRN ${bill.irn ?? "—"}`,
        "Moved from purchase invoices when the books were switched to the job-worker view.",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    await PurchaseInvoice.deleteOne({ _id: bill._id });
    moved += 1;
    console.log(`• Bill ${bill.invoiceNo} is now a sale invoice — ₹${rounded.toLocaleString("en-IN")}`);
  }

  if (moved === 0) console.log("• No job-work bills needed moving");

  console.log("\nDone. The app now reads as Best Enterprises:");
  console.log("  · Inward challans  — Hamilton's goods arriving for processing");
  console.log("  · Outward returns  — processed goods and rejections going back");
  console.log("  · Job-work invoices — what you bill Hamilton for the work");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
