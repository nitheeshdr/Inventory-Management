import { describe, expect, it } from "vitest";
import {
  isInterState,
  isValidGstin,
  lineTaxable,
  roundOffDelta,
  splitTax,
  stateCodeFromGstin,
  stateNameFromCode,
} from "./gst";
import { round2 } from "./format";

describe("splitTax", () => {
  it("splits intra-state tax evenly between CGST and SGST", () => {
    const tax = splitTax(74836.04, 18, false);
    expect(tax.cgstAmount).toBe(tax.sgstAmount);
    expect(tax.igstAmount).toBe(0);
    expect(round2(tax.cgstAmount + tax.sgstAmount)).toBe(tax.totalTax);
  });

  it("puts the whole tax into IGST across states", () => {
    const tax = splitTax(1000, 18, true);
    expect(tax).toEqual({ cgstAmount: 0, sgstAmount: 0, igstAmount: 180, totalTax: 180 });
  });

  it("reproduces invoice BE/26-27/0344 to the paisa, line by line", () => {
    // 1829.295 is not representable in binary floating point; rounding it the
    // wrong way threw the printed total out by three paise before this was
    // computed in integer paise.
    const taxableByLine = [25759.8, 20325.5, 20199.36, 4621.08, 3930.3];

    const totals = taxableByLine.reduce(
      (acc, taxable) => {
        const tax = splitTax(taxable, 18, false);
        return { cgst: acc.cgst + tax.cgstAmount, sgst: acc.sgst + tax.sgstAmount };
      },
      { cgst: 0, sgst: 0 },
    );

    expect(round2(totals.cgst)).toBe(6735.25);
    expect(round2(totals.sgst)).toBe(6735.25);
    expect(round2(totals.cgst + totals.sgst)).toBe(13470.5);

    const subtotal = round2(taxableByLine.reduce((total, value) => total + value, 0));
    expect(subtotal).toBe(74836.04);
    expect(roundOffDelta(round2(subtotal + 13470.5)).rounded).toBe(88307);
  });

  it("matches the challan's declared 5% valuation", () => {
    // Challan 2621500964: 8,55,132.42 taxable, 21,378.31 each side.
    const tax = splitTax(855132.42, 5, false);
    expect(tax.cgstAmount).toBe(21378.31);
    expect(tax.sgstAmount).toBe(21378.31);
    expect(round2(855132.42 + tax.totalTax)).toBe(897889.04);
  });

  it("always splits back to exactly the total, even on odd paise", () => {
    const tax = splitTax(100.01, 5, false);
    expect(round2(tax.cgstAmount + tax.sgstAmount)).toBe(tax.totalTax);
  });
});

describe("lineTaxable", () => {
  it("multiplies quantity by rate", () => {
    // Invoice BE/26-27/0344 line 1: 1980 @ 13.01 = 25,759.80
    expect(lineTaxable(1980, 13.01)).toBe(25759.8);
    expect(lineTaxable(1378, 14.75)).toBe(20325.5);
    expect(lineTaxable(848, 23.82)).toBe(20199.36);
  });

  it("applies a percentage discount", () => {
    expect(lineTaxable(100, 10, 10)).toBe(900);
  });
});

describe("roundOffDelta", () => {
  it("rounds an invoice to the nearest rupee", () => {
    // 74,836.04 + 13,470.50 = 88,306.54 → 88,307 on the paper invoice.
    const { roundOff, rounded } = roundOffDelta(88306.54);
    expect(rounded).toBe(88307);
    expect(roundOff).toBe(0.46);
  });

  it("rounds down when it should", () => {
    const { roundOff, rounded } = roundOffDelta(100.4);
    expect(rounded).toBe(100);
    expect(roundOff).toBe(-0.4);
  });
});

describe("GSTIN", () => {
  it("accepts well-formed GSTINs", () => {
    expect(isValidGstin("29AAAAA0000A1Z5")).toBe(true);
    expect(isValidGstin("37ABCDE1234F1Z9")).toBe(true);
  });

  it("rejects malformed ones", () => {
    expect(isValidGstin("29AAAAA0000A1Z")).toBe(false);
    expect(isValidGstin("ABCDE1234F")).toBe(false);
    expect(isValidGstin("")).toBe(false);
  });

  it("reads the state code off the first two digits", () => {
    expect(stateCodeFromGstin("37ABCDE1234F1Z9")).toBe("37");
    expect(stateCodeFromGstin("not a gstin")).toBeNull();
  });
});

describe("isInterState", () => {
  it("treats matching state codes as intra-state", () => {
    // Both parties in Andhra Pradesh (37) means CGST + SGST.
    expect(isInterState("37", "37")).toBe(false);
    expect(isInterState("37", "33")).toBe(true);
  });
});

describe("stateNameFromCode", () => {
  it("resolves valid state codes to state names", () => {
    expect(stateNameFromCode("37")).toBe("Andhra Pradesh");
    expect(stateNameFromCode("33")).toBe("Tamil Nadu");
    expect(stateNameFromCode("36")).toBe("Telangana");
  });

  it("returns null for unknown state codes", () => {
    expect(stateNameFromCode("99")).toBeNull();
  });
});
