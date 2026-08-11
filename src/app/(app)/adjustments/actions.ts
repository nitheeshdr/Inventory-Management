"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb, withTransaction } from "@/db/connect";
import { Item, Location, StockAdjustment } from "@/db/models";
import { postMovements, reverseMovements } from "@/lib/ledger";
import { nextDocNumber } from "@/lib/numbering";
import { round3 } from "@/lib/format";
import type { ActionResult } from "@/app/(app)/challans/actions";

const lineSchema = z.object({
  itemId: z.string().min(1, "Pick an item"),
  /** Signed: positive adds stock, negative removes it. Zero is dropped. */
  qty: z.number().refine((value) => value !== 0, "Quantity cannot be zero"),
  remark: z.string().trim().optional(),
});

const adjustmentSchema = z.object({
  adjustmentDate: z.string().min(1, "Date is required"),
  locationId: z.string().min(1, "Pick a location"),
  reason: z.string().trim().min(1, "Give a reason — it shows on the ledger"),
  notes: z.string().trim().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

export type AdjustmentInput = z.input<typeof adjustmentSchema>;

/**
 * Opening balances and physical-count corrections — the only way stock enters
 * or leaves the ledger without a document behind it, so the reason is required.
 */
export async function saveAdjustment(
  input: AdjustmentInput,
): Promise<ActionResult<{ _id: string }>> {
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const data = parsed.data;

  await connectDb();

  const location = await Location.findById(data.locationId).lean();
  if (!location) return { ok: false, error: "That location no longer exists." };

  const items = await Item.find({
    _id: { $in: data.lines.map((line) => new Types.ObjectId(line.itemId)) },
  }).lean();
  const itemById = new Map(items.map((item) => [item._id.toString(), item]));

  const lines = data.lines.map((line) => {
    const item = itemById.get(line.itemId);
    if (!item) throw new Error("Item not found while saving the adjustment");
    return {
      _id: new Types.ObjectId(),
      itemId: item._id,
      itemCode: item.itemCode,
      description: item.description,
      qty: round3(line.qty),
      uom: item.uom,
      remark: line.remark,
    };
  });

  const adjustmentNo = await nextDocNumber(
    StockAdjustment,
    "adjustmentNo",
    "ADJ",
    new Date(data.adjustmentDate),
  );

  const saved = await withTransaction(async (session) => {
    const [adjustment] = await StockAdjustment.create(
      [
        {
          adjustmentNo,
          adjustmentDate: new Date(data.adjustmentDate),
          locationId: location._id,
          reason: data.reason,
          notes: data.notes,
          lines,
          status: "open",
        },
      ],
      { session },
    );

    await postMovements(
      {
        docType: "stock_adjustment",
        docId: adjustment._id,
        docNo: adjustment.adjustmentNo,
        movementDate: adjustment.adjustmentDate,
      },
      lines.map((line) => ({
        itemId: line.itemId,
        locationId: location._id,
        qty: line.qty,
        docLineId: line._id,
        remark: line.remark ?? data.reason,
      })),
      session,
    );

    return adjustment;
  });

  revalidatePath("/adjustments");
  revalidatePath("/stock");
  revalidatePath("/");

  return { ok: true, data: { _id: saved._id.toString() } };
}

export async function cancelAdjustment(
  adjustmentId: string,
  reason: string,
): Promise<ActionResult> {
  await connectDb();

  const adjustment = await StockAdjustment.findById(adjustmentId);
  if (!adjustment) return { ok: false, error: "Adjustment not found." };
  if (adjustment.status === "cancelled") return { ok: false, error: "Already cancelled." };

  await withTransaction(async (session) => {
    await reverseMovements(
      { docType: "stock_adjustment", docId: adjustment._id },
      new Date(),
      reason,
      session,
    );
    adjustment.status = "cancelled";
    await adjustment.save({ session });
  });

  revalidatePath("/adjustments");
  revalidatePath("/stock");
  revalidatePath("/");

  return { ok: true, data: undefined };
}
