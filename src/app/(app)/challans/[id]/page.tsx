import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { ArrowLeft, Pencil } from "lucide-react";
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
import { AgingChip, DocStatusChip } from "@/components/status-chip";
import { DetailField, DetailGrid } from "@/components/detail-fields";
import { CancelDocButton } from "@/components/cancel-doc-button";
import { connectDb } from "@/db/connect";
import { Grn, JobWorkChallan, Party } from "@/db/models";
import { getPendingChallanLines } from "@/lib/allocation";
import { GRN_LINE_KIND_LABELS } from "@/lib/constants";
import { daysBetween, formatAmount, formatDate, formatQty } from "@/lib/format";
import { cancelChallan } from "../actions";

export const dynamic = "force-dynamic";

export default async function ChallanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const challan = await JobWorkChallan.findById(id).lean();
  if (!challan) notFound();

  const [party, pending, returns] = await Promise.all([
    Party.findById(challan.partyId).lean(),
    getPendingChallanLines({ challanIds: [challan._id], includeSettled: true }),
    Grn.find({ "lines.allocations.challanId": challan._id, status: { $ne: "cancelled" } })
      .sort({ grnDate: -1 })
      .lean(),
  ]);

  const pendingByLine = new Map(pending.map((line) => [line.challanLineId, line]));
  const totalPending = pending.reduce((total, line) => total + Math.max(line.pendingQty, 0), 0);
  const daysOpen = daysBetween(challan.challanDate);

  async function cancel(reason: string) {
    "use server";
    return cancelChallan(id, reason);
  }

  return (
    <>
      <Link
        href="/challans"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to challans
      </Link>

      <PageHeader
        title={`Challan ${challan.challanNo}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <DocStatusChip status={challan.status} />
            {challan.status !== "closed" && challan.status !== "cancelled" && (
              <AgingChip daysOpen={daysOpen} />
            )}
            <span className="text-fg-muted">
              {party?.name} · {formatDate(challan.challanDate)}
            </span>
          </span>
        }
        action={
          <>
            {challan.status !== "cancelled" && (
              <Link href={`/challans/${id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Edit
                </Button>
              </Link>
            )}
            {challan.status !== "cancelled" && (
              <Link href={`/grn/new?challanId=${id}`}>
                <Button variant="primary" size="sm">
                  Record return
                </Button>
              </Link>
            )}
          </>
        }
      />

      {challan.status === "cancelled" && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          Cancelled on {formatDate(challan.cancelledAt)} — {challan.cancelReason}. Its stock
          movements have been reversed.
        </div>
      )}

      <Card className="mb-4 p-4">
        <DetailGrid>
          <DetailField label="Customer" value={party?.name} />
          <DetailField label="Customer GSTIN" value={party?.gstin} mono />
          <DetailField label="Challan date" value={formatDate(challan.challanDate)} />
          <DetailField label="Return deadline" value={formatDate(challan.dueDate)} />
          <DetailField label="E-way bill" value={challan.ewayBillNo} mono />
          <DetailField label="Vehicle" value={challan.vehicleNo} mono />
          <DetailField label="TR / PO" value={challan.transportPo} mono />
          <DetailField label="Nature of process" value={challan.natureOfProcess} />
        </DetailGrid>
        {challan.notes && (
          <p className="mt-4 border-t border-border pt-3 text-sm text-fg-muted">
            {challan.notes}
          </p>
        )}
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Lines"
          subtitle={`${challan.lines.length} lines · ${formatQty(totalPending)} pcs still in our factory`}
        />
        <TableWrap className="rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th className="w-10">#</Th>
                <Th>Item code</Th>
                <Th>Description</Th>
                <Th>HSN</Th>
                <ThNum>Sent</ThNum>
                <ThNum>Returned</ThNum>
                <ThNum>Pending</ThNum>
                <ThNum>Rate</ThNum>
                <ThNum>Taxable value</ThNum>
              </tr>
            </thead>
            <tbody>
              {challan.lines.map((line) => {
                const progress = pendingByLine.get(line._id.toString());
                return (
                  <tr key={line._id.toString()} className="hover:bg-surface-2">
                    <Td className="text-fg-subtle">{line.srNo}</Td>
                    <Td>
                      <Link
                        href={`/stock/${line.itemId.toString()}`}
                        className="font-mono text-[13px] text-accent hover:underline"
                      >
                        {line.itemCode}
                      </Link>
                    </Td>
                    <Td className="max-w-[20rem] truncate">{line.description}</Td>
                    <Td className="font-mono text-xs text-fg-muted">{line.hsnCode}</Td>
                    <TdNum>{formatQty(line.qty)}</TdNum>
                    <TdNum className="text-success">
                      {formatQty(progress?.returnedQty ?? 0)}
                    </TdNum>
                    <TdNum className="font-medium">
                      {formatQty(Math.max(progress?.pendingQty ?? line.qty, 0))}
                    </TdNum>
                    <TdNum className="text-fg-muted">{formatAmount(line.rate)}</TdNum>
                    <TdNum>{formatAmount(line.taxableValue)}</TdNum>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <Td colSpan={8} className="text-right text-xs font-semibold uppercase text-fg-muted">
                  Total taxable
                </Td>
                <TdNum className="font-semibold">{formatAmount(challan.totalTaxable)}</TdNum>
              </tr>
              <tr className="bg-surface-2">
                <Td colSpan={8} className="text-right text-xs text-fg-muted">
                  CGST {challan.cgstRate}% + SGST {challan.sgstRate}% (declared, not payable)
                </Td>
                <TdNum className="text-fg-muted">
                  {formatAmount(challan.cgstAmount + challan.sgstAmount + challan.igstAmount)}
                </TdNum>
              </tr>
              <tr className="bg-surface-2">
                <Td colSpan={8} className="text-right text-xs font-semibold uppercase text-fg-muted">
                  Total value
                </Td>
                <TdNum className="font-semibold">{formatAmount(challan.totalValue)}</TdNum>
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
      </Card>

      {returns.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Returns against this challan" />
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Return note</Th>
                  <Th>Vendor doc</Th>
                  <Th>Date</Th>
                  <Th>Item</Th>
                  <Th>Kind</Th>
                  <ThNum>Qty</ThNum>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {returns.flatMap((grn) =>
                  grn.lines.flatMap((line) =>
                    line.allocations
                      .filter((alloc) => alloc.challanId.toString() === id)
                      .map((alloc) => (
                        <tr key={alloc._id.toString()} className="hover:bg-surface-2">
                          <Td>
                            <Link
                              href={`/grn/${grn._id.toString()}`}
                              className="font-mono text-[13px] text-accent hover:underline"
                            >
                              {grn.grnNo}
                            </Link>
                          </Td>
                          <Td className="text-fg-muted">{grn.vendorDocNo ?? "—"}</Td>
                          <Td className="text-fg-muted">{formatDate(grn.grnDate)}</Td>
                          <Td className="font-mono text-[13px]">{line.itemCode}</Td>
                          <Td className="text-fg-muted">
                            {GRN_LINE_KIND_LABELS[line.lineKind]}
                          </Td>
                          <TdNum>{formatQty(alloc.qty)}</TdNum>
                          <Td className="text-xs text-fg-subtle">
                            {line.rejectionReason ?? "—"}
                          </Td>
                        </tr>
                      )),
                  ),
                )}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {challan.status !== "cancelled" && (
        <div className="flex justify-end">
          <CancelDocButton
            action={cancel}
            label="Cancel challan"
            confirmTitle="Cancel this challan and reverse its stock movements?"
          />
        </div>
      )}
    </>
  );
}
