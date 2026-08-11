"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb, withTransaction } from "@/db/connect";
import { CompanyProfile, Item, Party, SalesInvoice } from "@/db/models";
import { checkAvailability, postMovements, reverseMovements } from "@/lib/ledger";
import { isInterState, lineTaxable, roundOffDelta, splitTax } from "@/lib/gst";
import { amountInWords, round2, round3 } from "@/lib/format";
import { ensurePlantLocation } from "@/lib/setup";
import type { ActionResult } from "@/app/(app)/challans/actions";

const lineSchema = z.object({
  itemId: z.string().min(1, "Pick an item"),
  qty: z.number().positive(),
  rate: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  taxPct: z.number().min(0).max(28).default(18),
});

const invoiceSchema = z.object({
  invoiceNo: z.string().trim().min(1, "Invoice number is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  partyId: z.string().min(1, "Pick a customer"),
  poNo: z.string().trim().optional(),
  vehicleNo: z.string().trim().optional(),
  transport: z.string().trim().optional(),
  destination: z.string().trim().optional(),
  ewayBillNo: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

export type SalesInvoiceInput = z.input<typeof invoiceSchema>;

function zodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".")] = issue.message;
  return fieldErrors;
}

/**
 * Outward sale of finished goods. Tax splits into CGST+SGST within Andhra
 * Pradesh and a single IGST outside it, decided by the customer's state code.
 * Stock leaves the plant.
 */
export async function saveSalesInvoice(
  input: SalesInvoiceInput,
  invoiceId?: string,
): Promise<ActionResult<{ _id: string }>> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: zodErrors(parsed.error),
    };
  }
  const data = parsed.data;

  await connectDb();

  const [party, plant, company] = await Promise.all([
    Party.findById(data.partyId).lean(),
    ensurePlantLocation(),
    CompanyProfile.findOne().lean(),
  ]);

  if (!party) return { ok: false, error: "That customer no longer exists." };

  const existing = invoiceId ? await SalesInvoice.findById(invoiceId) : null;
  if (invoiceId && !existing) return { ok: false, error: "Invoice not found." };
  if (existing?.status === "cancelled") {
    return { ok: false, error: "A cancelled invoice cannot be edited." };
  }

  const duplicate = await SalesInvoice.findOne({
    invoiceNo: data.invoiceNo,
    ...(invoiceId ? { _id: { $ne: new Types.ObjectId(invoiceId) } } : {}),
  }).lean();
  if (duplicate) {
    return {
      ok: false,
      error: `Invoice ${data.invoiceNo} already exists.`,
      fieldErrors: { invoiceNo: "Already used" },
    };
  }

  const items = await Item.find({
    _id: { $in: data.lines.map((line) => new Types.ObjectId(line.itemId)) },
  }).lean();
  const itemById = new Map(items.map((item) => [item._id.toString(), item]));

  const interState = isInterState(company?.stateCode ?? "37", party.stateCode);

  const lines = data.lines.map((line, index) => {
    const item = itemById.get(line.itemId);
    if (!item) throw new Error("Item not found while saving the invoice");

    const taxableAmount = lineTaxable(line.qty, line.rate, line.discountPct);
    const tax = splitTax(taxableAmount, line.taxPct, interState);

    return {
      _id: new Types.ObjectId(),
      srNo: index + 1,
      itemId: item._id,
      itemCode: item.itemCode,
      description: item.description,
      hsnCode: item.hsnCode,
      qty: line.qty,
      uom: item.uom,
      rate: line.rate,
      discountPct: line.discountPct,
      taxableAmount,
      taxPct: line.taxPct,
      cgstAmount: tax.cgstAmount,
      sgstAmount: tax.sgstAmount,
      igstAmount: tax.igstAmount,
      amount: round2(taxableAmount + tax.totalTax),
    };
  });

  const subtotal = round2(lines.reduce((total, line) => total + line.taxableAmount, 0));
  const cgstAmount = round2(lines.reduce((total, line) => total + line.cgstAmount, 0));
  const sgstAmount = round2(lines.reduce((total, line) => total + line.sgstAmount, 0));
  const igstAmount = round2(lines.reduce((total, line) => total + line.igstAmount, 0));
  const totalTax = round2(cgstAmount + sgstAmount + igstAmount);
  const { roundOff, rounded } = roundOffDelta(round2(subtotal + totalTax));

  const warnings: string[] = [];
  const shortfalls = await checkAvailability(
    plant._id,
    lines.map((line) => ({ itemId: line.itemId, qty: line.qty })),
    existing ? { docType: "sales_invoice", docId: existing._id } : undefined,
  );
  for (const shortfall of shortfalls) {
    warnings.push(
      `${shortfall.itemCode} — invoicing ${shortfall.requested} but only ${shortfall.available} in the plant.`,
    );
  }

  const invoiceDate = new Date(data.invoiceDate);

  const payload = {
    invoiceNo: data.invoiceNo,
    invoiceDate,
    partyId: party._id,
    locationId: plant._id,
    shipToLines: party.addressLines,
    poNo: data.poNo,
    vehicleNo: data.vehicleNo,
    transport: data.transport,
    destination: data.destination,
    ewayBillNo: data.ewayBillNo,
    isInterState: interState,
    lines,
    totalQty: round3(lines.reduce((total, line) => total + line.qty, 0)),
    subtotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    roundOff,
    grandTotal: rounded,
    amountInWords: amountInWords(rounded),
    notes: data.notes,
  };

  const saved = await withTransaction(async (session) => {
    const invoice = existing
      ? await SalesInvoice.findByIdAndUpdate(existing._id, payload, { new: true, session })
      : await SalesInvoice.create([{ ...payload, status: "open" }], { session }).then(
          (docs) => docs[0],
        );

    if (!invoice) throw new Error("Could not save the invoice.");

    await postMovements(
      {
        docType: "sales_invoice",
        docId: invoice._id,
        docNo: invoice.invoiceNo,
        movementDate: invoiceDate,
        partyId: party._id,
      },
      invoice.lines.map((line) => ({
        itemId: line.itemId,
        locationId: plant._id,
        qty: -line.qty,
        docLineId: line._id,
        remark: `Sold to ${party.name}`,
      })),
      session,
    );

    return invoice;
  });

  revalidatePath("/sales-invoices");
  revalidatePath("/stock");
  revalidatePath("/");

  return { ok: true, data: { _id: saved._id.toString() }, warnings };
}

export async function cancelSalesInvoice(
  invoiceId: string,
  reason: string,
): Promise<ActionResult> {
  await connectDb();

  const invoice = await SalesInvoice.findById(invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status === "cancelled") return { ok: false, error: "Already cancelled." };

  await withTransaction(async (session) => {
    await reverseMovements(
      { docType: "sales_invoice", docId: invoice._id },
      new Date(),
      reason,
      session,
    );
    invoice.status = "cancelled";
    invoice.cancelledAt = new Date();
    invoice.cancelReason = reason;
    await invoice.save({ session });
  });

  revalidatePath("/sales-invoices");
  revalidatePath(`/sales-invoices/${invoiceId}`);
  revalidatePath("/stock");
  revalidatePath("/");

  return { ok: true, data: undefined };
}
