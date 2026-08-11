import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  ITEM_TYPES,
  LOCATION_KINDS,
  PARTY_TYPES,
  SERVICE_GST_RATE,
  SERVICE_HSN,
  UOMS,
  type ItemType,
  type LocationKind,
  type PartyType,
} from "@/lib/constants";

/* ------------------------------------------------------------------ company */

export interface CompanyProfileDoc {
  _id: Types.ObjectId;
  name: string;
  gstin: string;
  addressLines: string[];
  state: string;
  stateCode: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  challanPrefix: string;
  salesInvoicePrefix: string;
  grnPrefix: string;
}

const companyProfileSchema = new Schema<CompanyProfileDoc>(
  {
    name: { type: String, required: true },
    // Blank until the office fills in Masters → Company. The save form requires
    // it; the schema must not, or first run can't create the record to edit.
    gstin: { type: String, default: "" },
    addressLines: { type: [String], default: [] },
    state: { type: String, default: "Andhra Pradesh" },
    stateCode: { type: String, default: "37" },
    phone: String,
    email: String,
    bankName: String,
    bankAccount: String,
    bankIfsc: String,
    challanPrefix: { type: String, default: "JW" },
    salesInvoicePrefix: { type: String, default: "HH" },
    grnPrefix: { type: String, default: "GRN" },
  },
  { timestamps: true, collection: "company_profile" },
);

export const CompanyProfile: Model<CompanyProfileDoc> =
  models.CompanyProfile ?? model<CompanyProfileDoc>("CompanyProfile", companyProfileSchema);

/* ------------------------------------------------------------------ parties */

export interface PartyDoc {
  _id: Types.ObjectId;
  code: string;
  name: string;
  partyType: PartyType;
  gstin?: string;
  addressLines: string[];
  state: string;
  stateCode: string;
  contactName?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

const partySchema = new Schema<PartyDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    partyType: { type: String, enum: PARTY_TYPES, required: true },
    gstin: { type: String, uppercase: true, trim: true },
    addressLines: { type: [String], default: [] },
    state: { type: String, default: "Andhra Pradesh" },
    stateCode: { type: String, default: "37" },
    contactName: String,
    phone: String,
    email: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "parties" },
);

partySchema.index({ partyType: 1, name: 1 });

export const Party: Model<PartyDoc> = models.Party ?? model<PartyDoc>("Party", partySchema);

/* ---------------------------------------------------------------- locations */

export interface LocationDoc {
  _id: Types.ObjectId;
  name: string;
  kind: LocationKind;
  partyId?: Types.ObjectId;
  isActive: boolean;
}

const locationSchema = new Schema<LocationDoc>(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: LOCATION_KINDS, required: true },
    // A job-worker location is how "stock lying at the vendor" becomes a real balance.
    partyId: { type: Schema.Types.ObjectId, ref: "Party", index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "locations" },
);

locationSchema.index({ kind: 1, name: 1 });

export const Location: Model<LocationDoc> =
  models.Location ?? model<LocationDoc>("Location", locationSchema);

/* -------------------------------------------------------------------- items */

export interface ItemDoc {
  _id: Types.ObjectId;
  itemCode: string;
  description: string;
  hsnCode: string;
  uom: string;
  itemType: ItemType;
  /** Per-piece value declared on job-work challans (not a selling price). */
  standardValue: number;
  gstRate: number;
  reorderLevel: number;
  isActive: boolean;
}

const itemSchema = new Schema<ItemDoc>(
  {
    itemCode: { type: String, required: true, unique: true, trim: true },
    description: { type: String, required: true, trim: true },
    hsnCode: { type: String, default: "" },
    uom: { type: String, enum: UOMS, default: "PC" },
    itemType: { type: String, enum: ITEM_TYPES, default: "component" },
    standardValue: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, default: 18, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "items" },
);

itemSchema.index({ description: "text", itemCode: "text" });

export const Item: Model<ItemDoc> = models.Item ?? model<ItemDoc>("Item", itemSchema);

/* ----------------------------------------------------------- process routes */

export interface ProcessRouteDoc {
  _id: Types.ObjectId;
  inputItemId: Types.ObjectId;
  outputItemId: Types.ObjectId;
  /** null = the route applies to any job worker. */
  partyId?: Types.ObjectId;
  processName: string;
  jobRate: number;
  serviceHsn: string;
  serviceGstRate: number;
  effectiveFrom: Date;
  /** Routes inferred from scanned paperwork start unconfirmed. */
  isConfirmed: boolean;
  isActive: boolean;
  notes?: string;
}

const processRouteSchema = new Schema<ProcessRouteDoc>(
  {
    inputItemId: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    outputItemId: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    partyId: { type: Schema.Types.ObjectId, ref: "Party", index: true },
    processName: { type: String, required: true, trim: true },
    jobRate: { type: Number, required: true, min: 0 },
    serviceHsn: { type: String, default: SERVICE_HSN },
    serviceGstRate: { type: Number, default: SERVICE_GST_RATE },
    effectiveFrom: { type: Date, default: () => new Date() },
    isConfirmed: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    notes: String,
  },
  { timestamps: true, collection: "process_routes" },
);

processRouteSchema.index({ inputItemId: 1, partyId: 1, effectiveFrom: -1 });

export const ProcessRoute: Model<ProcessRouteDoc> =
  models.ProcessRoute ?? model<ProcessRouteDoc>("ProcessRoute", processRouteSchema);
