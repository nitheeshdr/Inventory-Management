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
import { DocStatusChip } from "@/components/status-chip";
import { connectDb } from "@/db/connect";
import { Location, StockAdjustment } from "@/db/models";
import { formatDate, formatQty, round3 } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdjustmentsPage() {
  await connectDb();

  const [adjustments, locations] = await Promise.all([
    StockAdjustment.find().sort({ adjustmentDate: -1, createdAt: -1 }).lean(),
    Location.find().select("name").lean(),
  ]);

  const locationName = new Map(locations.map((l) => [l._id.toString(), l.name]));

  return (
    <>
      <PageHeader
        title="Stock adjustments"
        subtitle="Opening balances and physical-count corrections."
        action={
          <Link href="/adjustments/new">
            <Button variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New adjustment
            </Button>
          </Link>
        }
      />

      {adjustments.length === 0 ? (
        <TableWrap>
          <EmptyState
            title="No adjustments yet"
            description="Post one to set opening balances before the first challan goes out."
            action={
              <Link href="/adjustments/new">
                <Button variant="primary" size="sm">
                  New adjustment
                </Button>
              </Link>
            }
          />
        </TableWrap>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>No</Th>
                <Th>Date</Th>
                <Th>Location</Th>
                <Th>Reason</Th>
                <ThNum>Lines</ThNum>
                <ThNum>Added</ThNum>
                <ThNum>Removed</ThNum>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((adjustment) => {
                const added = round3(
                  adjustment.lines
                    .filter((line) => line.qty > 0)
                    .reduce((total, line) => total + line.qty, 0),
                );
                const removed = round3(
                  adjustment.lines
                    .filter((line) => line.qty < 0)
                    .reduce((total, line) => total + Math.abs(line.qty), 0),
                );

                return (
                  <tr key={adjustment._id.toString()} className="hover:bg-surface-2">
                    <Td className="font-mono text-[13px]">{adjustment.adjustmentNo}</Td>
                    <Td className="whitespace-nowrap text-fg-muted">
                      {formatDate(adjustment.adjustmentDate)}
                    </Td>
                    <Td>{locationName.get(adjustment.locationId.toString()) ?? "—"}</Td>
                    <Td className="text-fg-muted">{adjustment.reason}</Td>
                    <TdNum className="text-fg-muted">{adjustment.lines.length}</TdNum>
                    <TdNum className="text-success">{formatQty(added)}</TdNum>
                    <TdNum className="text-danger">{formatQty(removed)}</TdNum>
                    <Td>
                      <DocStatusChip status={adjustment.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
