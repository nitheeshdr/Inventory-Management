import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardHeader,
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
import { connectDb } from "@/db/connect";
import { Item } from "@/db/models";
import { itemLedger, stockOnHand } from "@/lib/ledger";
import { getPendingChallanLines } from "@/lib/allocation";
import { DOC_TYPE_LABELS } from "@/lib/constants";
import { formatAmount, formatDate, formatQty } from "@/lib/format";
import { AgingChip } from "@/components/status-chip";

export const dynamic = "force-dynamic";

const DOC_HREF: Record<string, string> = {
  job_work_challan: "/challans",
  grn: "/grn",
  sales_invoice: "/sales-invoices",
  stock_adjustment: "/adjustments",
};

export default async function ItemLedgerPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  if (!Types.ObjectId.isValid(itemId)) notFound();

  await connectDb();
  const item = await Item.findById(itemId).lean();
  if (!item) notFound();

  const [balances, entries, pending] = await Promise.all([
    stockOnHand({ itemIds: [itemId] }),
    itemLedger(itemId),
    getPendingChallanLines({ itemIds: [itemId] }),
  ]);

  const total = balances.reduce((sum, row) => sum + row.qty, 0);

  return (
    <>
      <Link
        href="/stock"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to stock
      </Link>

      <PageHeader
        title={item.itemCode}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {item.description}
            {item.hsnCode && <Chip tone="neutral">HSN {item.hsnCode}</Chip>}
            <Chip tone={item.itemType === "processed" ? "info" : "neutral"}>
              {item.itemType.replace("_", " ")}
            </Chip>
          </span>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-fg-muted">Total on hand</p>
          <p className="tnum mt-1 text-2xl font-semibold">
            {formatQty(total)}{" "}
            <span className="text-sm font-normal text-fg-subtle">{item.uom}</span>
          </p>
        </Card>
        {balances.map((row) => (
          <Card key={row.locationId} className="p-4">
            <p className="truncate text-xs text-fg-muted">{row.locationName}</p>
            <p className="tnum mt-1 text-2xl font-semibold">
              {formatQty(row.qty)}{" "}
              <span className="text-sm font-normal text-fg-subtle">{item.uom}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              ≈ {formatAmount(row.value)} at ₹{item.standardValue}/pc
            </p>
          </Card>
        ))}
      </div>

      {pending.length > 0 && (
        <Card className="mb-5">
          <CardHeader
            title="Lying with job workers"
            subtitle="Open challan lines still awaiting return, oldest first."
          />
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Challan</Th>
                  <Th>Date</Th>
                  <ThNum>Sent</ThNum>
                  <ThNum>Returned</ThNum>
                  <ThNum>Pending</ThNum>
                  <Th>Deadline</Th>
                </tr>
              </thead>
              <tbody>
                {pending.map((line) => (
                  <tr key={line.challanLineId} className="hover:bg-surface-2">
                    <Td>
                      <Link
                        href={`/challans/${line.challanId}`}
                        className="font-mono text-[13px] text-accent hover:underline"
                      >
                        {line.challanNo}
                      </Link>
                    </Td>
                    <Td className="text-fg-muted">{formatDate(line.challanDate)}</Td>
                    <TdNum>{formatQty(line.sentQty)}</TdNum>
                    <TdNum className="text-fg-muted">{formatQty(line.returnedQty)}</TdNum>
                    <TdNum className="font-medium">{formatQty(line.pendingQty)}</TdNum>
                    <Td>
                      <AgingChip daysOpen={line.daysOpen} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Movement ledger"
          subtitle="Every posting for this item, with a running balance per location."
        />
        {entries.length === 0 ? (
          <EmptyState
            title="No movements yet"
            description="This item has never been issued, received or adjusted."
          />
        ) : (
          <TableWrap className="max-h-[60vh] overflow-y-auto rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Document</Th>
                  <Th>Location</Th>
                  <ThNum>In</ThNum>
                  <ThNum>Out</ThNum>
                  <ThNum>Balance</ThNum>
                  <Th>Remark</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry._id}
                    className={entry.isReversal ? "bg-danger-soft/40" : "hover:bg-surface-2"}
                  >
                    <Td className="whitespace-nowrap text-fg-muted">
                      {formatDate(entry.movementDate)}
                    </Td>
                    <Td>
                      <Link
                        href={`${DOC_HREF[entry.docType] ?? "/"}/${entry.docId}`}
                        className="text-accent hover:underline"
                      >
                        {entry.docNo || DOC_TYPE_LABELS[entry.docType]}
                      </Link>
                      <span className="ml-1.5 text-[11px] text-fg-subtle">
                        {DOC_TYPE_LABELS[entry.docType]}
                      </span>
                    </Td>
                    <Td className="text-fg-muted">{entry.locationName}</Td>
                    <TdNum className="text-success">
                      {entry.qty > 0 ? formatQty(entry.qty) : ""}
                    </TdNum>
                    <TdNum className="text-danger">
                      {entry.qty < 0 ? formatQty(Math.abs(entry.qty)) : ""}
                    </TdNum>
                    <TdNum className="font-medium">{formatQty(entry.balance)}</TdNum>
                    <Td className="max-w-[16rem] truncate text-xs text-fg-subtle">
                      {entry.remark ?? ""}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
