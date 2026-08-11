"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb, withTransaction } from "@/db/connect";
import { Grn, Item, Location, Party, ProcessRoute } from "@/db/models";
import { postMovements, reverseMovements } from "@/lib/ledger";
import {
  getPendingChallanLines,
  refreshChallanStatuses,
  validateAllocations,
} from "@/lib/allocation";
import { GRN_LINE_KINDS } from "@/lib/constants";
import { round3 } from "@/lib/format";
import { ensurePlantLocation } from "@/lib/setup";
import type { ActionResult } from "@/app/(app)/challans/actions";

const allocationSchema = z.object({
  challanId: z.string().min(1),
  challanLineId: z.string().min(1),
  qty: z.number().positive(),
});

const lineSchema = z.object({
  lineKind: z.enum(GRN_LINE_KINDS),
  /** The item physically received — output code for processed lines. */
  itemId: z.string().min(1, "Pick the item received"),
  /** The input code being consumed at the vendor. */
  inputItemId: z.string().min(1, "Pick the item that was sent out"),
  routeId: z.string().optional(),
  qty: z.number().positive("Quantity must be more than zero"),
  rejectionReason: z.string().trim().optional(),
  allocations: z.array(allocationSchema).min(1, "Allocate the quantity to a challan line"),
});

const grnSchema = z.object({
  grnNo: z.string().trim().min(1, "Return note number is required"),
  vendorDocNo: z.string().trim().optional(),
  grnDate: z.string().min(1, "Date is required"),
  partyId: z.string().min(1, "Pick a job worker"),
  vehicleNo: z.string().trim().optional(),
  grNo: z.string().trim().optional(),
  transportRemark: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
});

export type GrnInput = z.input<typeof grnSchema>;

function zodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".")] = issue.message;
  return fieldErrors;
}

/**
 * Records goods coming back from a job worker.
 *
 * Each line is allocated against the challan line(s) it went out on, which is
 * what closes the 1-year GST clock. Processed lines consume the *input* code at
 * the vendor and bring the *output* code into the plant; rejections come back
 * unchanged.
 */
export async function saveGrn(
  input: GrnInput,
  grnId?: string,
): Promise<ActionResult<{ _id: string }>> {
  const parsed = grnSchema.safeParse(input);
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

  const [plant, vendorLocation] = await Promise.all([
    ensurePlantLocation(),
    Location.findOne({ partyId: party._id }).lean(),
  ]);
  if (!vendorLocation) {
    return {
      ok: false,
      error: `${party.name} has no stock location. Re-save the party in Masters to create one.`,
    };
  }

  const existing = grnId ? await Grn.findById(grnId) : null;
  if (grnId && !existing) return { ok: false, error: "Return note not found." };
  if (existing?.status === "cancelled") {
    return { ok: false, error: "A cancelled return note cannot be edited." };
  }

  const duplicate = await Grn.findOne({
    grnNo: data.grnNo,
    ...(grnId ? { _id: { $ne: new Types.ObjectId(grnId) } } : {}),
  }).lean();
  if (duplicate) {
    return {
      ok: false,
      error: `Return note ${data.grnNo} already exists.`,
      fieldErrors: { grnNo: "Already used" },
    };
  }

  // Pending quantities, ignoring what this very note currently holds so an edit
  // isn't blocked by its own allocations.
  const candidates = await getPendingChallanLines({
    partyId: party._id,
    includeSettled: true,
    excludeGrnId: grnId,
  });

  const allAllocations = data.lines.flatMap((line) => line.allocations);
  const problems = validateAllocations(allAllocations, candidates);
  if (problems.length > 0) {
    const detail = problems
      .map(
        (problem) =>
          `${problem.itemCode} on challan ${problem.challanNo}: allocating ${problem.allocated} but only ${problem.pending} pending`,
      )
      .join("; ");
    return { ok: false, error: `A return cannot exceed what is still with the vendor — ${detail}.` };
  }

  for (const [index, line] of data.lines.entries()) {
    const allocated = round3(
      line.allocations.reduce((total, alloc) => total + alloc.qty, 0),
    );
    if (allocated !== round3(line.qty)) {
      return {
        ok: false,
        error: `Line ${index + 1}: allocated ${allocated} but the line quantity is ${line.qty}. They must match.`,
      };
    }
  }

  const itemIds = [
    ...new Set(data.lines.flatMap((line) => [line.itemId, line.inputItemId])),
  ].map((id) => new Types.ObjectId(id));
  const items = await Item.find({ _id: { $in: itemIds } }).lean();
  const itemById = new Map(items.map((item) => [item._id.toString(), item]));

  const challanNoByLine = new Map(
    candidates.map((candidate) => [candidate.challanLineId, candidate.challanNo]),
  );

  const lines = data.lines.map((line, index) => {
    const item = itemById.get(line.itemId);
    const inputItem = itemById.get(line.inputItemId);
    if (!item || !inputItem) throw new Error("Item not found while saving the return note");

    return {
      _id: existing?.lines[index]?._id ?? new Types.ObjectId(),
      srNo: index + 1,
      lineKind: line.lineKind,
      itemId: item._id,
      itemCode: item.itemCode,
      description: item.description,
      qty: line.qty,
      uom: item.uom,
      inputItemId: inputItem._id,
      routeId: line.routeId ? new Types.ObjectId(line.routeId) : undefined,
      rejectionReason: line.rejectionReason,
      allocations: line.allocations.map((alloc) => ({
        _id: new Types.ObjectId(),
        challanId: new Types.ObjectId(alloc.challanId),
        challanNo: challanNoByLine.get(alloc.challanLineId) ?? "",
        challanLineId: new Types.ObjectId(alloc.challanLineId),
        qty: alloc.qty,
      })),
    };
  });

  const grnDate = new Date(data.grnDate);

  const payload = {
    grnNo: data.grnNo,
    vendorDocNo: data.vendorDocNo,
    grnDate,
    partyId: party._id,
    fromLocationId: vendorLocation._id,
    toLocationId: plant._id,
    vehicleNo: data.vehicleNo,
    grNo: data.grNo,
    transportRemark: data.transportRemark,
    notes: data.notes,
    lines,
  };

  const touchedChallans = new Set<string>();
  for (const line of data.lines) {
    for (const alloc of line.allocations) touchedChallans.add(alloc.challanId);
  }
  if (existing) {
    for (const line of existing.lines) {
      for (const alloc of line.allocations) touchedChallans.add(alloc.challanId.toString());
    }
  }

  const saved = await withTransaction(async (session) => {
    const grn = existing
      ? await Grn.findByIdAndUpdate(existing._id, payload, { new: true, session })
      : await Grn.create([{ ...payload, status: "open" }], { session }).then((docs) => docs[0]);

    if (!grn) throw new Error("Could not save the return note.");

    await postMovements(
      {
        docType: "grn",
        docId: grn._id,
        docNo: grn.grnNo,
        movementDate: grnDate,
        partyId: party._id,
      },
      grn.lines.flatMap((line) => {
        // What leaves the vendor is always the input code — that is what they
        // were holding. What arrives at the plant is the output code for
        // processed goods and the same input code for everything else.
        const consumedQty = line.allocations.reduce((total, alloc) => total + alloc.qty, 0);

        return [
          {
            itemId: line.inputItemId!,
            locationId: vendorLocation._id,
            qty: -consumedQty,
            docLineId: line._id,
            remark: `Returned by ${party.name}`,
          },
          {
            itemId: line.itemId,
            locationId: plant._id,
            qty: line.qty,
            docLineId: line._id,
            remark:
              line.lineKind === "processed"
                ? "Processed goods received"
                : `${line.lineKind} — ${line.rejectionReason ?? "no reason given"}`,
          },
        ];
      }),
      session,
    );

    await refreshChallanStatuses([...touchedChallans], session);

    return grn;
  });

  revalidatePath("/grn");
  revalidatePath("/challans");
  revalidatePath("/stock");
  revalidatePath("/");

  return { ok: true, data: { _id: saved._id.toString() } };
}

export async function cancelGrn(grnId: string, reason: string): Promise<ActionResult> {
  await connectDb();

  const grn = await Grn.findById(grnId);
  if (!grn) return { ok: false, error: "Return note not found." };
  if (grn.status === "cancelled") return { ok: false, error: "Already cancelled." };

  const touchedChallans = [
    ...new Set(
      grn.lines.flatMap((line) => line.allocations.map((alloc) => alloc.challanId.toString())),
    ),
  ];

  await withTransaction(async (session) => {
    await reverseMovements({ docType: "grn", docId: grn._id }, new Date(), reason, session);
    grn.status = "cancelled";
    grn.cancelledAt = new Date();
    grn.cancelReason = reason;
    await grn.save({ session });
    // Status must be recomputed *after* the note is marked cancelled, since the
    // pending query skips cancelled notes.
    await refreshChallanStatuses(touchedChallans, session);
  });

  revalidatePath("/grn");
  revalidatePath(`/grn/${grnId}`);
  revalidatePath("/challans");
  revalidatePath("/stock");
  revalidatePath("/");

  return { ok: true, data: undefined };
}

/** Suggests output item and rate for an input code, from the process routes. */
export async function resolveRoute(inputItemId: string, partyId: string) {
  await connectDb();

  const routes = await ProcessRoute.find({
    inputItemId,
    isActive: true,
    $or: [{ partyId }, { partyId: null }],
  })
    .sort({ effectiveFrom: -1 })
    .populate<{ outputItemId: { _id: Types.ObjectId; itemCode: string; description: string } }>(
      "outputItemId",
      "itemCode description",
    )
    .lean();

  return routes.map((route) => {
    const output = route.outputItemId as unknown as {
      _id: Types.ObjectId;
      itemCode: string;
      description: string;
    };
    return {
      routeId: route._id.toString(),
      outputItemId: output._id.toString(),
      outputItemCode: output.itemCode,
      outputDescription: output.description,
      processName: route.processName,
      jobRate: route.jobRate,
      isConfirmed: route.isConfirmed,
    };
  });
}
