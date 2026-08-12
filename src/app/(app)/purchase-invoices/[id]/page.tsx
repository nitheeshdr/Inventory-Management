import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { AlertTriangle, ArrowLeft, Check, Pencil } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  PageHeader,
  Table,
  TableWrap,
  Td,
  TdNum,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { InvoiceStatusChip } from "@/components/status-chip";
import { DetailField, DetailGrid } from "@/components/detail-fields";
import { CancelDocButton } from "@/components/cancel-doc-button";
import { ApproveButton } from "../approve-button";
import { connectDb } from "@/db/connect";
import { Party, PurchaseInvoice } from "@/db/models";
import { amountInWords, formatAmount, formatDate, formatQty } from "@/lib/format";
import { approvePurchaseInvoice, cancelPurchaseInvoice } from "../actions";

export const dynamic = "force-dynamic";

export default async function PurchaseInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const invoice = await PurchaseInvoice.findById(id).lean();
  if (!invoice) notFound();

  const party = await Party.findById(invoice.partyId).lean();

  async function approve() {
    "use server";
    return approvePurchaseInvoice(id);
  }

  async function cancel(reason: string) {
    "use server";
    return cancelPurchaseInvoice(id, reason);
  }

  return (
    <>
      <Link
        href="/purchase-invoices"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to bills
      </Link>

      <PageHeader
        title={`Bill ${invoice.invoiceNo}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <InvoiceStatusChip status={invoice.status} />
            <span className="text-fg-muted">
              {party?.name} · {formatDate(invoice.invoiceDate)}
            </span>
          </span>
        }
        action={
          <>
            {invoice.status !== "cancelled" && (
              <Link href={`/purchase-invoices/${id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Edit
                </Button>
              </Link>
            )}
            {invoice.status !== "approved" && invoice.status !== "cancelled" && (
              <ApproveButton action={approve} hasFlags={invoice.flags.length > 0} />
            )}
          </>
        }
      />

      {invoice.flags.length > 0 && (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4" strokeWidth={2} />
            {invoice.flags.length} {invoice.flags.length === 1 ? "issue" : "issues"} against what
            was received
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px]">
            {invoice.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}

      {invoice.status === "approved" && (
        <div className="mb-4 flex items-center gap-1.5 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-sm text-success">
          <Check className="h-4 w-4" strokeWidth={2} />
          Approved for payment.
        </div>
      )}

      <Card className="mb-4 p-4">
        <DetailGrid>
          <DetailField label="Supplier" value={party?.name} />
          <DetailField label="Supplier GSTIN" value={party?.gstin} mono />
          <DetailField label="Invoice date" value={formatDate(invoice.invoiceDate)} />
          <DetailField label="ACK no" value={invoice.ackNo} mono />
          <DetailField label="ACK date" value={formatDate(invoice.ackDate)} />
          <DetailField label="Vehicle" value={invoice.vehicleNo} mono />
          <DetailField label="PO refs" value={invoice.poRefs.join(", ")} mono />
        </DetailGrid>
        {invoice.irn && (
          <div className="mt-4 border-t border-border pt-3">
            <DetailField label="IRN" value={<span className="break-all">{invoice.irn}</span>} mono />
          </div>
        )}
        {invoice.notes && (
          <p className="mt-4 whitespace-pre-line border-t border-border pt-3 text-sm text-fg-muted">
            {invoice.notes}
          </p>
        )}
      </Card>

      <Card className="mb-4">
        <CardHeader title="Lines" subtitle={`${invoice.lines.length} lines billed`} />
        <TableWrap className="rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th className="w-10">#</Th>
                <Th>Item</Th>
                <Th>HSN</Th>
                <ThNum>Qty</ThNum>
                <ThNum>Rate</ThNum>
                <ThNum>Taxable</ThNum>
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
                  <TdNum>{formatAmount(line.taxableAmount)}</TdNum>
                  <TdNum className="font-medium">{formatAmount(line.amount)}</TdNum>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <TotalRow label="Total before tax" value={invoice.subtotal} />
              {invoice.igstAmount > 0 ? (
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
          {amountInWords(invoice.grandTotal)}
        </p>
      </Card>

      {invoice.status !== "cancelled" && (
        <div className="flex justify-end">
          <CancelDocButton
            action={cancel}
            label="Cancel bill"
            confirmTitle="Cancel this bill? No stock is affected — bills are money only."
          />
        </div>
      )}
    </>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <tr className="bg-surface-2">
      <Td
        colSpan={8}
        className={`text-right text-xs uppercase text-fg-muted ${strong ? "font-semibold" : ""}`}
      >
        {label}
      </Td>
      <TdNum className={strong ? "font-semibold" : ""}>{formatAmount(value)}</TdNum>
      <Td />
    </tr>
  );
}
