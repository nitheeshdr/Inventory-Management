import { Types, type ClientSession } from "mongoose";
import { connectDb } from "@/db/connect";
import { Item, Location, StockMovement } from "@/db/models";
import type { DocType } from "@/lib/constants";
import { round3 } from "@/lib/format";

export interface MovementInput {
  itemId: Types.ObjectId | string;
  locationId: Types.ObjectId | string;
  /** Signed: positive into the location, negative out of it. */
  qty: number;
  docLineId?: Types.ObjectId | string;
  remark?: string;
}

export interface DocRef {
  docType: DocType;
  docId: Types.ObjectId | string;
  docNo: string;
  movementDate: Date;
  partyId?: Types.ObjectId | string | null;
}

const oid = (v: Types.ObjectId | string) =>
  typeof v === "string" ? new Types.ObjectId(v) : v;

/**
 * Writes the ledger rows for a document, replacing any it wrote before so that
 * editing a saved document stays correct without hand-written diffing.
 *
 * Refuses to touch a cancelled document — once reversal rows exist, the document
 * is history and must not be silently resurrected.
 */
export async function postMovements(
  ref: DocRef,
  entries: MovementInput[],
  session?: ClientSession,
): Promise<number> {
  await connectDb();

  const docId = oid(ref.docId);

  const reversalCount = await StockMovement.countDocuments({
    docType: ref.docType,
    docId,
    isReversal: true,
  }).session(session ?? null);

  if (reversalCount > 0) {
    throw new Error(
      `${ref.docNo} has been cancelled; its stock movements cannot be re-posted.`,
    );
  }

  await StockMovement.deleteMany({ docType: ref.docType, docId }).session(session ?? null);

  const rows = entries
    .filter((entry) => round3(entry.qty) !== 0)
    .map((entry) => ({
      movementDate: ref.movementDate,
      itemId: oid(entry.itemId),
      locationId: oid(entry.locationId),
      qty: round3(entry.qty),
      docType: ref.docType,
      docId,
      docNo: ref.docNo,
      docLineId: entry.docLineId ? oid(entry.docLineId) : undefined,
      partyId: ref.partyId ? oid(ref.partyId) : undefined,
      isReversal: false,
      remark: entry.remark,
    }));

  if (rows.length > 0) {
    await StockMovement.insertMany(rows, { session, ordered: true });
  }

  return rows.length;
}

/**
 * Cancels a document's stock effect by appending negated rows rather than
 * deleting the originals, so the ledger keeps showing what happened and when.
 */
export async function reverseMovements(
  ref: Pick<DocRef, "docType" | "docId">,
  reversalDate: Date,
  reason?: string,
  session?: ClientSession,
): Promise<number> {
  await connectDb();

  const docId = oid(ref.docId);

  const existing = await StockMovement.find({
    docType: ref.docType,
    docId,
    isReversal: false,
  })
    .session(session ?? null)
    .lean();

  if (existing.length === 0) return 0;

  const alreadyReversed = await StockMovement.countDocuments({
    docType: ref.docType,
    docId,
    isReversal: true,
  }).session(session ?? null);

  if (alreadyReversed > 0) return 0;

  const rows = existing.map((row) => ({
    movementDate: reversalDate,
    itemId: row.itemId,
    locationId: row.locationId,
    qty: round3(-row.qty),
    docType: row.docType,
    docId: row.docId,
    docNo: row.docNo,
    docLineId: row.docLineId,
    partyId: row.partyId,
    isReversal: true,
    remark: reason ? `Cancelled: ${reason}` : "Cancelled",
  }));

  await StockMovement.insertMany(rows, { session, ordered: true });
  return rows.length;
}

/** Drops every ledger row a document wrote. Only for deleting a draft. */
export async function purgeMovements(
  ref: Pick<DocRef, "docType" | "docId">,
  session?: ClientSession,
): Promise<void> {
  await connectDb();
  await StockMovement.deleteMany({
    docType: ref.docType,
    docId: oid(ref.docId),
  }).session(session ?? null);
}

/* ------------------------------------------------------------- balance reads */

export interface StockBalanceRow {
  itemId: string;
  itemCode: string;
  description: string;
  uom: string;
  hsnCode: string;
  itemType: string;
  standardValue: number;
  reorderLevel: number;
  locationId: string;
  locationName: string;
  locationKind: string;
  partyId: string | null;
  qty: number;
  value: number;
}

export interface StockQuery {
  itemIds?: (Types.ObjectId | string)[];
  locationIds?: (Types.ObjectId | string)[];
  /** Balance as at end of this date; omit for live balance. */
  asOn?: Date;
}

/**
 * Item × location balances, straight out of the ledger. `asOn` simply narrows
 * the date filter, which is why "stock as on any past date" needs no snapshots.
 */
export async function stockOnHand(query: StockQuery = {}): Promise<StockBalanceRow[]> {
  await connectDb();

  const match: Record<string, unknown> = {};
  if (query.itemIds?.length) match.itemId = { $in: query.itemIds.map(oid) };
  if (query.locationIds?.length) match.locationId = { $in: query.locationIds.map(oid) };
  if (query.asOn) {
    const end = new Date(query.asOn);
    end.setHours(23, 59, 59, 999);
    match.movementDate = { $lte: end };
  }

  const rows = await StockMovement.aggregate<{
    _id: { itemId: Types.ObjectId; locationId: Types.ObjectId };
    qty: number;
    item: { itemCode: string; description: string; uom: string; hsnCode: string; itemType: string; standardValue: number; reorderLevel: number };
    location: { name: string; kind: string; partyId?: Types.ObjectId };
  }>([
    { $match: match },
    {
      $group: {
        _id: { itemId: "$itemId", locationId: "$locationId" },
        qty: { $sum: "$qty" },
      },
    },
    {
      $lookup: {
        from: Item.collection.name,
        localField: "_id.itemId",
        foreignField: "_id",
        as: "item",
      },
    },
    {
      $lookup: {
        from: Location.collection.name,
        localField: "_id.locationId",
        foreignField: "_id",
        as: "location",
      },
    },
    { $unwind: "$item" },
    { $unwind: "$location" },
    { $sort: { "item.itemCode": 1, "location.name": 1 } },
  ]);

  return rows.map((row) => ({
    itemId: row._id.itemId.toString(),
    itemCode: row.item.itemCode,
    description: row.item.description,
    uom: row.item.uom,
    hsnCode: row.item.hsnCode,
    itemType: row.item.itemType,
    standardValue: row.item.standardValue ?? 0,
    reorderLevel: row.item.reorderLevel ?? 0,
    locationId: row._id.locationId.toString(),
    locationName: row.location.name,
    locationKind: row.location.kind,
    partyId: row.location.partyId?.toString() ?? null,
    qty: round3(row.qty),
    value: round3(row.qty) * (row.item.standardValue ?? 0),
  }));
}

/** Available quantity of one item at one location. */
export async function availableQty(
  itemId: Types.ObjectId | string,
  locationId: Types.ObjectId | string,
): Promise<number> {
  await connectDb();

  const [row] = await StockMovement.aggregate<{ qty: number }>([
    { $match: { itemId: oid(itemId), locationId: oid(locationId) } },
    { $group: { _id: null, qty: { $sum: "$qty" } } },
  ]);

  return round3(row?.qty ?? 0);
}

export interface ShortfallWarning {
  itemId: string;
  itemCode: string;
  description: string;
  requested: number;
  available: number;
  shortfall: number;
}

/**
 * Reports lines that would push a location negative. Surfaced as a warning
 * rather than a hard block, because opening balances are often entered after
 * the first few documents.
 */
export async function checkAvailability(
  locationId: Types.ObjectId | string,
  requests: { itemId: Types.ObjectId | string; qty: number }[],
  excludeDoc?: Pick<DocRef, "docType" | "docId">,
  session?: ClientSession,
): Promise<ShortfallWarning[]> {
  await connectDb();

  // Rounded on every accumulation, not just at the end — two lines like 0.1
  // and 0.2 summed as raw floats (0.30000000000000004) would read as short
  // against an exact 0.3 balance and wrongly trip the hard block in GRN.
  const wanted = new Map<string, number>();
  for (const req of requests) {
    const key = oid(req.itemId).toString();
    wanted.set(key, round3((wanted.get(key) ?? 0) + req.qty));
  }
  if (wanted.size === 0) return [];

  const itemIds = [...wanted.keys()].map((id) => new Types.ObjectId(id));

  const match: Record<string, unknown> = {
    locationId: oid(locationId),
    itemId: { $in: itemIds },
  };
  // When editing a saved document, ignore what it currently contributes.
  if (excludeDoc) {
    match.$nor = [{ docType: excludeDoc.docType, docId: oid(excludeDoc.docId) }];
  }

  const balances = await StockMovement.aggregate<{ _id: Types.ObjectId; qty: number }>([
    { $match: match },
    { $group: { _id: "$itemId", qty: { $sum: "$qty" } } },
  ]).session(session ?? null);

  const balanceByItem = new Map(balances.map((b) => [b._id.toString(), round3(b.qty)]));
  const items = await Item.find({ _id: { $in: itemIds } })
    .select("itemCode description")
    .lean();
  const itemById = new Map(items.map((i) => [i._id.toString(), i]));

  const warnings: ShortfallWarning[] = [];
  for (const [itemId, requested] of wanted) {
    const available = balanceByItem.get(itemId) ?? 0;
    if (requested > available) {
      const item = itemById.get(itemId);
      warnings.push({
        itemId,
        itemCode: item?.itemCode ?? "?",
        description: item?.description ?? "Unknown item",
        requested: round3(requested),
        available,
        shortfall: round3(requested - available),
      });
    }
  }

  return warnings;
}

export interface LedgerEntry {
  _id: string;
  movementDate: string;
  qty: number;
  balance: number;
  docType: DocType;
  docId: string;
  docNo: string;
  locationId: string;
  locationName: string;
  isReversal: boolean;
  remark?: string;
}

/** Full movement history for one item with a running balance. */
export async function itemLedger(
  itemId: Types.ObjectId | string,
  options: { locationId?: Types.ObjectId | string; limit?: number } = {},
): Promise<LedgerEntry[]> {
  await connectDb();

  const match: Record<string, unknown> = { itemId: oid(itemId) };
  if (options.locationId) match.locationId = oid(options.locationId);

  const rows = await StockMovement.find(match)
    .sort({ movementDate: 1, createdAt: 1 })
    .limit(options.limit ?? 2000)
    .populate<{ locationId: { _id: Types.ObjectId; name: string } }>("locationId", "name")
    .lean();

  // A running balance only makes sense per location, so track one per location.
  const balances = new Map<string, number>();

  return rows.map((row) => {
    const location = row.locationId as unknown as { _id: Types.ObjectId; name: string };
    const key = location._id.toString();
    const balance = round3((balances.get(key) ?? 0) + row.qty);
    balances.set(key, balance);

    return {
      _id: row._id.toString(),
      movementDate: row.movementDate.toISOString(),
      qty: round3(row.qty),
      balance,
      docType: row.docType,
      docId: row.docId.toString(),
      docNo: row.docNo,
      locationId: key,
      locationName: location.name,
      isReversal: row.isReversal,
      remark: row.remark,
    };
  });
}
