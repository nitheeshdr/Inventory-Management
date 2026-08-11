import type { ClientSession } from "mongoose";
import { connectDb } from "@/db/connect";
import { CompanyProfile, Item, Location, Party, type LocationDoc } from "@/db/models";

/**
 * The app starts with an empty database — every item, party and document is
 * entered by hand. Two records are configuration rather than data, so they are
 * created on demand instead of being seeded:
 *
 *  - the plant location, which the stock ledger posts against
 *  - the company profile, which prints on every document
 *
 * Nothing here invents business data: no items, parties, stock or documents.
 */
export async function ensurePlantLocation(session?: ClientSession): Promise<LocationDoc> {
  await connectDb();

  const existing = await Location.findOne({ kind: "plant" })
    .session(session ?? null)
    .lean();
  if (existing) return existing;

  const [created] = await Location.create([{ name: "Sri City Factory", kind: "plant" }], {
    session,
  });
  return created.toObject();
}

/**
 * The plant's own letterhead, taken from its printed challan. This is fixed
 * configuration rather than sample data, and it is editable at
 * Masters → Company.
 */
export const COMPANY_DEFAULTS: {
  name: string;
  gstin: string;
  addressLines: string[];
  state: string;
  stateCode: string;
} = {
  name: "HAMILTON HOUSEWARES PVT LTD",
  gstin: "37AABCD1683Q3Z3",
  addressLines: [
    "FACTORY : PLOT NO. 755, CHIGURUPALEM ROAD",
    "SATYAVEDU MANDAL, SRI CITY",
    "CHITTOOR 517646",
  ],
  state: "Andhra Pradesh",
  stateCode: "37",
};

export async function ensureCompanyProfile() {
  await connectDb();

  const existing = await CompanyProfile.findOne().lean();
  if (existing) return existing;

  const created = await CompanyProfile.create({ ...COMPANY_DEFAULTS });
  return created.toObject();
}

export interface SetupState {
  hasCompany: boolean;
  hasItems: boolean;
  hasJobWorkers: boolean;
  hasCustomers: boolean;
  isReady: boolean;
}

/**
 * What the office still has to fill in before documents can be raised. Drives
 * the setup checklist on the dashboard and the guards on the entry screens.
 */
export async function getSetupState(): Promise<SetupState> {
  await connectDb();

  const [company, items, jobWorkers, customers] = await Promise.all([
    CompanyProfile.findOne().select("gstin").lean(),
    Item.countDocuments({ isActive: true }),
    Party.countDocuments({ partyType: "job_worker", isActive: true }),
    Party.countDocuments({ partyType: "customer", isActive: true }),
  ]);

  const hasCompany = Boolean(company?.gstin);
  const hasItems = items > 0;
  const hasJobWorkers = jobWorkers > 0;

  return {
    hasCompany,
    hasItems,
    hasJobWorkers,
    hasCustomers: customers > 0,
    // Enough to raise a job-work challan, which is the first real document.
    isReady: hasCompany && hasItems && hasJobWorkers,
  };
}
