import type { Model } from "mongoose";
import { connectDb } from "@/db/connect";
import { financialYear } from "@/lib/format";

/**
 * Next number in a `PREFIX/FY/NNNN` series, e.g. `GRN/26-27/0007`.
 *
 * Derived from the highest existing number rather than a counter document, so
 * restoring a backup or importing history can't leave the counter behind. The
 * challan series is deliberately *not* generated here — those numbers come from
 * the existing plant software and are typed in by hand.
 */
export async function nextDocNumber<T>(
  model: Model<T>,
  field: string,
  prefix: string,
  onDate: Date = new Date(),
): Promise<string> {
  await connectDb();

  const fy = financialYear(onDate);
  const seriesPrefix = `${prefix}/${fy}/`;

  const latest = await model
    .findOne({ [field]: { $regex: `^${seriesPrefix.replace(/\//g, "\\/")}` } } as never)
    .sort({ [field]: -1 })
    .select(field)
    .lean();

  const lastValue = latest
    ? String((latest as Record<string, unknown>)[field] ?? "")
    : "";
  const lastSeq = Number.parseInt(lastValue.slice(seriesPrefix.length), 10);
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;

  return `${seriesPrefix}${String(next).padStart(4, "0")}`;
}
