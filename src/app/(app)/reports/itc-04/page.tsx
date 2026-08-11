import Link from "next/link";
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
import { connectDb } from "@/db/connect";
import { Grn, JobWorkChallan, Party } from "@/db/models";
import { GRN_LINE_KIND_LABELS } from "@/lib/constants";
import { formatAmount, formatDate, formatQty, toDateInputValue } from "@/lib/format";

export const dynamic = "force-dynamic";

function quarterBounds(reference: Date) {
  const quarterStartMonth = Math.floor(reference.getMonth() / 3) * 3;
  return {
    from: new Date(reference.getFullYear(), quarterStartMonth, 1),
    to: new Date(reference.getFullYear(), quarterStartMonth + 3, 0),
  };
}

/**
 * Source data for the quarterly ITC-04 return: Table 4 (goods sent to job
 * workers) and Table 5 (goods received back). This is an extract to work from,
 * not a filed return — the numbers still go into the GST portal by hand.
 */
export default async function Itc04Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const defaults = quarterBounds(new Date());
  const from = params.from ? new Date(params.from) : defaults.from;
  const to = params.to ? new Date(params.to) : defaults.to;
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  await connectDb();

  const [challans, grns, parties] = await Promise.all([
    JobWorkChallan.find({
      challanDate: { $gte: from, $lte: end },
      status: { $ne: "cancelled" },
    })
      .sort({ challanDate: 1 })
      .lean(),
    Grn.find({ grnDate: { $gte: from, $lte: end }, status: { $ne: "cancelled" } })
      .sort({ grnDate: 1 })
      .lean(),
    Party.find().select("name gstin").lean(),
  ]);

  const partyById = new Map(parties.map((p) => [p._id.toString(), p]));

  const sentTotals = challans.reduce(
    (acc, challan) => ({
      qty: acc.qty + challan.lines.reduce((total, line) => total + line.qty, 0),
      value: acc.value + challan.totalTaxable,
    }),
    { qty: 0, value: 0 },
  );

  const receivedQty = grns.reduce(
    (total, grn) => total + grn.lines.reduce((sum, line) => sum + line.qty, 0),
    0,
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fg-muted">From</span>
            <Input type="date" name="from" defaultValue={toDateInputValue(from)} className="w-40" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fg-muted">To</span>
            <Input type="date" name="to" defaultValue={toDateInputValue(to)} className="w-40" />
          </label>
          <button
            type="submit"
            className="h-9 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            Show period
          </button>
          <p className="ml-auto text-xs text-fg-muted">
            Defaults to the current quarter. Figures are an extract to file from, not a return.
          </p>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Table 4 — Goods sent to job workers"
          subtitle={`${challans.length} challans · ${formatQty(sentTotals.qty)} pcs · ${formatAmount(sentTotals.value)}`}
        />
        {challans.length === 0 ? (
          <EmptyState title="No challans issued in this period" />
        ) : (
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Job worker GSTIN</Th>
                  <Th>Job worker</Th>
                  <Th>Challan no</Th>
                  <Th>Challan date</Th>
                  <Th>Item</Th>
                  <Th>HSN</Th>
                  <ThNum>Qty</ThNum>
                  <Th>UOM</Th>
                  <ThNum>Taxable value</ThNum>
                </tr>
              </thead>
              <tbody>
                {challans.flatMap((challan) => {
                  const party = partyById.get(challan.partyId.toString());
                  return challan.lines.map((line) => (
                    <tr key={line._id.toString()} className="hover:bg-surface-2">
                      <Td className="font-mono text-xs">{party?.gstin ?? "—"}</Td>
                      <Td>{party?.name ?? "—"}</Td>
                      <Td>
                        <Link
                          href={`/challans/${challan._id.toString()}`}
                          className="font-mono text-[13px] text-accent hover:underline"
                        >
                          {challan.challanNo}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap text-fg-muted">
                        {formatDate(challan.challanDate)}
                      </Td>
                      <Td className="max-w-[18rem] truncate">
                        <span className="font-mono text-[13px]">{line.itemCode}</span>
                        <span className="ml-1.5 text-xs text-fg-muted">{line.description}</span>
                      </Td>
                      <Td className="font-mono text-xs text-fg-muted">{line.hsnCode}</Td>
                      <TdNum>{formatQty(line.qty)}</TdNum>
                      <Td className="text-fg-muted">{line.uom}</Td>
                      <TdNum>{formatAmount(line.taxableValue)}</TdNum>
                    </tr>
                  ));
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Table 5 — Goods received back from job workers"
          subtitle={`${grns.length} return notes · ${formatQty(receivedQty)} pcs`}
        />
        {grns.length === 0 ? (
          <EmptyState title="No goods received back in this period" />
        ) : (
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Job worker GSTIN</Th>
                  <Th>Job worker</Th>
                  <Th>Original challan</Th>
                  <Th>Return note</Th>
                  <Th>Date</Th>
                  <Th>Item received</Th>
                  <Th>Nature</Th>
                  <ThNum>Qty</ThNum>
                </tr>
              </thead>
              <tbody>
                {grns.flatMap((grn) => {
                  const party = partyById.get(grn.partyId.toString());
                  return grn.lines.map((line) => (
                    <tr key={line._id.toString()} className="hover:bg-surface-2">
                      <Td className="font-mono text-xs">{party?.gstin ?? "—"}</Td>
                      <Td>{party?.name ?? "—"}</Td>
                      <Td className="font-mono text-[13px] text-fg-muted">
                        {[...new Set(line.allocations.map((a) => a.challanNo))]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </Td>
                      <Td>
                        <Link
                          href={`/grn/${grn._id.toString()}`}
                          className="font-mono text-[13px] text-accent hover:underline"
                        >
                          {grn.grnNo}
                        </Link>
                      </Td>
                      <Td className="whitespace-nowrap text-fg-muted">
                        {formatDate(grn.grnDate)}
                      </Td>
                      <Td className="max-w-[18rem] truncate">
                        <span className="font-mono text-[13px]">{line.itemCode}</span>
                        <span className="ml-1.5 text-xs text-fg-muted">{line.description}</span>
                      </Td>
                      <Td className="text-fg-muted">{GRN_LINE_KIND_LABELS[line.lineKind]}</Td>
                      <TdNum>{formatQty(line.qty)}</TdNum>
                    </tr>
                  ));
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
