import { connectDb } from "@/db/connect";
import { CompanyProfile, Item, Location, Party, ProcessRoute } from "@/db/models";
import { ensurePlantLocation } from "@/lib/setup";
import type { ItemOption } from "@/app/api/items/route";
import type { PartyType } from "@/lib/constants";

export interface PartyOption {
  _id: string;
  code: string;
  name: string;
  partyType: PartyType;
  gstin?: string;
  stateCode: string;
  addressLines: string[];
  locationId: string | null;
}

export interface CompanyInfo {
  _id: string;
  name: string;
  gstin: string;
  addressLines: string[];
  state: string;
  stateCode: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  challanPrefix: string;
  salesInvoicePrefix: string;
  grnPrefix: string;
}

export async function getCompany(): Promise<CompanyInfo | null> {
  await connectDb();
  const company = await CompanyProfile.findOne().lean();
  if (!company) return null;
  return {
    _id: company._id.toString(),
    name: company.name,
    gstin: company.gstin,
    addressLines: company.addressLines,
    state: company.state,
    stateCode: company.stateCode,
    bankName: company.bankName,
    bankAccount: company.bankAccount,
    bankIfsc: company.bankIfsc,
    challanPrefix: company.challanPrefix,
    salesInvoicePrefix: company.salesInvoicePrefix,
    grnPrefix: company.grnPrefix,
  };
}

/** Parties with their stock location attached, since every document needs both. */
export async function getParties(partyType?: PartyType): Promise<PartyOption[]> {
  await connectDb();

  const filter: Record<string, unknown> = { isActive: true };
  if (partyType) filter.partyType = partyType;

  const [parties, locations] = await Promise.all([
    Party.find(filter).sort({ name: 1 }).lean(),
    Location.find({ partyId: { $ne: null } })
      .select("partyId")
      .lean(),
  ]);

  const locationByParty = new Map(
    locations.map((l) => [l.partyId!.toString(), l._id.toString()]),
  );

  return parties.map((party) => ({
    _id: party._id.toString(),
    code: party.code,
    name: party.name,
    partyType: party.partyType,
    gstin: party.gstin,
    stateCode: party.stateCode,
    addressLines: party.addressLines,
    locationId: locationByParty.get(party._id.toString()) ?? null,
  }));
}

export async function getPlantLocation() {
  const plant = await ensurePlantLocation();
  return { _id: plant._id.toString(), name: plant.name };
}

export async function getItemOptions(types?: string[]): Promise<ItemOption[]> {
  await connectDb();

  const filter: Record<string, unknown> = { isActive: true };
  if (types?.length) filter.itemType = { $in: types };

  const items = await Item.find(filter).sort({ itemCode: 1 }).lean();

  return items.map((item) => ({
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
}

export interface RouteOption {
  _id: string;
  inputItemId: string;
  outputItemId: string;
  outputItemCode: string;
  outputDescription: string;
  partyId: string | null;
  processName: string;
  jobRate: number;
  isConfirmed: boolean;
}

/** Input → output mappings, used to resolve what a return note produced. */
export async function getRoutes(partyId?: string): Promise<RouteOption[]> {
  await connectDb();

  const filter: Record<string, unknown> = { isActive: true };
  if (partyId) filter.$or = [{ partyId }, { partyId: null }];

  const routes = await ProcessRoute.find(filter)
    .populate<{ outputItemId: { _id: string; itemCode: string; description: string } }>(
      "outputItemId",
      "itemCode description",
    )
    .sort({ effectiveFrom: -1 })
    .lean();

  return routes.map((route) => {
    const output = route.outputItemId as unknown as {
      _id: { toString(): string };
      itemCode: string;
      description: string;
    };
    return {
      _id: route._id.toString(),
      inputItemId: route.inputItemId.toString(),
      outputItemId: output._id.toString(),
      outputItemCode: output.itemCode,
      outputDescription: output.description,
      partyId: route.partyId?.toString() ?? null,
      processName: route.processName,
      jobRate: route.jobRate,
      isConfirmed: route.isConfirmed,
    };
  });
}
