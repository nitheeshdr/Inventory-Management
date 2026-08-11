import { connectDb } from "@/db/connect";
import { Party, Location, ProcessRoute } from "@/db/models";
import { JobWorkersClient, type JobWorkerRow } from "./job-workers-client";

export const dynamic = "force-dynamic";

export default async function JobWorkersMasterPage() {
  await connectDb();

  const [workers, locations, routes] = await Promise.all([
    Party.find({ partyType: "job_worker" }).sort({ code: 1, name: 1 }).lean(),
    Location.find({ kind: "job_worker" }).lean(),
    ProcessRoute.find({ isActive: true }).lean(),
  ]);

  const locationMap = new Map<string, string>();
  for (const loc of locations) {
    if (loc.partyId) {
      locationMap.set(loc.partyId.toString(), loc.name);
    }
  }

  const routeCountMap = new Map<string, number>();
  for (const route of routes) {
    if (route.partyId) {
      const pid = route.partyId.toString();
      routeCountMap.set(pid, (routeCountMap.get(pid) ?? 0) + 1);
    }
  }

  const rows: JobWorkerRow[] = workers.map((w) => ({
    _id: w._id.toString(),
    code: w.code,
    name: w.name,
    partyType: "job_worker",
    gstin: w.gstin ?? "",
    pan: w.pan ?? (w.gstin && w.gstin.length === 15 ? w.gstin.substring(2, 12) : ""),
    addressLines: w.addressLines ?? [],
    state: w.state ?? "Andhra Pradesh",
    stateCode: w.stateCode ?? "37",
    contactName: w.contactName ?? "",
    phone: w.phone ?? "",
    email: w.email ?? "",
    bankName: w.bankName ?? "",
    bankAccount: w.bankAccount ?? "",
    bankIfsc: w.bankIfsc ?? "",
    notes: w.notes ?? "",
    isActive: w.isActive ?? true,
    locationName: locationMap.get(w._id.toString()) ?? `At ${w.name}`,
    routeCount: routeCountMap.get(w._id.toString()) ?? 0,
  }));

  return <JobWorkersClient rows={rows} />;
}
