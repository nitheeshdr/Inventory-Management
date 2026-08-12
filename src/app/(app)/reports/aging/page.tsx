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
import { AgingChip } from "@/components/status-chip";
import { getPendingChallanLines } from "@/lib/allocation";
import { connectDb } from "@/db/connect";
import { Party } from "@/db/models";
import { AGING_BUCKETS } from "@/lib/constants";
import { formatAmount, formatDate, formatQty, round3 } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The report that matters most: GST requires job-work goods back within one
 * year, and anything past that becomes a deemed supply the plant has to pay tax
 * on. Sorted oldest first so the top of the page is the work list.
 */
export default async function AgingReportPage() {
  await connectDb();

  const [pending, parties] = await Promise.all([
    getPendingChallanLines(),
    Party.find().select("name").lean(),
  ]);

  const partyName = new Map(parties.map((p) => [p._id.toString(), p.name]));
  const sorted = [...pending].sort((a, b) => b.daysOpen - a.daysOpen);

  const buckets = AGING_BUCKETS.map((bucket) => {
    const lines = pending.filter(
      (line) => line.daysOpen >= bucket.min && line.daysOpen <= bucket.max,
    );
    return {
      ...bucket,
      lines: lines.length,
      qty: round3(lines.reduce((total, line) => total + line.pendingQty, 0)),
      value: round3(lines.reduce((total, line) => total + line.pendingValue, 0)),
    };
  });

  const overdue = pending.filter((line) => line.isOverdue);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {buckets.map((bucket) => (
          <Card
            key={bucket.key}
            className={cn(
              "p-4",
              bucket.key === "overdue" && bucket.lines > 0 && "border-danger/40 bg-danger-soft",
            )}
          >
            <p
              className={cn(
                "text-xs",
                bucket.key === "overdue" ? "font-medium text-danger" : "text-fg-muted",
              )}
            >
              {bucket.label}
            </p>
            <p className="tnum mt-1 text-xl font-semibold">{formatQty(bucket.qty)}</p>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              {bucket.lines} {bucket.lines === 1 ? "line" : "lines"} ·{" "}
              {formatAmount(bucket.value)}
            </p>
          </Card>
        ))}
      </div>

      {overdue.length > 0 && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {overdue.length} {overdue.length === 1 ? "line has" : "lines have"} been with us for more
          than a year. Under Section 143 that becomes a deemed supply for the principal — return
          them or agree how the tax is handled.
        </div>
      )}

      <Card>
        <CardHeader
          title="Goods still to return"
          subtitle="Oldest first. Every row is a quantity still sitting in our factory."
        />
        {sorted.length === 0 ? (
          <EmptyState
            title="No customer goods on hand"
            description="Everything received has been returned."
          />
        ) : (
          <TableWrap className="max-h-[62vh] overflow-y-auto rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Challan</Th>
                  <Th>Date</Th>
                  <Th>Customer</Th>
                  <Th>Item</Th>
                  <ThNum>Sent</ThNum>
                  <ThNum>Returned</ThNum>
                  <ThNum>Pending</ThNum>
                  <ThNum>Value</ThNum>
                  <Th>Due</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((line) => (
                  <tr
                    key={line.challanLineId}
                    className={cn("hover:bg-surface-2", line.isOverdue && "bg-danger-soft/40")}
                  >
                    <Td>
                      <Link
                        href={`/challans/${line.challanId}`}
                        className="font-mono text-[13px] text-accent hover:underline"
                      >
                        {line.challanNo}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-fg-muted">
                      {formatDate(line.challanDate)}
                    </Td>
                    <Td>{partyName.get(line.partyId) ?? "—"}</Td>
                    <Td className="max-w-[18rem] truncate">
                      <span className="font-mono text-[13px]">{line.itemCode}</span>
                      <span className="ml-1.5 text-xs text-fg-muted">{line.description}</span>
                    </Td>
                    <TdNum>{formatQty(line.sentQty)}</TdNum>
                    <TdNum className="text-success">{formatQty(line.returnedQty)}</TdNum>
                    <TdNum className="font-medium">{formatQty(line.pendingQty)}</TdNum>
                    <TdNum className="text-fg-muted">{formatAmount(line.pendingValue)}</TdNum>
                    <Td className="whitespace-nowrap text-fg-muted">
                      {formatDate(line.dueDate)}
                    </Td>
                    <Td>
                      <AgingChip daysOpen={line.daysOpen} />
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
