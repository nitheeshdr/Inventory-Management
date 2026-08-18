import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, EmptyState, PageHeader, TableWrap } from "@/components/ui/primitives";
import { getChallanRegister } from "@/lib/queries/challans";
import { formatAmount, formatQty } from "@/lib/format";
import { ChallansClient } from "./challans-client";

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
        title="Inward job-work challans"
        subtitle={
          rows.length
            ? `${formatQty(totals.pending)} pcs still in our factory, worth about ${formatAmount(totals.value)}.`
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
            description="Record one when a principal delivers goods for processing."
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
        <ChallansClient rows={rows} />
      )}
    </>
  );
}
