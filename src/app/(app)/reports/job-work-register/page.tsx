import Link from "next/link";
import {
  Card,
  CardHeader,
  EmptyState,
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

/** The digital version of the plant's paper "JOB WORK OUTWARD REGISTER". */
export default async function JobWorkRegisterPage() {
  const rows = await getChallanRegister();

  const totals = rows.reduce(
    (acc, row) => ({
      sent: acc.sent + row.sentQty,
      returned: acc.returned + row.returnedQty,
      pending: acc.pending + row.pendingQty,
      value: acc.value + row.totalTaxable,
      pendingValue: acc.pendingValue + row.pendingValue,
    }),
    { sent: 0, returned: 0, pending: 0, value: 0, pendingValue: 0 },
  );

  return (
    <Card>
      <CardHeader
        title="Job-work outward register"
        subtitle={`${rows.length} challans · ${formatQty(totals.sent)} pcs sent · ${formatQty(totals.returned)} returned · ${formatQty(totals.pending)} pending`}
      />
      {rows.length === 0 ? (
        <EmptyState title="No challans recorded yet" />
      ) : (
        <TableWrap className="max-h-[68vh] overflow-y-auto rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th>Challan</Th>
                <Th>Date</Th>
                <Th>Due by</Th>
                <Th>Job worker</Th>
                <ThNum>Lines</ThNum>
                <ThNum>Sent</ThNum>
                <ThNum>Returned</ThNum>
                <ThNum>Pending</ThNum>
                <ThNum>Declared value</ThNum>
                <ThNum>Pending value</ThNum>
                <Th>Status</Th>
                <Th>Age</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="hover:bg-surface-2">
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
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(row.dueDate)}</Td>
                  <Td>{row.partyName}</Td>
                  <TdNum className="text-fg-muted">{row.lineCount}</TdNum>
                  <TdNum>{formatQty(row.sentQty)}</TdNum>
                  <TdNum className="text-success">{formatQty(row.returnedQty)}</TdNum>
                  <TdNum className="font-medium">{formatQty(row.pendingQty)}</TdNum>
                  <TdNum className="text-fg-muted">{formatAmount(row.totalTaxable)}</TdNum>
                  <TdNum>{formatAmount(row.pendingValue)}</TdNum>
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
            <tfoot>
              <tr className="sticky bottom-0 bg-surface-2">
                <Td colSpan={5} className="text-xs font-semibold uppercase text-fg-muted">
                  Total
                </Td>
                <TdNum className="font-semibold">{formatQty(totals.sent)}</TdNum>
                <TdNum className="font-semibold">{formatQty(totals.returned)}</TdNum>
                <TdNum className="font-semibold">{formatQty(totals.pending)}</TdNum>
                <TdNum className="font-semibold">{formatAmount(totals.value)}</TdNum>
                <TdNum className="font-semibold">{formatAmount(totals.pendingValue)}</TdNum>
                <Td colSpan={2} />
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}
