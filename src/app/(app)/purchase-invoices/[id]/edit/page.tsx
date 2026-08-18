import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { connectDb } from "@/db/connect";
import { PurchaseInvoice } from "@/db/models";
import { getCompany, getItemOptions, getParties, getRoutes } from "@/lib/queries/masters";
import { toDateInputValue } from "@/lib/format";
import { PurchaseInvoiceForm } from "../../invoice-form";

export const dynamic = "force-dynamic";

export default async function EditPurchaseInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const invoice = await PurchaseInvoice.findById(id).lean();
  if (!invoice || invoice.status === "cancelled") notFound();

  // Every party, not just "supplier" — a job-work vendor account (Masters →
  // Process routes) can also bill us, and its agreed rate should offer itself
  // when picked here.
  const [items, parties, routes, company] = await Promise.all([
    getItemOptions(),
    getParties(),
    getRoutes(),
    getCompany(),
  ]);

  return (
    <>
      <Link
        href={`/purchase-invoices/${id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to bill
      </Link>
      <PageHeader
        title={`Edit bill ${invoice.invoiceNo}`}
        subtitle="Money only — editing a bill never touches stock."
      />
      <PurchaseInvoiceForm
        items={items}
        parties={parties}
        routes={routes}
        companyStateCode={company?.stateCode ?? "37"}
        initial={{
          _id: id,
          invoiceNo: invoice.invoiceNo,
          invoiceDate: toDateInputValue(invoice.invoiceDate),
          partyId: invoice.partyId.toString(),
          ackNo: invoice.ackNo,
          ackDate: toDateInputValue(invoice.ackDate),
          irn: invoice.irn,
          ewayNo: invoice.ewayNo,
          poRefs: invoice.poRefs.join(", "),
          vehicleNo: invoice.vehicleNo,
          transport: invoice.transport,
          destination: invoice.destination,
          notes: invoice.notes,
          lines: invoice.lines.map((line) => ({
            itemId: line.itemId.toString(),
            qty: line.qty,
            rate: line.rate,
            discountPct: line.discountPct,
            taxPct: line.taxPct,
            hsnCode: line.hsnCode,
          })),
        }}
      />
    </>
  );
}
