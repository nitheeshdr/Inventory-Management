import { connectDb } from "@/db/connect";
import { Item, Location } from "@/db/models";
import { stockOnHand, type StockBalanceRow } from "@/lib/ledger";
import { round3 } from "@/lib/format";

export interface LocationOption {
  _id: string;
  name: string;
  kind: string;
}

/** One row per item, with the per-location split the office thinks in. */
export interface ItemStockRow {
  itemId: string;
  itemCode: string;
  description: string;
  uom: string;
  itemType: string;
  standardValue: number;
  reorderLevel: number;
  plantQty: number;
  offSiteQty: number;
  totalQty: number;
  totalValue: number;
  byLocation: { locationId: string; locationName: string; kind: string; qty: number }[];
  isBelowReorder: boolean;
}

export async function getLocations(): Promise<LocationOption[]> {
  await connectDb();
  const locations = await Location.find({ isActive: true }).sort({ kind: 1, name: 1 }).lean();
  return locations.map((l) => ({ _id: l._id.toString(), name: l.name, kind: l.kind }));
}

/**
 * Every item that has ever moved, plus items that never have (so a newly added
 * code still shows up at zero rather than vanishing from the list).
 */
export async function getItemStock(asOn?: Date): Promise<ItemStockRow[]> {
  await connectDb();

  const [balances, items] = await Promise.all([
    stockOnHand(asOn ? { asOn } : {}),
    Item.find({ isActive: true }).sort({ itemCode: 1 }).lean(),
  ]);

  const byItem = new Map<string, StockBalanceRow[]>();
  for (const row of balances) {
    const bucket = byItem.get(row.itemId);
    if (bucket) bucket.push(row);
    else byItem.set(row.itemId, [row]);
  }

  return items.map((item) => {
    const rows = byItem.get(item._id.toString()) ?? [];

    const plantQty = round3(
      rows.filter((r) => r.locationKind === "plant").reduce((total, r) => total + r.qty, 0),
    );
    const offSiteQty = round3(
      rows.filter((r) => r.locationKind !== "plant").reduce((total, r) => total + r.qty, 0),
    );
    const totalQty = round3(rows.reduce((total, r) => total + r.qty, 0));

    return {
      itemId: item._id.toString(),
      itemCode: item.itemCode,
      description: item.description,
      uom: item.uom,
      itemType: item.itemType,
      standardValue: item.standardValue,
      reorderLevel: item.reorderLevel,
      plantQty,
      offSiteQty,
      totalQty,
      totalValue: round3(totalQty * item.standardValue),
      byLocation: rows.map((r) => ({
        locationId: r.locationId,
        locationName: r.locationName,
        kind: r.locationKind,
        qty: r.qty,
      })),
      isBelowReorder: item.reorderLevel > 0 && plantQty < item.reorderLevel,
    };
  });
}
