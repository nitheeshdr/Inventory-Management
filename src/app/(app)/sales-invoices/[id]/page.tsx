import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  PageHeader,
  Table,
  TableWrap,
  Td,
  TdNum,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { DocStatusChip } from "@/components/status-chip";
import { DetailField, DetailGrid } from "@/components/detail-fields";
import { CancelDocButton } from "@/components/cancel-doc-button";
import { connectDb } from "@/db/connect";
import { Party, SalesInvoice } from "@/db/models";
import { formatAmount, formatDate, formatQty } from "@/lib/format";
import { cancelSalesInvoice } from "../actions";

export const dynamic = "force-dynamic";

export default async function SalesInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const invoice = await SalesInvoice.findById(id).lean();
  if (!invoice) notFound();

  const party = await Party.findById(invoice.partyId).lean();

  async function cancel(reason: string) {
    "use server";
    return cancelSalesInvoice(id, reason);
  }

  return (
    <>
      <Link
        href="/sales-invoices"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to sales invoices
      </Link>

      <PageHeader
        title={`Invoice ${invoice.invoiceNo}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <DocStatusChip status={invoice.status} />
            <Chip tone={invoice.isInterState ? "info" : "neutral"}>
              {invoice.isInterState ? "IGST" : "CGST + SGST"}
            </Chip>
            <span className="text-fg-muted">
              {party?.name} · {formatDate(invoice.invoiceDate)}
            </span>
          </span>
        }
        action={
          <>
            <Link href={`/sales-invoices/${id}/print`} target="_blank">
              <Button variant="outline" size="sm">
                <Printer className="h-3.5 w-3.5" strokeWidth={1.75} />
                Print
              </Button>
            </Link>
            {invoice.status !== "cancelled" && (
              <Link href={`/sales-invoices/${id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Edit
                </Button>
              </Link>
            )}
          </>
        }
      />

      {invoice.status === "cancelled" && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          Cancelled on {formatDate(invoice.cancelledAt)} — {invoice.cancelReason}.
        </div>
      )}

      <Card className="mb-4 p-4">
        <DetailGrid>
          <DetailField label="Customer" value={party?.name} />
          <DetailField label="Customer GSTIN" value={party?.gstin} mono />
          <DetailField label="Invoice date" value={formatDate(invoice.invoiceDate)} />
          <DetailField label="PO no" value={invoice.poNo} mono />
          <DetailField label="Vehicle" value={invoice.vehicleNo} mono />
          <DetailField label="Transport" value={invoice.transport} />
          <DetailField label="Destination" value={invoice.destination} />
          <DetailField label="E-way bill" value={invoice.ewayBillNo} mono />
        </DetailGrid>
        {invoice.notes && (
          <p className="mt-4 border-t border-border pt-3 text-sm text-fg-muted">{invoice.notes}</p>
        )}
      </Card>

      <Card className="mb-4">
        <CardHeader title="Lines" subtitle={`${invoice.lines.length} lines`} />
        <TableWrap className="rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th className="w-10">#</Th>
                <Th>Item</Th>
                <Th>HSN</Th>
                <ThNum>Qty</ThNum>
                <ThNum>Rate</ThNum>
                <ThNum>Disc %</ThNum>
                <ThNum>Taxable</ThNum>
                <ThNum>GST %</ThNum>
                <ThNum>Amount</ThNum>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line._id.toString()} className="hover:bg-surface-2">
                  <Td className="text-fg-subtle">{line.srNo}</Td>
                  <Td>
                    <Link
                      href={`/stock/${line.itemId.toString()}`}
                      className="font-mono text-[13px] text-accent hover:underline"
                    >
                      {line.itemCode}
                    </Link>
                    <span className="ml-1.5 text-xs text-fg-muted">{line.description}</span>
                  </Td>
                  <Td className="font-mono text-xs text-fg-muted">{line.hsnCode}</Td>
                  <TdNum>{formatQty(line.qty)}</TdNum>
                  <TdNum>{formatAmount(line.rate)}</TdNum>
                  <TdNum className="text-fg-muted">{line.discountPct}</TdNum>
                  <TdNum>{formatAmount(line.taxableAmount)}</TdNum>
                  <TdNum className="text-fg-muted">{line.taxPct}</TdNum>
                  <TdNum className="font-medium">{formatAmount(line.amount)}</TdNum>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <TotalRow label="Total before tax" value={invoice.subtotal} />
              {invoice.isInterState ? (
                <TotalRow label="IGST" value={invoice.igstAmount} />
              ) : (
                <>
                  <TotalRow label="CGST" value={invoice.cgstAmount} />
                  <TotalRow label="SGST" value={invoice.sgstAmount} />
                </>
              )}
              <TotalRow label="Round off" value={invoice.roundOff} />
              <TotalRow label="Grand total" value={invoice.grandTotal} strong />
            </tfoot>
          </Table>
        </TableWrap>
        <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">
          {invoice.amountInWords}
        </p>
      </Card>

      {invoice.status !== "cancelled" && (
        <div className="flex justify-end">
          <CancelDocButton
            action={cancel}
            label="Cancel invoice"
            confirmTitle="Cancel this invoice? No stock is affected — bills are money only."
          />
        </div>
      )}
    </>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className="bg-surface-2">
      <Td
        colSpan={8}
        className={`text-right text-xs uppercase text-fg-muted ${strong ? "font-semibold" : ""}`}
      >
        {label}
      </Td>
      <TdNum className={strong ? "font-semibold" : ""}>{formatAmount(value)}</TdNum>
    </tr>
  );
}
