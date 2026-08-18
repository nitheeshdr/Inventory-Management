import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { connectDb } from "@/db/connect";
import { SalesInvoice } from "@/db/models";
import { getCompany, getItemOptions, getParties } from "@/lib/queries/masters";
import { toDateInputValue } from "@/lib/format";
import { SalesInvoiceForm } from "../../sales-form";

export const dynamic = "force-dynamic";

export default async function EditSalesInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const invoice = await SalesInvoice.findById(id).lean();
  if (!invoice || invoice.status === "cancelled") notFound();

  const [allItems, customers, company] = await Promise.all([
    getItemOptions(),
    getParties("customer"),
    getCompany(),
  ]);
  // FOC items are never billed — they move through the Return module instead.
  const items = allItems.filter((item) => !item.isFoc);

  return (
    <>
      <Link
        href={`/sales-invoices/${id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to invoice
      </Link>
      <PageHeader
        title={`Edit invoice ${invoice.invoiceNo}`}
        subtitle="Saving re-posts the stock movements for this invoice."
      />
      <SalesInvoiceForm
        items={items}
        customers={customers}
        companyStateCode={company?.stateCode ?? "37"}
        suggestedNo={invoice.invoiceNo}
        initial={{
          _id: id,
          invoiceNo: invoice.invoiceNo,
          invoiceDate: toDateInputValue(invoice.invoiceDate),
          partyId: invoice.partyId.toString(),
          poNo: invoice.poNo,
          vehicleNo: invoice.vehicleNo,
          transport: invoice.transport,
          destination: invoice.destination,
          ewayBillNo: invoice.ewayBillNo,
          notes: invoice.notes,
          lines: invoice.lines.map((line) => ({
            itemId: line.itemId.toString(),
            qty: line.qty,
            rate: line.rate,
            discountPct: line.discountPct,
            taxPct: line.taxPct,
          })),
        }}
      />
    </>
  );
}
