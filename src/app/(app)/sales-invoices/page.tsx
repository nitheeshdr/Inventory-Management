import Link from "next/link";
import { Plus } from "lucide-react";
import {
  Button,
  Chip,
  EmptyState,
  PageHeader,
  Table,
  TableWrap,
  Td,
  TdNum,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { DocStatusChip } from "@/components/status-chip";
import { connectDb } from "@/db/connect";
import { Party, SalesInvoice } from "@/db/models";
import { formatAmount, formatDate, formatQty } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SalesInvoicesPage() {
  await connectDb();

  const [invoices, parties] = await Promise.all([
    SalesInvoice.find().sort({ invoiceDate: -1, createdAt: -1 }).lean(),
    Party.find().select("name").lean(),
  ]);

  const partyName = new Map(parties.map((p) => [p._id.toString(), p.name]));

  return (
    <>
      <PageHeader
        title="Sales invoices"
        subtitle="Finished goods leaving the plant for customers."
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
        <TableWrap className="max-h-[72vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Invoice no</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <ThNum>Qty</ThNum>
                <ThNum>Before tax</ThNum>
                <ThNum>Tax</ThNum>
                <ThNum>Grand total</ThNum>
                <Th>Tax type</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice._id.toString()} className="transition-colors hover:bg-surface-2">
                  <Td>
                    <Link
                      href={`/sales-invoices/${invoice._id.toString()}`}
                      className="font-mono text-[13px] text-accent hover:underline"
                    >
                      {invoice.invoiceNo}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {formatDate(invoice.invoiceDate)}
                  </Td>
                  <Td>{partyName.get(invoice.partyId.toString()) ?? "—"}</Td>
                  <TdNum>{formatQty(invoice.totalQty)}</TdNum>
                  <TdNum>{formatAmount(invoice.subtotal)}</TdNum>
                  <TdNum className="text-fg-muted">{formatAmount(invoice.totalTax)}</TdNum>
                  <TdNum className="font-medium">{formatAmount(invoice.grandTotal)}</TdNum>
                  <Td>
                    <Chip tone={invoice.isInterState ? "info" : "neutral"}>
                      {invoice.isInterState ? "IGST" : "CGST + SGST"}
                    </Chip>
                  </Td>
                  <Td>
                    <DocStatusChip status={invoice.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
