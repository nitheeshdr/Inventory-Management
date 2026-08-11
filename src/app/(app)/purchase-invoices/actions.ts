"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/db/connect";
import { CompanyProfile, Item, Party, PurchaseInvoice } from "@/db/models";
import { computeVariance, getBillableWork } from "@/lib/queries/verification";
import { isInterState, lineTaxable, roundOffDelta, splitTax } from "@/lib/gst";
import { round2, round3 } from "@/lib/format";
import { SERVICE_GST_RATE, SERVICE_HSN } from "@/lib/constants";
import type { ActionResult } from "@/app/(app)/challans/actions";

const lineSchema = z.object({
  itemId: z.string().min(1, "Pick the billed item"),
  hsnCode: z.string().trim().default(SERVICE_HSN),
  qty: z.number().positive(),
  rate: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  taxPct: z.number().min(0).max(28).default(SERVICE_GST_RATE),
});

const invoiceSchema = z.object({
  invoiceNo: z.string().trim().min(1, "Invoice number is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  partyId: z.string().min(1, "Pick a job worker"),
  ackNo: z.string().trim().optional(),
  ackDate: z.string().optional(),
  irn: z.string().trim().optional(),
  ewayNo: z.string().trim().optional(),
  poRefs: z.string().trim().optional(),
  vehicleNo: z.string().trim().optional(),
  transport: z.string().trim().optional(),
  destination: z.string().trim().optional(),
  periodFrom: z.string().min(1, "Pick the period this bill covers"),
  periodTo: z.string().min(1, "Pick the period this bill covers"),
  notes: z.string().trim().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

export type PurchaseInvoiceInput = z.input<typeof invoiceSchema>;

function zodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".")] = issue.message;
  return fieldErrors;
}

/**
 * Records a job worker's bill and checks it against reality: quantities we
 * actually received back as processed, and the rate agreed in the process route.
 *
 * Deliberately posts **no stock movements** — the goods already moved when the
 * return note was recorded. A bill is money, not stock.
 */
export async function savePurchaseInvoice(
  input: PurchaseInvoiceInput,
  invoiceId?: string,
): Promise<ActionResult<{ _id: string; flags: string[] }>> {
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

  const party = await Party.findById(data.partyId).lean();
  if (!party) return { ok: false, error: "That job worker no longer exists." };

  const duplicate = await PurchaseInvoice.findOne({
    partyId: party._id,
    invoiceNo: data.invoiceNo,
    ...(invoiceId ? { _id: { $ne: new Types.ObjectId(invoiceId) } } : {}),
  }).lean();
  if (duplicate) {
    return {
      ok: false,
      error: `${party.name} already has an invoice numbered ${data.invoiceNo}.`,
      fieldErrors: { invoiceNo: "Already recorded" },
    };
  }

  const items = await Item.find({
    _id: { $in: data.lines.map((line) => new Types.ObjectId(line.itemId)) },
  }).lean();
  const itemById = new Map(items.map((item) => [item._id.toString(), item]));

  const billable = await getBillableWork(
    data.partyId,
    new Date(data.periodFrom),
    new Date(data.periodTo),
    invoiceId,
  );
  const billableByItem = new Map(billable.map((row) => [row.itemId, row]));

  const company = await CompanyProfile.findOne().select("stateCode").lean();
  const interState = isInterState(company?.stateCode ?? "37", party.stateCode);

  const flags: string[] = [];

  const lines = data.lines.map((line, index) => {
    const item = itemById.get(line.itemId);
    if (!item) throw new Error("Item not found while saving the invoice");

    const taxableAmount = lineTaxable(line.qty, line.rate, line.discountPct);
    const tax = splitTax(taxableAmount, line.taxPct, interState);
    const variance = computeVariance(
      { itemId: line.itemId, itemCode: item.itemCode, qty: line.qty, rate: line.rate },
      billableByItem.get(line.itemId),
    );
    flags.push(...variance.flags);

    return {
      _id: new Types.ObjectId(),
      srNo: index + 1,
      itemId: item._id,
      itemCode: item.itemCode,
      description: item.description,
      hsnCode: line.hsnCode || SERVICE_HSN,
      qty: line.qty,
      uom: item.uom,
      rate: line.rate,
      discountPct: line.discountPct,
      taxableAmount,
      taxPct: line.taxPct,
      amount: round2(taxableAmount + tax.totalTax),
      matchedGrnQty: variance.matchedGrnQty,
      routeRate: variance.routeRate ?? undefined,
      qtyVariance: variance.qtyVariance,
      rateVariance: variance.rateVariance,
    };
  });

  const subtotal = round2(lines.reduce((total, line) => total + line.taxableAmount, 0));
  const taxTotals = lines.reduce(
    (acc, line) => {
      const tax = splitTax(line.taxableAmount, line.taxPct, interState);
      return {
        cgst: acc.cgst + tax.cgstAmount,
        sgst: acc.sgst + tax.sgstAmount,
        igst: acc.igst + tax.igstAmount,
      };
    },
    { cgst: 0, sgst: 0, igst: 0 },
  );

  const totalTax = round2(taxTotals.cgst + taxTotals.sgst + taxTotals.igst);
  const { roundOff, rounded } = roundOffDelta(round2(subtotal + totalTax));

  const payload = {
    invoiceNo: data.invoiceNo,
    invoiceDate: new Date(data.invoiceDate),
    partyId: party._id,
    ackNo: data.ackNo,
    ackDate: data.ackDate ? new Date(data.ackDate) : undefined,
    irn: data.irn,
    ewayNo: data.ewayNo,
    poRefs: data.poRefs
      ? data.poRefs.split(",").map((ref) => ref.trim()).filter(Boolean)
      : [],
    vehicleNo: data.vehicleNo,
    transport: data.transport,
    destination: data.destination,
    periodFrom: new Date(data.periodFrom),
    periodTo: new Date(data.periodTo),
    lines,
    totalQty: round3(lines.reduce((total, line) => total + line.qty, 0)),
    subtotal,
    cgstAmount: round2(taxTotals.cgst),
    sgstAmount: round2(taxTotals.sgst),
    igstAmount: round2(taxTotals.igst),
    totalTax,
    roundOff,
    grandTotal: rounded,
    flags,
    status: flags.length > 0 ? ("flagged" as const) : ("verified" as const),
    notes: data.notes,
  };

  const saved = invoiceId
    ? await PurchaseInvoice.findByIdAndUpdate(invoiceId, payload, { new: true })
    : await PurchaseInvoice.create(payload);

  if (!saved) return { ok: false, error: "Could not save the invoice." };

  revalidatePath("/purchase-invoices");
  revalidatePath("/");

  return { ok: true, data: { _id: saved._id.toString(), flags } };
}

/** Approves a bill for payment, flags and all — the office's explicit call. */
export async function approvePurchaseInvoice(invoiceId: string): Promise<ActionResult> {
  await connectDb();

  const invoice = await PurchaseInvoice.findById(invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };

  invoice.status = "approved";
  await invoice.save();

  revalidatePath("/purchase-invoices");
  revalidatePath(`/purchase-invoices/${invoiceId}`);
  revalidatePath("/");

  return { ok: true, data: undefined };
}

export async function cancelPurchaseInvoice(
  invoiceId: string,
  reason: string,
): Promise<ActionResult> {
  await connectDb();

  const invoice = await PurchaseInvoice.findById(invoiceId);
  if (!invoice) return { ok: false, error: "Invoice not found." };

  invoice.status = "cancelled";
  invoice.notes = [invoice.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n");
  await invoice.save();

  revalidatePath("/purchase-invoices");
  revalidatePath(`/purchase-invoices/${invoiceId}`);

  return { ok: true, data: undefined };
}

/** Loads billable work for the period picker in the entry form. */
export async function loadBillableWork(partyId: string, from: string, to: string) {
  return getBillableWork(partyId, new Date(from), new Date(to));
}
