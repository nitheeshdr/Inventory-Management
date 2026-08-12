import { connectDb } from "@/db/connect";
import { Party, PurchaseInvoice, StockMovement } from "@/db/models";
import { stockOnHand } from "@/lib/ledger";
import { getPendingChallanLines, type PendingChallanLine } from "@/lib/allocation";
import { AGING_BUCKETS, DOC_TYPE_LABELS, type DocType } from "@/lib/constants";
import { round3 } from "@/lib/format";

export interface DashboardData {
  plantQty: number;
  plantValue: number;
  offSiteQty: number;
  pendingValue: number;
  openChallans: number;
  overdueLines: number;
  nearDeadlineLines: number;
  unverifiedBills: number;
  aging: { key: string; label: string; qty: number; value: number; lines: number }[];
  heldPerCustomer: { partyId: string; partyName: string; qty: number; value: number; oldestDays: number }[];
  urgent: PendingChallanLine[];
  recentMovements: {
    _id: string;
    date: string;
    itemCode: string;
    description: string;
    locationName: string;
    qty: number;
    docType: DocType;
    docTypeLabel: string;
    docNo: string;
    docId: string;
  }[];
  lowStock: { itemId: string; itemCode: string; description: string; qty: number; reorderLevel: number }[];
}

export async function getDashboard(): Promise<DashboardData> {
  await connectDb();

  const [balances, pending, parties, unverifiedBills, movements] = await Promise.all([
    stockOnHand(),
    getPendingChallanLines(),
    Party.find({ partyType: "customer" }).select("name").lean(),
    PurchaseInvoice.countDocuments({ status: { $in: ["draft", "flagged"] } }),
    StockMovement.find()
      .sort({ createdAt: -1 })
      .limit(12)
      .populate<{ itemId: { _id: string; itemCode: string; description: string } }>(
        "itemId",
        "itemCode description",
      )
      .populate<{ locationId: { _id: string; name: string } }>("locationId", "name")
      .lean(),
  ]);

  const partyName = new Map(parties.map((p) => [p._id.toString(), p.name]));

  const plant = balances.filter((row) => row.locationKind === "plant");
  const offSite = balances.filter((row) => row.locationKind !== "plant");

  /* ------------------------------------------------------------ aging */

  const aging = AGING_BUCKETS.map((bucket) => {
    const lines = pending.filter(
      (line) => line.daysOpen >= bucket.min && line.daysOpen <= bucket.max,
    );
    return {
      key: bucket.key,
      label: bucket.label,
      lines: lines.length,
      qty: round3(lines.reduce((total, line) => total + line.pendingQty, 0)),
      value: round3(lines.reduce((total, line) => total + line.pendingValue, 0)),
    };
  });

  /* ------------------------------------------------- vendor breakdown */

  const customerMap = new Map<string, { qty: number; value: number; oldestDays: number }>();
  for (const line of pending) {
    const entry = customerMap.get(line.partyId) ?? { qty: 0, value: 0, oldestDays: 0 };
    entry.qty += line.pendingQty;
    entry.value += line.pendingValue;
    entry.oldestDays = Math.max(entry.oldestDays, line.daysOpen);
    customerMap.set(line.partyId, entry);
  }

  const heldPerCustomer = [...customerMap.entries()]
    .map(([partyId, stats]) => ({
      partyId,
      partyName: partyName.get(partyId) ?? "—",
      qty: round3(stats.qty),
      value: round3(stats.value),
      oldestDays: stats.oldestDays,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    plantQty: round3(plant.reduce((total, row) => total + row.qty, 0)),
    plantValue: round3(plant.reduce((total, row) => total + row.value, 0)),
    offSiteQty: round3(offSite.reduce((total, row) => total + row.qty, 0)),
    pendingValue: round3(pending.reduce((total, line) => total + line.pendingValue, 0)),
    openChallans: new Set(pending.map((line) => line.challanId)).size,
    overdueLines: pending.filter((line) => line.isOverdue).length,
    nearDeadlineLines: pending.filter(
      (line) => !line.isOverdue && line.daysToDeadline <= 65,
    ).length,
    unverifiedBills,
    aging,
    heldPerCustomer,
    // What the office should chase first: closest to the one-year deadline.
    urgent: [...pending].sort((a, b) => b.daysOpen - a.daysOpen).slice(0, 8),
    recentMovements: movements.map((movement) => {
      const item = movement.itemId as unknown as {
        _id: { toString(): string };
        itemCode: string;
        description: string;
      };
      const location = movement.locationId as unknown as { name: string };
      return {
        _id: movement._id.toString(),
        date: movement.movementDate.toISOString(),
        itemCode: item?.itemCode ?? "—",
        description: item?.description ?? "",
        locationName: location?.name ?? "—",
        qty: movement.qty,
        docType: movement.docType,
        docTypeLabel: DOC_TYPE_LABELS[movement.docType],
        docNo: movement.docNo,
        docId: movement.docId.toString(),
      };
    }),
    lowStock: plant
      .filter((row) => row.reorderLevel > 0 && row.qty < row.reorderLevel)
      .sort((a, b) => a.qty / (a.reorderLevel || 1) - b.qty / (b.reorderLevel || 1))
      .slice(0, 8)
      .map((row) => ({
        itemId: row.itemId,
        itemCode: row.itemCode,
        description: row.description,
        qty: row.qty,
        reorderLevel: row.reorderLevel,
      })),
  };
}
