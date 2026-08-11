import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  DOC_STATUSES,
  GRN_LINE_KINDS,
  INVOICE_STATUSES,
  SERVICE_GST_RATE,
  SERVICE_HSN,
  type DocStatus,
  type GrnLineKind,
  type InvoiceStatus,
} from "@/lib/constants";

/**
 * Lines are embedded subdocuments: they are never queried without their parent,
 * and embedding keeps a document's print output atomic. Item code and
 * description are snapshotted onto each line so a reprint years later shows what
 * was actually issued, even if the item master has since been edited.
 */

/* ---------------------------------------------------- job work outward challan */

export interface ChallanLine {
  _id: Types.ObjectId;
  srNo: number;
  itemId: Types.ObjectId;
  itemCode: string;
  description: string;
  hsnCode: string;
  qty: number;
  uom: string;
  rate: number;
  taxableValue: number;
}

export interface JobWorkChallanDoc {
  _id: Types.ObjectId;
  challanNo: string;
  challanDate: Date;
  partyId: Types.ObjectId;
  fromLocationId: Types.ObjectId;
  toLocationId: Types.ObjectId;
  ewayBillNo?: string;
  vehicleNo?: string;
  transportPo?: string;
  natureOfProcess?: string;
  expectedDuration?: string;
  lines: ChallanLine[];
  totalTaxable: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalValue: number;
  /** challanDate + 1 year — the GST deadline for goods to come back. */
  dueDate: Date;
  status: DocStatus;
  notes?: string;
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const challanLineSchema = new Schema<ChallanLine>({
  srNo: { type: Number, required: true },
  itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
  itemCode: { type: String, required: true },
  description: { type: String, required: true },
  hsnCode: { type: String, default: "" },
  qty: { type: Number, required: true, min: 0 },
  uom: { type: String, default: "PC" },
  rate: { type: Number, default: 0, min: 0 },
  taxableValue: { type: Number, default: 0, min: 0 },
});

const jobWorkChallanSchema = new Schema<JobWorkChallanDoc>(
  {
    challanNo: { type: String, required: true, unique: true, trim: true },
    challanDate: { type: Date, required: true },
    partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true, index: true },
    fromLocationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    toLocationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    ewayBillNo: String,
    vehicleNo: String,
    transportPo: String,
    natureOfProcess: String,
    expectedDuration: String,
    lines: { type: [challanLineSchema], default: [] },
    totalTaxable: { type: Number, default: 0 },
    cgstRate: { type: Number, default: 2.5 },
    cgstAmount: { type: Number, default: 0 },
    sgstRate: { type: Number, default: 2.5 },
    sgstAmount: { type: Number, default: 0 },
    igstRate: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: DOC_STATUSES, default: "open", index: true },
    notes: String,
    cancelledAt: Date,
    cancelReason: String,
  },
  { timestamps: true, collection: "job_work_challans" },
);

jobWorkChallanSchema.index({ challanDate: -1 });
jobWorkChallanSchema.index({ status: 1, dueDate: 1 });

export const JobWorkChallan: Model<JobWorkChallanDoc> =
  models.JobWorkChallan ?? model<JobWorkChallanDoc>("JobWorkChallan", jobWorkChallanSchema);

/* ---------------------------------------------------- inward return note / GRN */

/** Links a returned quantity back to the exact challan line it went out on. */
export interface GrnAllocation {
  _id: Types.ObjectId;
  challanId: Types.ObjectId;
  challanNo: string;
  challanLineId: Types.ObjectId;
  qty: number;
}

export interface GrnLine {
  _id: Types.ObjectId;
  srNo: number;
  lineKind: GrnLineKind;
  /** The item physically received — the output code for processed lines. */
  itemId: Types.ObjectId;
  itemCode: string;
  description: string;
  qty: number;
  uom: string;
  /** For processed lines: the input code consumed at the vendor. */
  inputItemId?: Types.ObjectId;
  routeId?: Types.ObjectId;
  rejectionReason?: string;
  allocations: GrnAllocation[];
}

export interface GrnDoc {
  _id: Types.ObjectId;
  grnNo: string;
  vendorDocNo?: string;
  grnDate: Date;
  partyId: Types.ObjectId;
  fromLocationId: Types.ObjectId;
  toLocationId: Types.ObjectId;
  vehicleNo?: string;
  grNo?: string;
  transportRemark?: string;
  lines: GrnLine[];
  status: Exclude<DocStatus, "partially_returned">;
  notes?: string;
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const grnAllocationSchema = new Schema<GrnAllocation>({
  challanId: { type: Schema.Types.ObjectId, ref: "JobWorkChallan", required: true },
  challanNo: { type: String, default: "" },
  challanLineId: { type: Schema.Types.ObjectId, required: true },
  qty: { type: Number, required: true, min: 0 },
});

const grnLineSchema = new Schema<GrnLine>({
  srNo: { type: Number, required: true },
  lineKind: { type: String, enum: GRN_LINE_KINDS, required: true },
  itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
  itemCode: { type: String, required: true },
  description: { type: String, required: true },
  qty: { type: Number, required: true, min: 0 },
  uom: { type: String, default: "PC" },
  inputItemId: { type: Schema.Types.ObjectId, ref: "Item" },
  routeId: { type: Schema.Types.ObjectId, ref: "ProcessRoute" },
  rejectionReason: String,
  allocations: { type: [grnAllocationSchema], default: [] },
});

const grnSchema = new Schema<GrnDoc>(
  {
    grnNo: { type: String, required: true, unique: true, trim: true },
    vendorDocNo: String,
    grnDate: { type: Date, required: true },
    partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true, index: true },
    fromLocationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    toLocationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    vehicleNo: String,
    grNo: String,
    transportRemark: String,
    lines: { type: [grnLineSchema], default: [] },
    status: { type: String, enum: DOC_STATUSES, default: "open", index: true },
    notes: String,
    cancelledAt: Date,
    cancelReason: String,
  },
  { timestamps: true, collection: "grns" },
);

grnSchema.index({ grnDate: -1 });
grnSchema.index({ "lines.allocations.challanId": 1 });

export const Grn: Model<GrnDoc> = models.Grn ?? model<GrnDoc>("Grn", grnSchema);

/* ------------------------------------------------ inward job-work tax invoice */

export interface PurchaseInvoiceLine {
  _id: Types.ObjectId;
  srNo: number;
  itemId: Types.ObjectId;
  itemCode: string;
  description: string;
  hsnCode: string;
  qty: number;
  uom: string;
  rate: number;
  discountPct: number;
  taxableAmount: number;
  taxPct: number;
  amount: number;
  /** Verification: filled from GRN history and the process route at save time. */
  matchedGrnQty: number;
  routeRate?: number;
  qtyVariance: number;
  rateVariance: number;
}

export interface PurchaseInvoiceDoc {
  _id: Types.ObjectId;
  invoiceNo: string;
  invoiceDate: Date;
  partyId: Types.ObjectId;
  ackNo?: string;
  ackDate?: Date;
  irn?: string;
  ewayNo?: string;
  poRefs: string[];
  vehicleNo?: string;
  transport?: string;
  destination?: string;
  periodFrom?: Date;
  periodTo?: Date;
  lines: PurchaseInvoiceLine[];
  totalQty: number;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  status: InvoiceStatus;
  flags: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseInvoiceLineSchema = new Schema<PurchaseInvoiceLine>({
  srNo: { type: Number, required: true },
  itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
  itemCode: { type: String, required: true },
  description: { type: String, required: true },
  hsnCode: { type: String, default: SERVICE_HSN },
  qty: { type: Number, required: true, min: 0 },
  uom: { type: String, default: "PC" },
  rate: { type: Number, required: true, min: 0 },
  discountPct: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  taxPct: { type: Number, default: SERVICE_GST_RATE },
  amount: { type: Number, default: 0 },
  matchedGrnQty: { type: Number, default: 0 },
  routeRate: Number,
  qtyVariance: { type: Number, default: 0 },
  rateVariance: { type: Number, default: 0 },
});

const purchaseInvoiceSchema = new Schema<PurchaseInvoiceDoc>(
  {
    invoiceNo: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true },
    partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true, index: true },
    ackNo: String,
    ackDate: Date,
    irn: String,
    ewayNo: String,
    poRefs: { type: [String], default: [] },
    vehicleNo: String,
    transport: String,
    destination: String,
    periodFrom: Date,
    periodTo: Date,
    lines: { type: [purchaseInvoiceLineSchema], default: [] },
    totalQty: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    status: { type: String, enum: INVOICE_STATUSES, default: "draft", index: true },
    flags: { type: [String], default: [] },
    notes: String,
  },
  { timestamps: true, collection: "purchase_invoices" },
);

// A vendor's invoice number is unique per vendor, not globally.
purchaseInvoiceSchema.index({ partyId: 1, invoiceNo: 1 }, { unique: true });
purchaseInvoiceSchema.index({ invoiceDate: -1 });

export const PurchaseInvoice: Model<PurchaseInvoiceDoc> =
  models.PurchaseInvoice ?? model<PurchaseInvoiceDoc>("PurchaseInvoice", purchaseInvoiceSchema);

/* -------------------------------------------------------- outward sales invoice */

export interface SalesInvoiceLine {
  _id: Types.ObjectId;
  srNo: number;
  itemId: Types.ObjectId;
  itemCode: string;
  description: string;
  hsnCode: string;
  qty: number;
  uom: string;
  rate: number;
  discountPct: number;
  taxableAmount: number;
  taxPct: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  amount: number;
}

export interface SalesInvoiceDoc {
  _id: Types.ObjectId;
  invoiceNo: string;
  invoiceDate: Date;
  partyId: Types.ObjectId;
  locationId: Types.ObjectId;
  shipToLines: string[];
  poNo?: string;
  vehicleNo?: string;
  transport?: string;
  destination?: string;
  ewayBillNo?: string;
  isInterState: boolean;
  lines: SalesInvoiceLine[];
  totalQty: number;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  amountInWords: string;
  status: DocStatus;
  notes?: string;
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const salesInvoiceLineSchema = new Schema<SalesInvoiceLine>({
  srNo: { type: Number, required: true },
  itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
  itemCode: { type: String, required: true },
  description: { type: String, required: true },
  hsnCode: { type: String, default: "" },
  qty: { type: Number, required: true, min: 0 },
  uom: { type: String, default: "PC" },
  rate: { type: Number, required: true, min: 0 },
  discountPct: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0 },
  taxPct: { type: Number, default: 18 },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  igstAmount: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
});

const salesInvoiceSchema = new Schema<SalesInvoiceDoc>(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true },
    invoiceDate: { type: Date, required: true },
    partyId: { type: Schema.Types.ObjectId, ref: "Party", required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    shipToLines: { type: [String], default: [] },
    poNo: String,
    vehicleNo: String,
    transport: String,
    destination: String,
    ewayBillNo: String,
    isInterState: { type: Boolean, default: false },
    lines: { type: [salesInvoiceLineSchema], default: [] },
    totalQty: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    amountInWords: { type: String, default: "" },
    status: { type: String, enum: DOC_STATUSES, default: "open", index: true },
    notes: String,
    cancelledAt: Date,
    cancelReason: String,
  },
  { timestamps: true, collection: "sales_invoices" },
);

salesInvoiceSchema.index({ invoiceDate: -1 });

export const SalesInvoice: Model<SalesInvoiceDoc> =
  models.SalesInvoice ?? model<SalesInvoiceDoc>("SalesInvoice", salesInvoiceSchema);

/* ---------------------------------------------------------- stock adjustments */

export interface StockAdjustmentLine {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  itemCode: string;
  description: string;
  /** Signed: positive adds stock, negative removes it. */
  qty: number;
  uom: string;
  remark?: string;
}

export interface StockAdjustmentDoc {
  _id: Types.ObjectId;
  adjustmentNo: string;
  adjustmentDate: Date;
  locationId: Types.ObjectId;
  reason: string;
  lines: StockAdjustmentLine[];
  status: DocStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const stockAdjustmentLineSchema = new Schema<StockAdjustmentLine>({
  itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
  itemCode: { type: String, required: true },
  description: { type: String, required: true },
  qty: { type: Number, required: true },
  uom: { type: String, default: "PC" },
  remark: String,
});

const stockAdjustmentSchema = new Schema<StockAdjustmentDoc>(
  {
    adjustmentNo: { type: String, required: true, unique: true, trim: true },
    adjustmentDate: { type: Date, required: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true, index: true },
    reason: { type: String, required: true },
    lines: { type: [stockAdjustmentLineSchema], default: [] },
    status: { type: String, enum: DOC_STATUSES, default: "open" },
    notes: String,
  },
  { timestamps: true, collection: "stock_adjustments" },
);

export const StockAdjustment: Model<StockAdjustmentDoc> =
  models.StockAdjustment ?? model<StockAdjustmentDoc>("StockAdjustment", stockAdjustmentSchema);
