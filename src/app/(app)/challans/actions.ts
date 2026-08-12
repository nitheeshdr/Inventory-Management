"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb, withTransaction } from "@/db/connect";
import { CompanyProfile, Item, JobWorkChallan, Location, Party } from "@/db/models";
import { postMovements, reverseMovements } from "@/lib/ledger";
import { getPendingChallanLines } from "@/lib/allocation";
import { ensurePlantLocation } from "@/lib/setup";
import { addYears, round2 } from "@/lib/format";
import { isInterState, splitTax } from "@/lib/gst";

const lineSchema = z.object({
  itemId: z.string().min(1, "Pick an item"),
  qty: z.number().positive("Quantity must be more than zero"),
  rate: z.number().min(0),
});

const challanSchema = z.object({
  challanNo: z.string().trim().min(1, "Challan number is required"),
  challanDate: z.string().min(1, "Challan date is required"),
  partyId: z.string().min(1, "Pick a customer"),
  ewayBillNo: z.string().trim().optional(),
  vehicleNo: z.string().trim().optional(),
  transportPo: z.string().trim().optional(),
  natureOfProcess: z.string().trim().optional(),
  expectedDuration: z.string().trim().optional(),
  taxRate: z.number().min(0).max(28).default(5),
  notes: z.string().trim().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

export type ChallanInput = z.input<typeof challanSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function zodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    fieldErrors[issue.path.join(".")] = issue.message;
  }
  return fieldErrors;
}

/**
 * Creates or updates an **inward** job-work challan — the principal's delivery
 * challan arriving with their goods for processing.
 *
 * We are the job worker, so the goods land in our factory and stay the
 * customer's property. Movements run the other way from a principal's system:
 * out of the customer's location, into our plant.
 */
export async function saveChallan(
  input: ChallanInput,
  challanId?: string,
): Promise<ActionResult<{ _id: string }>> {
  const parsed = challanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodErrors(parsed.error) };
  }
  const data = parsed.data;

  await connectDb();

  const party = await Party.findById(data.partyId).lean();
  if (!party) return { ok: false, error: "That customer no longer exists." };

  const [plant, customerLocation] = await Promise.all([
    ensurePlantLocation(),
    Location.findOne({ partyId: party._id }).lean(),
  ]);
  if (!customerLocation) {
    return {
      ok: false,
      error: `${party.name} has no stock location. Re-save the party in Masters to create one.`,
    };
  }

  const duplicate = await JobWorkChallan.findOne({
    challanNo: data.challanNo,
    ...(challanId ? { _id: { $ne: new Types.ObjectId(challanId) } } : {}),
  }).lean();
  if (duplicate) {
    return {
      ok: false,
      error: `Challan ${data.challanNo} already exists.`,
      fieldErrors: { challanNo: "Already used" },
    };
  }

  const items = await Item.find({
    _id: { $in: data.lines.map((line) => new Types.ObjectId(line.itemId)) },
  }).lean();
  const itemById = new Map(items.map((item) => [item._id.toString(), item]));

  const existing = challanId ? await JobWorkChallan.findById(challanId) : null;
  if (challanId && !existing) return { ok: false, error: "Challan not found." };
  if (existing?.status === "cancelled") {
    return { ok: false, error: "A cancelled challan cannot be edited." };
  }

  // Reducing a line below what has already come back would leave the ledger
  // claiming the vendor returned more than they were ever sent.
  if (existing) {
    const settled = await getPendingChallanLines({
      challanIds: [existing._id],
      includeSettled: true,
    });
    const returnedByItem = new Map<string, number>();
    for (const line of settled) {
      if (line.returnedQty > 0) {
        returnedByItem.set(
          line.itemId,
          (returnedByItem.get(line.itemId) ?? 0) + line.returnedQty,
        );
      }
    }
    for (const [itemId, returned] of returnedByItem) {
      const newQty = data.lines
        .filter((line) => line.itemId === itemId)
        .reduce((total, line) => total + line.qty, 0);
      if (newQty < returned) {
        const item = itemById.get(itemId);
        return {
          ok: false,
          error: `${item?.itemCode ?? "An item"} already has ${returned} pcs returned against this challan. Cancel the return notes before reducing the quantity below that.`,
        };
      }
    }
  }

  const lines = data.lines.map((line, index) => {
    const item = itemById.get(line.itemId);
    if (!item) throw new Error(`Item ${line.itemId} not found`);
    return {
      _id: existing?.lines[index]?._id ?? new Types.ObjectId(),
      srNo: index + 1,
      itemId: item._id,
      itemCode: item.itemCode,
      description: item.description,
      hsnCode: item.hsnCode,
      qty: line.qty,
      uom: item.uom,
      rate: line.rate,
      taxableValue: round2(line.qty * line.rate),
    };
  });

  const totalTaxable = round2(lines.reduce((total, line) => total + line.taxableValue, 0));
  // No tax is actually paid on a Sec 143 challan — the split is declared for
  // valuation only, and follows the same intra/inter-state rule as any invoice.
  const company = await CompanyProfile.findOne().select("stateCode").lean();
  const interState = isInterState(company?.stateCode ?? "37", party.stateCode);
  const tax = splitTax(totalTaxable, data.taxRate, interState);
  const challanDate = new Date(data.challanDate);

  // No availability check on an inward challan — the customer is sending these
  // goods to us, so our own balance is irrelevant.
  const warnings: string[] = [];

  const payload = {
    challanNo: data.challanNo,
    challanDate,
    partyId: party._id,
    fromLocationId: customerLocation._id,
    toLocationId: plant._id,
    ewayBillNo: data.ewayBillNo,
    vehicleNo: data.vehicleNo,
    transportPo: data.transportPo,
    natureOfProcess: data.natureOfProcess,
    expectedDuration: data.expectedDuration,
    lines,
    totalTaxable,
    cgstRate: interState ? 0 : data.taxRate / 2,
    cgstAmount: tax.cgstAmount,
    sgstRate: interState ? 0 : data.taxRate / 2,
    sgstAmount: tax.sgstAmount,
    igstRate: interState ? data.taxRate : 0,
    igstAmount: tax.igstAmount,
    totalValue: round2(totalTaxable + tax.totalTax),
    dueDate: addYears(challanDate, 1),
    notes: data.notes,
  };

  const saved = await withTransaction(async (session) => {
    const challan = existing
      ? await JobWorkChallan.findByIdAndUpdate(existing._id, payload, {
          new: true,
          session,
        })
      : await JobWorkChallan.create([{ ...payload, status: "open" }], { session }).then(
          (docs) => docs[0],
        );

    if (!challan) throw new Error("Could not save the challan.");

    await postMovements(
      {
        docType: "job_work_challan",
        docId: challan._id,
        docNo: challan.challanNo,
        movementDate: challanDate,
        partyId: party._id,
      },
      challan.lines.flatMap((line) => [
        {
          itemId: line.itemId,
          locationId: customerLocation._id,
          qty: -line.qty,
          docLineId: line._id,
          remark: `Despatched by ${party.name}`,
        },
        {
          itemId: line.itemId,
          locationId: plant._id,
          qty: line.qty,
          docLineId: line._id,
          remark: `Received from ${party.name}`,
        },
      ]),
      session,
    );

    return challan;
  });

  revalidatePath("/challans");
  revalidatePath("/stock");
  revalidatePath("/");

  return { ok: true, data: { _id: saved._id.toString() }, warnings };
}

/** Cancels a challan, reversing its movements. Blocked once returns exist. */
export async function cancelChallan(
  challanId: string,
  reason: string,
): Promise<ActionResult> {
  await connectDb();

  const challan = await JobWorkChallan.findById(challanId);
  if (!challan) return { ok: false, error: "Challan not found." };
  if (challan.status === "cancelled") return { ok: false, error: "Already cancelled." };

  const settled = await getPendingChallanLines({
    challanIds: [challan._id],
    includeSettled: true,
  });
  const returned = settled.reduce((total, line) => total + line.returnedQty, 0);
  if (returned > 0) {
    return {
      ok: false,
      error: `${returned} pcs have already been returned against this challan. Cancel those return notes first.`,
    };
  }

  await withTransaction(async (session) => {
    await reverseMovements(
      { docType: "job_work_challan", docId: challan._id },
      new Date(),
      reason,
      session,
    );
    challan.status = "cancelled";
    challan.cancelledAt = new Date();
    challan.cancelReason = reason;
    await challan.save({ session });
  });

  revalidatePath("/challans");
  revalidatePath(`/challans/${challanId}`);
  revalidatePath("/stock");
  revalidatePath("/");

  return { ok: true, data: undefined };
}
