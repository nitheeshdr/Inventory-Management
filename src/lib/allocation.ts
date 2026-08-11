import { Types, type ClientSession } from "mongoose";
import { connectDb } from "@/db/connect";
import { Grn, JobWorkChallan } from "@/db/models";
import { JOB_WORK_RETURN_DAYS } from "@/lib/constants";
import { daysBetween, round3 } from "@/lib/format";

export interface PendingChallanLine {
  challanId: string;
  challanNo: string;
  challanDate: string;
  dueDate: string;
  partyId: string;
  challanLineId: string;
  srNo: number;
  itemId: string;
  itemCode: string;
  description: string;
  uom: string;
  rate: number;
  sentQty: number;
  returnedQty: number;
  pendingQty: number;
  pendingValue: number;
  daysOpen: number;
  daysToDeadline: number;
  isOverdue: boolean;
}

export interface AllocationInput {
  challanId: string;
  challanNo?: string;
  challanLineId: string;
  qty: number;
}

/**
 * Open challan lines with how much of each is still lying with the job worker.
 *
 * Returned quantities are aggregated separately from the challans and merged in
 * memory: the set of open challans is small, and a nested-array `$lookup` across
 * `lines.allocations` is markedly harder to read for no practical gain here.
 */
export async function getPendingChallanLines(options: {
  partyId?: Types.ObjectId | string;
  itemIds?: (Types.ObjectId | string)[];
  challanIds?: (Types.ObjectId | string)[];
  /** Include lines already fully returned — needed when editing a saved GRN. */
  includeSettled?: boolean;
  /** Ignore this GRN's own allocations so its lines stay editable. */
  excludeGrnId?: Types.ObjectId | string;
  /**
   * Read inside an open transaction. Without this, a caller running in the same
   * transaction that just wrote a return note cannot see it, and would compute
   * the challan status from stale data.
   */
  session?: ClientSession;
} = {}): Promise<PendingChallanLine[]> {
  await connectDb();

  const challanMatch: Record<string, unknown> = {
    status: { $nin: ["cancelled", "draft"] },
  };
  if (options.partyId) challanMatch.partyId = new Types.ObjectId(String(options.partyId));
  if (options.challanIds?.length) {
    challanMatch._id = { $in: options.challanIds.map((id) => new Types.ObjectId(String(id))) };
  }
  if (!options.includeSettled) {
    challanMatch.status = { $in: ["open", "partially_returned"] };
  }

  const challans = await JobWorkChallan.find(challanMatch)
    .sort({ challanDate: 1, challanNo: 1 })
    .session(options.session ?? null)
    .lean();

  if (challans.length === 0) return [];

  const challanIds = challans.map((c) => c._id);

  const grnMatch: Record<string, unknown> = {
    status: { $ne: "cancelled" },
    "lines.allocations.challanId": { $in: challanIds },
  };
  if (options.excludeGrnId) {
    grnMatch._id = { $ne: new Types.ObjectId(String(options.excludeGrnId)) };
  }

  const returned = await Grn.aggregate<{ _id: Types.ObjectId; qty: number }>([
    { $match: grnMatch },
    { $unwind: "$lines" },
    { $unwind: "$lines.allocations" },
    { $match: { "lines.allocations.challanId": { $in: challanIds } } },
    {
      $group: {
        _id: "$lines.allocations.challanLineId",
        qty: { $sum: "$lines.allocations.qty" },
      },
    },
  ]).session(options.session ?? null);

  const returnedByLine = new Map(returned.map((r) => [r._id.toString(), round3(r.qty)]));

  const itemFilter = options.itemIds?.length
    ? new Set(options.itemIds.map((id) => String(id)))
    : null;

  const rows: PendingChallanLine[] = [];

  for (const challan of challans) {
    const daysOpen = daysBetween(challan.challanDate);
    for (const line of challan.lines) {
      if (itemFilter && !itemFilter.has(line.itemId.toString())) continue;

      const returnedQty = returnedByLine.get(line._id.toString()) ?? 0;
      const pendingQty = round3(line.qty - returnedQty);

      if (!options.includeSettled && pendingQty <= 0) continue;

      rows.push({
        challanId: challan._id.toString(),
        challanNo: challan.challanNo,
        challanDate: challan.challanDate.toISOString(),
        dueDate: challan.dueDate.toISOString(),
        partyId: challan.partyId.toString(),
        challanLineId: line._id.toString(),
        srNo: line.srNo,
        itemId: line.itemId.toString(),
        itemCode: line.itemCode,
        description: line.description,
        uom: line.uom,
        rate: line.rate,
        sentQty: round3(line.qty),
        returnedQty,
        pendingQty,
        pendingValue: round3(pendingQty * line.rate),
        daysOpen,
        daysToDeadline: JOB_WORK_RETURN_DAYS - daysOpen,
        isOverdue: daysOpen > JOB_WORK_RETURN_DAYS,
      });
    }
  }

  return rows;
}

/**
 * Spreads a returned quantity across open challan lines oldest-first, which is
 * both what actually happens on the floor and what keeps the 1-year GST clock
 * honest — the oldest stock must be cleared first.
 */
export function fifoAllocate(
  candidates: PendingChallanLine[],
  qty: number,
): { allocations: AllocationInput[]; unallocated: number } {
  let remaining = round3(qty);
  const allocations: AllocationInput[] = [];

  const ordered = [...candidates].sort(
    (a, b) =>
      new Date(a.challanDate).getTime() - new Date(b.challanDate).getTime() ||
      a.challanNo.localeCompare(b.challanNo) ||
      a.srNo - b.srNo,
  );

  for (const candidate of ordered) {
    if (remaining <= 0) break;
    if (candidate.pendingQty <= 0) continue;

    const take = round3(Math.min(remaining, candidate.pendingQty));
    allocations.push({
      challanId: candidate.challanId,
      challanNo: candidate.challanNo,
      challanLineId: candidate.challanLineId,
      qty: take,
    });
    remaining = round3(remaining - take);
  }

  return { allocations, unallocated: round3(Math.max(remaining, 0)) };
}

export interface AllocationProblem {
  challanLineId: string;
  challanNo: string;
  itemCode: string;
  allocated: number;
  pending: number;
  excess: number;
}

/**
 * Hard guard: a return can never exceed what is still lying with the vendor.
 * Unlike the stock shortfall warning this is a genuine data error, so callers
 * reject the save rather than warn.
 */
export function validateAllocations(
  allocations: AllocationInput[],
  candidates: PendingChallanLine[],
): AllocationProblem[] {
  const byLine = new Map(candidates.map((c) => [c.challanLineId, c]));
  const totals = new Map<string, number>();

  for (const alloc of allocations) {
    totals.set(alloc.challanLineId, round3((totals.get(alloc.challanLineId) ?? 0) + alloc.qty));
  }

  const problems: AllocationProblem[] = [];

  for (const [lineId, allocated] of totals) {
    const candidate = byLine.get(lineId);
    if (!candidate) {
      problems.push({
        challanLineId: lineId,
        challanNo: "?",
        itemCode: "?",
        allocated,
        pending: 0,
        excess: allocated,
      });
      continue;
    }
    if (allocated > candidate.pendingQty) {
      problems.push({
        challanLineId: lineId,
        challanNo: candidate.challanNo,
        itemCode: candidate.itemCode,
        allocated,
        pending: candidate.pendingQty,
        excess: round3(allocated - candidate.pendingQty),
      });
    }
  }

  return problems;
}

/**
 * Recomputes `open` / `partially_returned` / `closed` for the challans a GRN
 * touched. Called after every GRN save or cancel so the register never lies.
 */
export async function refreshChallanStatuses(
  challanIds: (Types.ObjectId | string)[],
  session?: ClientSession,
): Promise<void> {
  await connectDb();

  const ids = [...new Set(challanIds.map((id) => String(id)))].map(
    (id) => new Types.ObjectId(id),
  );
  if (ids.length === 0) return;

  // Must read through the same session: the return note that triggered this
  // refresh is usually still uncommitted.
  const pending = await getPendingChallanLines({
    challanIds: ids,
    includeSettled: true,
    session,
  });
  const pendingByChallan = new Map<string, { total: number; returned: number }>();

  for (const line of pending) {
    const entry = pendingByChallan.get(line.challanId) ?? { total: 0, returned: 0 };
    entry.total += line.sentQty;
    entry.returned += line.returnedQty;
    pendingByChallan.set(line.challanId, entry);
  }

  for (const id of ids) {
    const challan = await JobWorkChallan.findById(id).session(session ?? null);
    if (!challan || challan.status === "cancelled" || challan.status === "draft") continue;

    const totals = pendingByChallan.get(id.toString()) ?? { total: 0, returned: 0 };
    const status =
      totals.returned <= 0
        ? "open"
        : totals.returned >= totals.total
          ? "closed"
          : "partially_returned";

    if (challan.status !== status) {
      challan.status = status;
      await challan.save({ session });
    }
  }
}
