import { Types } from "mongoose";
import { connectDb } from "@/db/connect";
import { Grn, ProcessRoute } from "@/db/models";
import { round2, round3 } from "@/lib/format";

export interface BillableLine {
  itemId: string;
  itemCode: string;
  description: string;
  uom: string;
  /** Processed quantity received in the period, from return notes. */
  processedQty: number;
  /** Already billed on other approved/verified invoices. */
  billedQty: number;
  unbilledQty: number;
  routeRate: number | null;
  routeConfirmed: boolean;
  processName: string | null;
}

/**
 * What a job worker may legitimately bill for a period: processed quantities we
 * actually received back, priced at the agreed route rate. This is the basis of
 * the variance check on their invoice.
 */
export async function getBillableWork(
  partyId: string,
  from: Date,
  to: Date,
  excludeInvoiceId?: string,
): Promise<BillableLine[]> {
  await connectDb();

  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  const processed = await Grn.aggregate<{
    _id: Types.ObjectId;
    qty: number;
    itemCode: string;
    description: string;
    uom: string;
    inputItemId: Types.ObjectId | null;
  }>([
    {
      $match: {
        partyId: new Types.ObjectId(partyId),
        status: { $ne: "cancelled" },
        grnDate: { $gte: from, $lte: end },
      },
    },
    { $unwind: "$lines" },
    { $match: { "lines.lineKind": "processed" } },
    {
      $group: {
        _id: "$lines.itemId",
        qty: { $sum: "$lines.qty" },
        itemCode: { $first: "$lines.itemCode" },
        description: { $first: "$lines.description" },
        uom: { $first: "$lines.uom" },
        inputItemId: { $first: "$lines.inputItemId" },
      },
    },
    { $sort: { itemCode: 1 } },
  ]);

  if (processed.length === 0) return [];

  const routes = await ProcessRoute.find({
    outputItemId: { $in: processed.map((row) => row._id) },
    isActive: true,
    $or: [{ partyId: new Types.ObjectId(partyId) }, { partyId: null }],
  })
    .sort({ effectiveFrom: -1 })
    .lean();

  const routeByOutput = new Map(routes.map((route) => [route.outputItemId.toString(), route]));

  // Quantities already billed for the same period, so a second invoice for the
  // same work shows up as an over-bill rather than passing silently.
  const { PurchaseInvoice } = await import("@/db/models");
  const billedMatch: Record<string, unknown> = {
    partyId: new Types.ObjectId(partyId),
    status: { $in: ["verified", "approved"] },
    invoiceDate: { $gte: from, $lte: end },
  };
  if (excludeInvoiceId) billedMatch._id = { $ne: new Types.ObjectId(excludeInvoiceId) };

  const billed = await PurchaseInvoice.aggregate<{ _id: Types.ObjectId; qty: number }>([
    { $match: billedMatch },
    { $unwind: "$lines" },
    { $group: { _id: "$lines.itemId", qty: { $sum: "$lines.qty" } } },
  ]);

  const billedByItem = new Map(billed.map((row) => [row._id.toString(), round3(row.qty)]));

  return processed.map((row) => {
    const itemId = row._id.toString();
    const route = routeByOutput.get(itemId);
    const billedQty = billedByItem.get(itemId) ?? 0;

    return {
      itemId,
      itemCode: row.itemCode,
      description: row.description,
      uom: row.uom,
      processedQty: round3(row.qty),
      billedQty,
      unbilledQty: round3(row.qty - billedQty),
      routeRate: route ? route.jobRate : null,
      routeConfirmed: route?.isConfirmed ?? false,
      processName: route?.processName ?? null,
    };
  });
}

export interface LineVariance {
  matchedGrnQty: number;
  routeRate: number | null;
  qtyVariance: number;
  rateVariance: number;
  flags: string[];
}

/** Compares one billed line against what was actually received and agreed. */
export function computeVariance(
  line: { itemId: string; itemCode: string; qty: number; rate: number },
  billable: BillableLine | undefined,
): LineVariance {
  const flags: string[] = [];

  if (!billable) {
    flags.push(
      `${line.itemCode}: no processed goods received for this code in the selected period.`,
    );
    return {
      matchedGrnQty: 0,
      routeRate: null,
      qtyVariance: round3(line.qty),
      rateVariance: 0,
      flags,
    };
  }

  const qtyVariance = round3(line.qty - billable.unbilledQty);
  const rateVariance =
    billable.routeRate === null ? 0 : round2(line.rate - billable.routeRate);

  if (qtyVariance > 0) {
    flags.push(
      `${line.itemCode}: billed ${line.qty} but only ${billable.unbilledQty} unbilled pcs were received (over by ${qtyVariance}).`,
    );
  }
  if (billable.routeRate === null) {
    flags.push(`${line.itemCode}: no process route, so the rate cannot be checked.`);
  } else if (rateVariance !== 0) {
    flags.push(
      `${line.itemCode}: billed at ₹${line.rate} against the agreed ₹${billable.routeRate} (${rateVariance > 0 ? "+" : ""}${rateVariance}).`,
    );
  } else if (!billable.routeConfirmed) {
    flags.push(`${line.itemCode}: rate matches an unconfirmed route — verify it in Masters.`);
  }

  return {
    matchedGrnQty: billable.unbilledQty,
    routeRate: billable.routeRate,
    qtyVariance,
    rateVariance,
    flags,
  };
}
