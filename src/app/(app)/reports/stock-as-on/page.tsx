import {
  Card,
  CardHeader,
  EmptyState,
  Input,
  Table,
  TableWrap,
  Td,
  TdNum,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { getItemStock } from "@/lib/queries/stock";
import { formatAmount, formatDate, formatQty, toDateInputValue } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Replays the ledger up to a chosen date. No snapshots are stored — the balance
 * simply is the sum of everything posted on or before that day.
 */
export default async function StockAsOnPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const asOn = date ? new Date(date) : new Date();
  const rows = (await getItemStock(asOn)).filter((row) => row.totalQty !== 0);

  const totals = rows.reduce(
    (acc, row) => ({
      plant: acc.plant + row.plantQty,
      vendor: acc.vendor + row.vendorQty,
      total: acc.total + row.totalQty,
      value: acc.value + row.totalValue,
    }),
    { plant: 0, vendor: 0, total: 0, value: 0 },
  );

  return (
    <Card>
      <CardHeader
        title={`Stock as on ${formatDate(asOn)}`}
        subtitle="Pick any past date — the balance is recomputed from the movement ledger."
        action={
          <form className="flex items-end gap-2">
            <Input
              type="date"
              name="date"
              defaultValue={toDateInputValue(asOn)}
              className="h-8 w-40"
            />
            <button
              type="submit"
              className="h-8 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              Show
            </button>
          </form>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No stock on that date"
          description="Nothing had been posted to the ledger on or before this date."
        />
      ) : (
        <TableWrap className="max-h-[66vh] overflow-y-auto rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th>Item code</Th>
                <Th>Description</Th>
                <ThNum>In plant</ThNum>
                <ThNum>With job workers</ThNum>
                <ThNum>Total</ThNum>
                <ThNum>Value</ThNum>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.itemId} className="hover:bg-surface-2">
                  <Td className="font-mono text-[13px]">{row.itemCode}</Td>
                  <Td className="max-w-[24rem] truncate">{row.description}</Td>
                  <TdNum>{formatQty(row.plantQty)}</TdNum>
                  <TdNum className="text-warning">{formatQty(row.vendorQty)}</TdNum>
                  <TdNum className="font-medium">{formatQty(row.totalQty)}</TdNum>
                  <TdNum className="text-fg-muted">{formatAmount(row.totalValue)}</TdNum>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 bg-surface-2">
                <Td colSpan={2} className="text-xs font-semibold uppercase text-fg-muted">
                  Total ({rows.length} items)
                </Td>
                <TdNum className="font-semibold">{formatQty(totals.plant)}</TdNum>
                <TdNum className="font-semibold">{formatQty(totals.vendor)}</TdNum>
                <TdNum className="font-semibold">{formatQty(totals.total)}</TdNum>
                <TdNum className="font-semibold">{formatAmount(totals.value)}</TdNum>
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}
