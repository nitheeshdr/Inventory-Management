/** Money and quantity rounding. Applied at every computation boundary so
 *  totals reconcile against the paper documents to the paisa. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWholeFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const qtyFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 3,
});

/** `855132.42` → `8,55,132.42` — lakh grouping, no symbol. */
export function formatAmount(n: number | null | undefined): string {
  return inrFormatter.format(n ?? 0);
}

/** `855132.42` → `₹8,55,132.42` */
export function formatINR(n: number | null | undefined): string {
  return `₹${inrFormatter.format(n ?? 0)}`;
}

/** Compact tile figures: `₹8.55 L`, `₹1.24 Cr`. */
export function formatINRShort(n: number | null | undefined): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${round2(v / 1e7)} Cr`;
  if (abs >= 1e5) return `₹${round2(v / 1e5)} L`;
  if (abs >= 1e3) return `₹${round2(v / 1e3)} K`;
  return `₹${inrWholeFormatter.format(v)}`;
}

export function formatQty(n: number | null | undefined): string {
  return qtyFormatter.format(n ?? 0);
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

function threeDigitWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(" ");
}

/** Indian system: crore / lakh / thousand / hundred. */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;

  const parts: string[] = [];
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (rest) parts.push(threeDigitWords(rest));

  return parts.join(" ");
}

/**
 * Matches the phrasing on the existing paper invoices, e.g.
 * "Rupee Eighty Eight Thousand Three Hundred Seven Only".
 */
export function amountInWords(amount: number): string {
  const value = round2(Math.abs(amount));
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  const parts = [`Rupee ${integerToWords(rupees)}`];
  if (paise > 0) parts.push(`& ${twoDigitWords(paise)} Paise`);
  parts.push("Only");

  const words = parts.join(" ");
  return amount < 0 ? `Minus ${words}` : words;
}

/* ------------------------------------------------------------------- dates */

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateLong(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** `yyyy-MM-dd` for `<input type="date">`, in local time. */
export function toDateInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Whole days between two dates, ignoring time of day. */
export function daysBetween(from: Date | string, to: Date | string = new Date()): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  const startA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const startB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((startB - startA) / 86_400_000);
}

export function addYears(d: Date, years: number): Date {
  const next = new Date(d);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

/** Indian financial year label for a date: 05.08.2026 → "26-27". */
export function financialYear(d: Date): string {
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}
