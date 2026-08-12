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
import { InvoiceStatusChip } from "@/components/status-chip";
import { connectDb } from "@/db/connect";
import { Party, PurchaseInvoice } from "@/db/models";
import { formatAmount, formatDate, formatQty } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PurchaseInvoicesPage() {
  await connectDb();

  const [invoices, parties] = await Promise.all([
    PurchaseInvoice.find().sort({ invoiceDate: -1, createdAt: -1 }).lean(),
    Party.find().select("name").lean(),
  ]);

  const partyName = new Map(parties.map((p) => [p._id.toString(), p.name]));

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
        <TableWrap className="max-h-[72vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Invoice no</Th>
                <Th>Date</Th>
                <Th>Supplier</Th>
                <ThNum>Qty</ThNum>
                <ThNum>Before tax</ThNum>
                <ThNum>Tax</ThNum>
                <ThNum>Grand total</ThNum>
                <Th>Status</Th>
                              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice._id.toString()} className="transition-colors hover:bg-surface-2">
                  <Td>
                    <Link
                      href={`/purchase-invoices/${invoice._id.toString()}`}
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
                    <InvoiceStatusChip status={invoice.status} />
                  </Td>
                  <Td>
                    {invoice.flags.length === 0 ? (
                      <Chip tone="success">Clean</Chip>
                    ) : (
                      <Chip tone="danger">
                        {invoice.flags.length} {invoice.flags.length === 1 ? "issue" : "issues"}
                      </Chip>
                    )}
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
