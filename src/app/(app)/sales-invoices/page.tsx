import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, EmptyState, PageHeader, TableWrap } from "@/components/ui/primitives";
import { connectDb } from "@/db/connect";
import { Party, SalesInvoice } from "@/db/models";
import { SalesInvoicesClient, type SalesInvoiceListRow } from "./sales-invoices-client";

export const dynamic = "force-dynamic";

export default async function SalesInvoicesPage() {
  await connectDb();

  const [invoices, parties] = await Promise.all([
    SalesInvoice.find().sort({ invoiceDate: -1, createdAt: -1 }).lean(),
    Party.find().select("name").lean(),
  ]);

  const partyName = new Map(parties.map((p) => [p._id.toString(), p.name]));

  const rows: SalesInvoiceListRow[] = invoices.map((invoice) => ({
    _id: invoice._id.toString(),
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate.toISOString(),
    partyName: partyName.get(invoice.partyId.toString()) ?? "—",
    totalQty: invoice.totalQty,
    subtotal: invoice.subtotal,
    totalTax: invoice.totalTax,
    grandTotal: invoice.grandTotal,
    isInterState: invoice.isInterState,
    status: invoice.status,
  }));

  return (
    <>
      <PageHeader
        title="Sales invoices"
        subtitle="Job-work bills for your customers — money only, no stock moves."
        action={
          <Link href="/sales-invoices/new">
            <Button variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New invoice
            </Button>
          </Link>
        }
      />

      {invoices.length === 0 ? (
        <TableWrap>
          <EmptyState
            title="No sales invoices yet"
            description="Raise one when finished goods are dispatched to a customer."
            action={
              <Link href="/sales-invoices/new">
                <Button variant="primary" size="sm">
                  New invoice
                </Button>
              </Link>
            }
          />
        </TableWrap>
      ) : (
        <SalesInvoicesClient rows={rows} />
      )}
    </>
  );
}
