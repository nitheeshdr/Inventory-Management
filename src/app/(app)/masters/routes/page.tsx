import { Types } from "mongoose";
import { connectDb } from "@/db/connect";
import { Item, Party, ProcessRoute } from "@/db/models";
import { getItemOptions, getParties } from "@/lib/queries/masters";
import { RoutesClient, type RouteRow } from "./routes-client";

export const dynamic = "force-dynamic";

export default async function RoutesMasterPage() {
  await connectDb();

  const routes = await ProcessRoute.find({ isActive: true })
    .sort({ effectiveFrom: -1 })
    .lean();

  const itemIds = routes.flatMap((route) => [route.inputItemId, route.outputItemId]);
  const partyIds = routes
    .map((route) => route.partyId)
    .filter((id): id is Types.ObjectId => Boolean(id));

  const [routeItems, routeParties, items, parties] = await Promise.all([
    Item.find({ _id: { $in: itemIds } })
      .select("itemCode description")
      .lean(),
    Party.find({ _id: { $in: partyIds } })
      .select("name")
      .lean(),
    getItemOptions(),
    getParties("customer"),
  ]);

  const itemById = new Map(routeItems.map((item) => [item._id.toString(), item]));
  const partyById = new Map(routeParties.map((party) => [party._id.toString(), party]));

  const rows: RouteRow[] = routes.map((route) => {
    const input = itemById.get(route.inputItemId.toString());
    const output = itemById.get(route.outputItemId.toString());
    const party = route.partyId ? partyById.get(route.partyId.toString()) : null;

    return {
      _id: route._id.toString(),
      inputItemId: route.inputItemId.toString(),
      inputItemCode: input?.itemCode ?? "—",
      inputDescription: input?.description ?? "",
      outputItemId: route.outputItemId.toString(),
      outputItemCode: output?.itemCode ?? "—",
      outputDescription: output?.description ?? "",
      partyId: route.partyId?.toString() ?? null,
      partyName: party?.name ?? null,
      processName: route.processName,
      jobRate: route.jobRate,
      serviceHsn: route.serviceHsn,
      serviceGstRate: route.serviceGstRate,
      effectiveFrom: route.effectiveFrom.toISOString(),
      isConfirmed: route.isConfirmed,
      notes: route.notes ?? "",
    };
  });

  return <RoutesClient rows={rows} items={items} parties={parties} />;
}
