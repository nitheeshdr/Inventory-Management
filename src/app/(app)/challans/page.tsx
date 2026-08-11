import Link from "next/link";
import { Plus } from "lucide-react";
import {
  Button,
  EmptyState,
  PageHeader,
  Table,
  TableWrap,
  Td,
  TdNum,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { AgingChip, DocStatusChip } from "@/components/status-chip";
import { getChallanRegister } from "@/lib/queries/challans";
import { formatAmount, formatDate, formatQty } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ChallansPage() {
  const rows = await getChallanRegister();

  const totals = rows.reduce(
    (acc, row) => ({
      sent: acc.sent + row.sentQty,
      pending: acc.pending + row.pendingQty,
      value: acc.value + row.pendingValue,
    }),
    { sent: 0, pending: 0, value: 0 },
  );

  return (
    <>
      <PageHeader
        title="Outward job-work challans"
        subtitle={
          rows.length
            ? `${formatQty(totals.pending)} pcs still with job workers, worth about ${formatAmount(totals.value)}.`
            : "Goods sent out for processing under Section 143."
        }
        action={
          <Link href="/challans/new">
            <Button variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New challan
            </Button>
          </Link>
        }
      />

      {rows.length === 0 ? (
        <TableWrap>
          <EmptyState
            title="No challans yet"
            description="Create one when goods leave the plant for a job worker."
            action={
              <Link href="/challans/new">
                <Button variant="primary" size="sm">
                  New challan
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
                <Th>Challan no</Th>
                <Th>Date</Th>
                <Th>Job worker</Th>
                <ThNum>Lines</ThNum>
                <ThNum>Sent</ThNum>
                <ThNum>Returned</ThNum>
                <ThNum>Pending</ThNum>
                <ThNum>Pending value</ThNum>
                <Th>Status</Th>
                <Th>Deadline</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="transition-colors hover:bg-surface-2">
                  <Td>
                    <Link
                      href={`/challans/${row._id}`}
                      className="font-mono text-[13px] text-accent hover:underline"
                    >
                      {row.challanNo}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {formatDate(row.challanDate)}
                  </Td>
                  <Td>{row.partyName}</Td>
                  <TdNum className="text-fg-muted">{row.lineCount}</TdNum>
                  <TdNum>{formatQty(row.sentQty)}</TdNum>
                  <TdNum className="text-success">{formatQty(row.returnedQty)}</TdNum>
                  <TdNum className="font-medium">{formatQty(row.pendingQty)}</TdNum>
                  <TdNum className="text-fg-muted">{formatAmount(row.pendingValue)}</TdNum>
                  <Td>
                    <DocStatusChip status={row.status} />
                  </Td>
                  <Td>
                    {row.status === "closed" || row.status === "cancelled" ? (
                      <span className="text-xs text-fg-subtle">—</span>
                    ) : (
                      <AgingChip daysOpen={row.daysOpen} />
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
