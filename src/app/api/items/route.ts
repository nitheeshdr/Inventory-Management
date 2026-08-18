import { NextResponse } from "next/server";
import { connectDb } from "@/db/connect";
import { Item } from "@/db/models";
import type { ItemType } from "@/lib/constants";

export interface ItemOption {
  _id: string;
  itemCode: string;
  description: string;
  hsnCode: string;
  uom: string;
  itemType: ItemType;
  standardValue: number;
  gstRate: number;
  isFoc: boolean;
}

/** Feeds the item picker in every line grid. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const types = url.searchParams.get("types")?.split(",").filter(Boolean);

  await connectDb();

  const filter: Record<string, unknown> = { isActive: true };
  if (types?.length) filter.itemType = { $in: types };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ itemCode: rx }, { description: rx }];
  }

  const items = await Item.find(filter).sort({ itemCode: 1 }).limit(50).lean();

  const options: ItemOption[] = items.map((item) => ({
    _id: item._id.toString(),
    itemCode: item.itemCode,
    description: item.description,
    hsnCode: item.hsnCode,
    uom: item.uom,
    itemType: item.itemType,
    standardValue: item.standardValue,
    gstRate: item.gstRate,
    isFoc: item.isFoc,
  }));

  return NextResponse.json({ items: options });
}
