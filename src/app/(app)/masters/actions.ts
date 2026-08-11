"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/db/connect";
import { CompanyProfile, Item, Location, Party, ProcessRoute } from "@/db/models";
import { ITEM_TYPES, PARTY_TYPES, SERVICE_GST_RATE, SERVICE_HSN, UOMS } from "@/lib/constants";
import { isValidGstin, stateCodeFromGstin } from "@/lib/gst";
import type { ActionResult } from "@/app/(app)/challans/actions";

function zodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".")] = issue.message;
  return fieldErrors;
}

/* -------------------------------------------------------------------- items */

const itemSchema = z.object({
  itemCode: z.string().trim().min(1, "Item code is required"),
  description: z.string().trim().min(1, "Description is required"),
  hsnCode: z.string().trim().default(""),
  uom: z.enum(UOMS).default("PC"),
  itemType: z.enum(ITEM_TYPES).default("component"),
  standardValue: z.number().min(0).default(0),
  gstRate: z.number().min(0).max(28).default(18),
  reorderLevel: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

export type ItemInput = z.input<typeof itemSchema>;

export async function saveItem(
  input: ItemInput,
  itemId?: string,
): Promise<ActionResult<{ _id: string }>> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodErrors(parsed.error) };
  }

  await connectDb();

  const duplicate = await Item.findOne({
    itemCode: parsed.data.itemCode,
    ...(itemId ? { _id: { $ne: new Types.ObjectId(itemId) } } : {}),
  }).lean();
  if (duplicate) {
    return {
      ok: false,
      error: `Item code ${parsed.data.itemCode} already exists.`,
      fieldErrors: { itemCode: "Already used" },
    };
  }

  const saved = itemId
    ? await Item.findByIdAndUpdate(itemId, parsed.data, { new: true })
    : await Item.create(parsed.data);

  if (!saved) return { ok: false, error: "Could not save the item." };

  revalidatePath("/masters/items");
  revalidatePath("/stock");

  return { ok: true, data: { _id: saved._id.toString() } };
}

/* ------------------------------------------------------------------ parties */

const partySchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  name: z.string().trim().min(1, "Name is required"),
  partyType: z.enum(PARTY_TYPES),
  gstin: z.string().trim().optional(),
  addressLines: z.string().optional(),
  state: z.string().trim().default("Andhra Pradesh"),
  stateCode: z.string().trim().default("37"),
  contactName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  isActive: z.boolean().default(true),
});

export type PartyInput = z.input<typeof partySchema>;

/**
 * Saving a job worker also creates their stock location, which is what makes
 * "lying with the vendor" a real balance rather than a report calculation.
 */
export async function saveParty(
  input: PartyInput,
  partyId?: string,
): Promise<ActionResult<{ _id: string }>> {
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodErrors(parsed.error) };
  }
  const data = parsed.data;

  if (data.gstin && !isValidGstin(data.gstin)) {
    return {
      ok: false,
      error: "That GSTIN doesn't look valid.",
      fieldErrors: { gstin: "Expected 15 characters, e.g. 37ALAPP4700H1ZB" },
    };
  }

  await connectDb();

  const duplicate = await Party.findOne({
    code: data.code.toUpperCase(),
    ...(partyId ? { _id: { $ne: new Types.ObjectId(partyId) } } : {}),
  }).lean();
  if (duplicate) {
    return {
      ok: false,
      error: `Party code ${data.code} already exists.`,
      fieldErrors: { code: "Already used" },
    };
  }

  const payload = {
    ...data,
    // The first two digits of a GSTIN are the state code — trust them over
    // whatever was typed in the state field.
    stateCode: (data.gstin && stateCodeFromGstin(data.gstin)) || data.stateCode,
    addressLines: (data.addressLines ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };

  const saved = partyId
    ? await Party.findByIdAndUpdate(partyId, payload, { new: true })
    : await Party.create(payload);

  if (!saved) return { ok: false, error: "Could not save the party." };

  if (saved.partyType === "job_worker") {
    await Location.findOneAndUpdate(
      { partyId: saved._id },
      { $set: { name: `At ${saved.name}`, kind: "job_worker", partyId: saved._id } },
      { upsert: true },
    );
  }

  revalidatePath("/masters/parties");

  return { ok: true, data: { _id: saved._id.toString() } };
}

/* ------------------------------------------------------------ process routes */

const routeSchema = z.object({
  inputItemId: z.string().min(1, "Pick the item sent out"),
  outputItemId: z.string().min(1, "Pick the item that comes back"),
  partyId: z.string().optional(),
  processName: z.string().trim().min(1, "Name the process"),
  jobRate: z.number().min(0),
  serviceHsn: z.string().trim().default(SERVICE_HSN),
  serviceGstRate: z.number().min(0).max(28).default(SERVICE_GST_RATE),
  effectiveFrom: z.string().min(1),
  isConfirmed: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: z.string().trim().optional(),
});

export type RouteInput = z.input<typeof routeSchema>;

export async function saveRoute(
  input: RouteInput,
  routeId?: string,
): Promise<ActionResult<{ _id: string }>> {
  const parsed = routeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodErrors(parsed.error) };
  }
  const data = parsed.data;

  if (data.inputItemId === data.outputItemId) {
    return {
      ok: false,
      error: "A process must change the item code — input and output cannot be the same.",
    };
  }

  await connectDb();

  const payload = {
    ...data,
    partyId: data.partyId ? new Types.ObjectId(data.partyId) : undefined,
    inputItemId: new Types.ObjectId(data.inputItemId),
    outputItemId: new Types.ObjectId(data.outputItemId),
    effectiveFrom: new Date(data.effectiveFrom),
  };

  const saved = routeId
    ? await ProcessRoute.findByIdAndUpdate(routeId, payload, { new: true })
    : await ProcessRoute.create(payload);

  if (!saved) return { ok: false, error: "Could not save the route." };

  revalidatePath("/masters/routes");

  return { ok: true, data: { _id: saved._id.toString() } };
}

export async function deleteRoute(routeId: string): Promise<ActionResult> {
  await connectDb();
  await ProcessRoute.findByIdAndUpdate(routeId, { isActive: false });
  revalidatePath("/masters/routes");
  return { ok: true, data: undefined };
}

/* ------------------------------------------------------------------ company */

const companySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  gstin: z.string().trim().min(1, "GSTIN is required"),
  addressLines: z.string().optional(),
  state: z.string().trim().default("Andhra Pradesh"),
  stateCode: z.string().trim().default("37"),
  bankName: z.string().trim().optional(),
  bankAccount: z.string().trim().optional(),
  bankIfsc: z.string().trim().optional(),
  challanPrefix: z.string().trim().default("JW"),
  salesInvoicePrefix: z.string().trim().default("HH"),
  grnPrefix: z.string().trim().default("GRN"),
});

export type CompanyInput = z.input<typeof companySchema>;

export async function saveCompany(input: CompanyInput): Promise<ActionResult> {
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodErrors(parsed.error) };
  }
  const data = parsed.data;

  await connectDb();

  await CompanyProfile.findOneAndUpdate(
    {},
    {
      $set: {
        ...data,
        stateCode: stateCodeFromGstin(data.gstin) ?? data.stateCode,
        addressLines: (data.addressLines ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      },
    },
    { upsert: true },
  );

  revalidatePath("/masters/company");
  revalidatePath("/", "layout");

  return { ok: true, data: undefined };
}
