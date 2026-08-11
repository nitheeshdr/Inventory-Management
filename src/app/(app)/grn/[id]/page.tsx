import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { ArrowLeft, Printer } from "lucide-react";
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
import { Grn, Item, Party } from "@/db/models";
import { GRN_LINE_KIND_LABELS } from "@/lib/constants";
import { formatDate, formatQty } from "@/lib/format";
import { cancelGrn } from "../actions";

export const dynamic = "force-dynamic";

export default async function GrnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const grn = await Grn.findById(id).lean();
  if (!grn) notFound();

  const inputItemIds = grn.lines
    .map((line) => line.inputItemId)
    .filter((value): value is Types.ObjectId => Boolean(value));

  const [party, inputItems] = await Promise.all([
    Party.findById(grn.partyId).lean(),
    Item.find({ _id: { $in: inputItemIds } })
      .select("itemCode description")
      .lean(),
  ]);

  const inputById = new Map(inputItems.map((item) => [item._id.toString(), item]));
  const totalQty = grn.lines.reduce((total, line) => total + line.qty, 0);

  async function cancel(reason: string) {
    "use server";
    return cancelGrn(id, reason);
  }

  return (
    <>
      <Link
        href="/grn"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to return notes
      </Link>

      <PageHeader
        title={`Return note ${grn.grnNo}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {grn.status === "cancelled" ? (
              <DocStatusChip status="cancelled" />
            ) : (
              <Chip tone="success">Received</Chip>
            )}
            <span className="text-fg-muted">
              {party?.name} · {formatDate(grn.grnDate)}
              {grn.vendorDocNo ? ` · their note ${grn.vendorDocNo}` : ""}
            </span>
          </span>
        }
        action={
          <>
            <Link href={`/grn/${id}/print`} target="_blank">
              <Button variant="outline" size="sm">
                <Printer className="h-3.5 w-3.5" strokeWidth={1.75} />
                Print
              </Button>
            </Link>
            {grn.status !== "cancelled" && (
              <Link href={`/grn/${id}/edit`}>
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </Link>
            )}
          </>
        }
      />

      {grn.status === "cancelled" && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          Cancelled on {formatDate(grn.cancelledAt)} — {grn.cancelReason}. The returned quantities
          have gone back to pending on their challans.
        </div>
      )}

      <Card className="mb-4 p-4">
        <DetailGrid>
          <DetailField label="Job worker" value={party?.name} />
          <DetailField label="Their note no" value={grn.vendorDocNo} mono />
          <DetailField label="Date" value={formatDate(grn.grnDate)} />
          <DetailField label="Vehicle" value={grn.vehicleNo} mono />
          <DetailField label="GR no" value={grn.grNo} />
          <DetailField label="Transport / remark" value={grn.transportRemark} />
        </DetailGrid>
        {grn.notes && (
          <p className="mt-4 border-t border-border pt-3 text-sm text-fg-muted">{grn.notes}</p>
        )}
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Lines"
          subtitle={`${grn.lines.length} lines · ${formatQty(totalQty)} pcs received`}
        />
        <TableWrap className="rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th className="w-10">#</Th>
                <Th>Against challan</Th>
                <Th>Sent as</Th>
                <Th>Received as</Th>
                <Th>Kind</Th>
                <ThNum>Qty</ThNum>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {grn.lines.map((line) => {
                const input = line.inputItemId
                  ? inputById.get(line.inputItemId.toString())
                  : undefined;

                return (
                  <tr key={line._id.toString()} className="hover:bg-surface-2">
                    <Td className="text-fg-subtle">{line.srNo}</Td>
                    <Td className="font-mono text-[13px]">
                      {line.allocations.map((alloc) => (
                        <Link
                          key={alloc._id.toString()}
                          href={`/challans/${alloc.challanId.toString()}`}
                          className="mr-1.5 text-accent hover:underline"
                        >
                          {alloc.challanNo || "challan"} ({formatQty(alloc.qty)})
                        </Link>
                      ))}
                    </Td>
                    <Td>
                      <span className="font-mono text-[13px]">{input?.itemCode ?? "—"}</span>
                      <span className="ml-1.5 text-xs text-fg-muted">
                        {input?.description ?? ""}
                      </span>
                    </Td>
                    <Td>
                      <Link
                        href={`/stock/${line.itemId.toString()}`}
                        className="font-mono text-[13px] text-accent hover:underline"
                      >
                        {line.itemCode}
                      </Link>
                      <span className="ml-1.5 text-xs text-fg-muted">{line.description}</span>
                    </Td>
                    <Td>
                      <Chip tone={line.lineKind === "processed" ? "success" : "warning"}>
                        {GRN_LINE_KIND_LABELS[line.lineKind]}
                      </Chip>
                    </Td>
                    <TdNum className="font-medium">{formatQty(line.qty)}</TdNum>
                    <Td className="text-xs text-fg-subtle">{line.rejectionReason ?? "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {grn.status !== "cancelled" && (
        <div className="flex justify-end">
          <CancelDocButton
            action={cancel}
            label="Cancel return note"
            confirmTitle="Cancel this return note and put the quantities back as pending?"
          />
        </div>
      )}
    </>
  );
}
