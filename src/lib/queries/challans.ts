import { connectDb } from "@/db/connect";
import { JobWorkChallan, Party } from "@/db/models";
import { getPendingChallanLines } from "@/lib/allocation";
import { daysBetween, round3 } from "@/lib/format";
import type { DocStatus } from "@/lib/constants";

export interface ChallanRegisterRow {
  _id: string;
  challanNo: string;
  challanDate: string;
  dueDate: string;
  partyName: string;
  lineCount: number;
  sentQty: number;
  returnedQty: number;
  pendingQty: number;
  pendingValue: number;
  totalTaxable: number;
  status: DocStatus;
  daysOpen: number;
}

/** The outward register: one row per challan with live return progress. */
export async function getChallanRegister(options: {
  partyId?: string;
  status?: DocStatus;
  from?: Date;
  to?: Date;
} = {}): Promise<ChallanRegisterRow[]> {
  await connectDb();

  const filter: Record<string, unknown> = {};
  if (options.partyId) filter.partyId = options.partyId;
  if (options.status) filter.status = options.status;
  if (options.from || options.to) {
    filter.challanDate = {
      ...(options.from ? { $gte: options.from } : {}),
      ...(options.to ? { $lte: options.to } : {}),
    };
  }

  const [challans, parties] = await Promise.all([
    JobWorkChallan.find(filter).sort({ challanDate: -1, challanNo: -1 }).lean(),
    Party.find().select("name").lean(),
  ]);

  const partyName = new Map(parties.map((p) => [p._id.toString(), p.name]));

  const pendingLines = await getPendingChallanLines({
    challanIds: challans.map((c) => c._id),
    includeSettled: true,
  });

  const progress = new Map<string, { returned: number; pending: number; value: number }>();
  for (const line of pendingLines) {
    const entry = progress.get(line.challanId) ?? { returned: 0, pending: 0, value: 0 };
    entry.returned += line.returnedQty;
    entry.pending += Math.max(line.pendingQty, 0);
    entry.value += Math.max(line.pendingValue, 0);
    progress.set(line.challanId, entry);
  }

  return challans.map((challan) => {
    const id = challan._id.toString();
    const stats = progress.get(id) ?? { returned: 0, pending: 0, value: 0 };
    const sentQty = round3(challan.lines.reduce((total, line) => total + line.qty, 0));

    return {
      _id: id,
      challanNo: challan.challanNo,
      challanDate: challan.challanDate.toISOString(),
      dueDate: challan.dueDate.toISOString(),
      partyName: partyName.get(challan.partyId.toString()) ?? "—",
      lineCount: challan.lines.length,
      sentQty,
      returnedQty: round3(stats.returned),
      pendingQty: challan.status === "cancelled" ? 0 : round3(stats.pending),
      pendingValue: challan.status === "cancelled" ? 0 : round3(stats.value),
      totalTaxable: challan.totalTaxable,
      status: challan.status,
      daysOpen: daysBetween(challan.challanDate),
    };
  });
}
