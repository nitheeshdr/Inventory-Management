import { connectDb } from "@/db/connect";
import { Item } from "@/db/models";
import { ItemsClient, type ItemRow } from "./items-client";

export const dynamic = "force-dynamic";

export default async function ItemsMasterPage() {
  await connectDb();
  const items = await Item.find().sort({ itemCode: 1 }).lean();

  const rows: ItemRow[] = items.map((item) => ({
    _id: item._id.toString(),
    itemCode: item.itemCode,
    description: item.description,
    hsnCode: item.hsnCode,
    uom: item.uom,
    itemType: item.itemType,
    standardValue: item.standardValue,
    gstRate: item.gstRate,
    reorderLevel: item.reorderLevel,
    isActive: item.isActive,
    isFoc: item.isFoc,
  }));

  return <ItemsClient rows={rows} />;
}
