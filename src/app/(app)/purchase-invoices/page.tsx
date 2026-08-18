import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, EmptyState, PageHeader, TableWrap } from "@/components/ui/primitives";
import { connectDb } from "@/db/connect";
import { Party, PurchaseInvoice } from "@/db/models";
import { PurchaseInvoicesClient, type PurchaseInvoiceListRow } from "./purchase-invoices-client";

export const dynamic = "force-dynamic";

export default async function PurchaseInvoicesPage() {
  await connectDb();

  const [invoices, parties] = await Promise.all([
    PurchaseInvoice.find().sort({ invoiceDate: -1, createdAt: -1 }).lean(),
    Party.find().select("name").lean(),
  ]);

  const partyName = new Map(parties.map((p) => [p._id.toString(), p.name]));

  const rows: PurchaseInvoiceListRow[] = invoices.map((invoice) => ({
    _id: invoice._id.toString(),
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate.toISOString(),
    partyName: partyName.get(invoice.partyId.toString()) ?? "—",
    totalQty: invoice.totalQty,
    subtotal: invoice.subtotal,
    totalTax: invoice.totalTax,
    grandTotal: invoice.grandTotal,
    status: invoice.status,
    flagCount: invoice.flags.length,
  }));

  return (
    <>
      <PageHeader
        title="Supplier bills"
        subtitle="Bills from your own suppliers — consumables, chemicals, transport."
        action={
          <Link href="/purchase-invoices/new">
            <Button variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New bill
            </Button>
          </Link>
        }
      />

      {invoices.length === 0 ? (
        <TableWrap>
          <EmptyState
            title="No supplier bills yet"
            description="Record a bill you have received from a supplier."
            action={
              <Link href="/purchase-invoices/new">
                <Button variant="primary" size="sm">
                  New bill
                </Button>
              </Link>
            }
          />
        </TableWrap>
      ) : (
        <PurchaseInvoicesClient rows={rows} />
      )}
    </>
  );
}
