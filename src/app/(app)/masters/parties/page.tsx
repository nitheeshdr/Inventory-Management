import { connectDb } from "@/db/connect";
import { Party } from "@/db/models";
import { PartiesClient, type PartyRow } from "./parties-client";

export const dynamic = "force-dynamic";

export default async function PartiesMasterPage() {
  await connectDb();
  const parties = await Party.find().sort({ partyType: 1, name: 1 }).lean();

  const rows: PartyRow[] = parties.map((party) => ({
    _id: party._id.toString(),
    code: party.code,
    name: party.name,
    partyType: party.partyType,
    gstin: party.gstin ?? "",
    addressLines: party.addressLines,
    state: party.state,
    stateCode: party.stateCode,
    contactName: party.contactName ?? "",
    phone: party.phone ?? "",
    email: party.email ?? "",
    isActive: party.isActive,
  }));

  return <PartiesClient rows={rows} />;
}
