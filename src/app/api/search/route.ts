import { NextResponse } from "next/server";
import { connectDb } from "@/db/connect";
import { Grn, Item, JobWorkChallan, Party, PurchaseInvoice, SalesInvoice } from "@/db/models";

export interface SearchHit {
  group: string;
  label: string;
  detail: string;
  href: string;
}

/** Backs the ⌘K palette: one query across the numbers people actually recall. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ hits: [] });

  await connectDb();

  // Escape so a stray "(" or "*" from the search box can't break the regex.
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const limit = 5;

  const [items, challans, grns, bills, sales, parties] = await Promise.all([
    Item.find({ $or: [{ itemCode: rx }, { description: rx }] })
      .select("itemCode description")
      .limit(limit)
      .lean(),
    JobWorkChallan.find({ challanNo: rx }).select("challanNo challanDate").limit(limit).lean(),
    Grn.find({ $or: [{ grnNo: rx }, { vendorDocNo: rx }] })
      .select("grnNo vendorDocNo grnDate")
      .limit(limit)
      .lean(),
    PurchaseInvoice.find({ invoiceNo: rx }).select("invoiceNo invoiceDate").limit(limit).lean(),
    SalesInvoice.find({ invoiceNo: rx }).select("invoiceNo invoiceDate").limit(limit).lean(),
    Party.find({ $or: [{ name: rx }, { code: rx }] })
      .select("name code partyType")
      .limit(limit)
      .lean(),
  ]);

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-GB");

  const hits: SearchHit[] = [
    ...items.map((i) => ({
      group: "Items",
      label: i.itemCode,
      detail: i.description,
      href: `/stock/${i._id.toString()}`,
    })),
    ...challans.map((c) => ({
      group: "Challans",
      label: c.challanNo,
      detail: fmt(c.challanDate),
      href: `/challans/${c._id.toString()}`,
    })),
    ...grns.map((g) => ({
      group: "Return notes",
      label: g.grnNo,
      detail: [g.vendorDocNo, fmt(g.grnDate)].filter(Boolean).join(" · "),
      href: `/grn/${g._id.toString()}`,
    })),
    ...bills.map((b) => ({
      group: "Job-work bills",
      label: b.invoiceNo,
      detail: fmt(b.invoiceDate),
      href: `/purchase-invoices/${b._id.toString()}`,
    })),
    ...sales.map((s) => ({
      group: "Sales invoices",
      label: s.invoiceNo,
      detail: fmt(s.invoiceDate),
      href: `/sales-invoices/${s._id.toString()}`,
    })),
    ...parties.map((p) => ({
      group: "Parties",
      label: p.name,
      detail: p.code,
      href: `/masters/parties`,
    })),
  ];

  return NextResponse.json({ hits });
}
