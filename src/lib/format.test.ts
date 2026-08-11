import { describe, expect, it } from "vitest";
import {
  addYears,
  amountInWords,
  daysBetween,
  financialYear,
  formatAmount,
  formatINRShort,
  round2,
  round3,
} from "./format";

describe("rounding", () => {
  it("rounds money to two places without float drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(25759.799999)).toBe(25759.8);
    expect(round2(1.005)).toBe(1.01);
  });

  it("rounds quantities to three places", () => {
    expect(round3(1 / 3)).toBe(0.333);
    expect(round3(2100)).toBe(2100);
  });
});

describe("formatAmount", () => {
  it("uses Indian lakh grouping", () => {
    // The challan total from the scanned paperwork.
    expect(formatAmount(855132.42)).toBe("8,55,132.42");
    expect(formatAmount(88307)).toBe("88,307.00");
    expect(formatAmount(12345678.9)).toBe("1,23,45,678.90");
  });

  it("treats null and undefined as zero", () => {
    expect(formatAmount(null)).toBe("0.00");
    expect(formatAmount(undefined)).toBe("0.00");
  });
});

describe("formatINRShort", () => {
  it("abbreviates in lakhs and crores", () => {
    expect(formatINRShort(855132.42)).toBe("₹8.55 L");
    expect(formatINRShort(12345678)).toBe("₹1.23 Cr");
    expect(formatINRShort(4500)).toBe("₹4.5 K");
    expect(formatINRShort(250)).toBe("₹250");
  });
});

describe("amountInWords", () => {
  it("matches the phrasing on the vendor's invoice", () => {
    // BE/26-27/0344 reads "Rupee Eighty Eight Thousand Three Hundred Seven Only".
    expect(amountInWords(88307)).toBe("Rupee Eighty Eight Thousand Three Hundred Seven Only");
  });

  it("includes paise when there are any", () => {
    expect(amountInWords(13470.5)).toBe(
      "Rupee Thirteen Thousand Four Hundred Seventy & Fifty Paise Only",
    );
  });

  it("handles lakhs, crores and zero", () => {
    expect(amountInWords(855132)).toBe(
      "Rupee Eight Lakh Fifty Five Thousand One Hundred Thirty Two Only",
    );
    expect(amountInWords(10000000)).toBe("Rupee One Crore Only");
    expect(amountInWords(0)).toBe("Rupee Zero Only");
  });

  it("handles the teens and round tens correctly", () => {
    expect(amountInWords(15)).toBe("Rupee Fifteen Only");
    expect(amountInWords(70)).toBe("Rupee Seventy Only");
    expect(amountInWords(100)).toBe("Rupee One Hundred Only");
  });
});

describe("dates", () => {
  it("adds a year for the job-work return deadline", () => {
    expect(addYears(new Date("2026-08-05"), 1).toISOString().slice(0, 10)).toBe("2027-08-05");
  });

  it("counts whole days regardless of time of day", () => {
    expect(daysBetween("2026-08-05T23:00:00", "2026-08-06T01:00:00")).toBe(1);
    expect(daysBetween("2026-08-05", "2026-08-05")).toBe(0);
  });

  it("derives the Indian financial year", () => {
    // April starts a new FY; March still belongs to the previous one.
    expect(financialYear(new Date("2026-08-05"))).toBe("26-27");
    expect(financialYear(new Date("2026-03-31"))).toBe("25-26");
    expect(financialYear(new Date("2026-04-01"))).toBe("26-27");
  });
});
