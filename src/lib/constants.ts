export const PARTY_TYPES = ["job_worker", "customer", "supplier"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const LOCATION_KINDS = ["plant", "job_worker", "customer"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const ITEM_TYPES = ["component", "processed", "finished_good", "raw_material"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const DOC_STATUSES = [
  "draft",
  "open",
  "partially_returned",
  "closed",
  "cancelled",
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const INVOICE_STATUSES = ["draft", "verified", "flagged", "approved", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * What we send back. Only `processed` lines convert an item code. `foc` lines
 * carry free-of-cost material out to the customer — they never arrived on a
 * challan, so they need no allocation against one.
 */
export const GRN_LINE_KINDS = ["processed", "rejected", "unprocessed", "scrap", "foc"] as const;
export type GrnLineKind = (typeof GRN_LINE_KINDS)[number];

export const GRN_LINE_KIND_LABELS: Record<GrnLineKind, string> = {
  processed: "Processed",
  rejected: "Rejected",
  unprocessed: "Unprocessed",
  scrap: "Scrap",
  foc: "FOC (free of cost)",
};

/** Every kind of document that can move stock. */
export const DOC_TYPES = [
  "job_work_challan",
  "grn",
  "sales_invoice",
  "stock_adjustment",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  job_work_challan: "Inward Challan",
  grn: "Outward Return",
  sales_invoice: "Sales Invoice",
  stock_adjustment: "Stock Adjustment",
};

export const UOMS = ["PC", "KG", "SET", "BOX", "MTR", "LTR"] as const;

/** GST requires job-work goods to come back within one year of the challan. */
export const JOB_WORK_RETURN_DAYS = 365;

/** Aging buckets for the deadline report, in days open. */
export const AGING_BUCKETS = [
  { key: "0-90", label: "0–90 days", min: 0, max: 90 },
  { key: "91-180", label: "91–180 days", min: 91, max: 180 },
  { key: "181-300", label: "181–300 days", min: 181, max: 300 },
  { key: "301-365", label: "301–365 days", min: 301, max: 365 },
  { key: "overdue", label: "Overdue (>1 year)", min: 366, max: Number.MAX_SAFE_INTEGER },
] as const;

export const SERVICE_HSN = "998898";
export const SERVICE_GST_RATE = 18;
