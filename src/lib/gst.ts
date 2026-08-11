import { round2 } from "./format";

export interface TaxSplit {
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

/**
 * Within a state the tax splits into CGST + SGST; across states it is a single
 * IGST. Both our factory and Best Enterprises are state code 37, so job work is
 * always intra-state — but sales invoices can go anywhere.
 */
export function isInterState(sellerStateCode: string, buyerStateCode: string): boolean {
  return sellerStateCode.trim() !== buyerStateCode.trim();
}

/**
 * Tax in paise, as integers.
 *
 * Binary floats can't hold values like 1829.295, and rounding one of those down
 * throws a printed invoice off by a paisa — invoice BE/26-27/0344 shows CGST and
 * SGST of exactly 6,735.25 each, which only comes out right with exact decimal
 * arithmetic. Working in paise keeps every intermediate an integer until the
 * final divide.
 */
function taxPaise(taxableAmount: number, gstRate: number): number {
  const taxablePaise = Math.round(taxableAmount * 100);
  // taxablePaise * gstRate is an integer for whole rates and exact for the
  // half-percent rates GST actually uses (2.5, 6, 9, 14).
  return Math.round((taxablePaise * gstRate) / 100);
}

/**
 * CGST and SGST are each computed on half the rate rather than by halving the
 * total, which is what the vendor's software does and what the paper shows.
 */
export function splitTax(taxableAmount: number, gstRate: number, interState: boolean): TaxSplit {
  if (interState) {
    const total = taxPaise(taxableAmount, gstRate) / 100;
    return { cgstAmount: 0, sgstAmount: 0, igstAmount: total, totalTax: total };
  }

  const half = taxPaise(taxableAmount, gstRate / 2) / 100;
  return {
    cgstAmount: half,
    sgstAmount: half,
    igstAmount: 0,
    totalTax: round2(half * 2),
  };
}

export function lineTaxable(qty: number, rate: number, discountPct = 0): number {
  const gross = qty * rate;
  return round2(gross - (gross * discountPct) / 100);
}

/** Difference to the nearest rupee, as GST invoices are rounded off. */
export function roundOffDelta(grandTotal: number): { roundOff: number; rounded: number } {
  const rounded = Math.round(grandTotal);
  return { roundOff: round2(rounded - grandTotal), rounded };
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/;

export function isValidGstin(gstin: string): boolean {
  return GSTIN_PATTERN.test(gstin.trim().toUpperCase());
}

/** The first two digits of a GSTIN are the state code. */
export function stateCodeFromGstin(gstin: string): string | null {
  const clean = gstin.trim().toUpperCase();
  return GSTIN_PATTERN.test(clean) ? clean.slice(0, 2) : null;
}

const STATE_NAMES: Record<string, string> = {
  "37": "Andhra Pradesh",
  "36": "Telangana",
  "33": "Tamil Nadu",
  "29": "Karnataka",
  "27": "Maharashtra",
  "07": "Delhi",
  "09": "Uttar Pradesh",
  "24": "Gujarat",
  "19": "West Bengal",
  "32": "Kerala",
  "23": "Madhya Pradesh",
  "08": "Rajasthan",
  "21": "Odisha",
  "03": "Punjab",
  "06": "Haryana",
};

export function stateNameFromCode(code: string): string | null {
  return STATE_NAMES[code.trim()] ?? null;
}
