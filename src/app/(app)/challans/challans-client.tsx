"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import {
  Button,
  EmptyState,
  Input,
  Select,
  Table,
  TableWrap,
  Td,
  TdNum,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { AgingChip, DocStatusChip, DOC_LABEL } from "@/components/status-chip";
import { exportRowsToXlsx } from "@/lib/export-xlsx";
import { DOC_STATUSES, type DocStatus } from "@/lib/constants";
import { formatAmount, formatDate, formatQty, toDateInputValue } from "@/lib/format";
import type { ChallanRegisterRow } from "@/lib/queries/challans";

export function ChallansClient({ rows }: { rows: ChallanRegisterRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | DocStatus>("all");
  const [party, setParty] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const parties = useMemo(
    () => [...new Set(rows.map((r) => r.partyName))].sort(),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !`${row.challanNo} ${row.partyName}`.toLowerCase().includes(q)) return false;
      if (status !== "all" && row.status !== status) return false;
      if (party !== "all" && row.partyName !== party) return false;
      if (from && row.challanDate.slice(0, 10) < from) return false;
      if (to && row.challanDate.slice(0, 10) > to) return false;
      return true;
    });
  }, [rows, query, status, party, from, to]);

  const totals = visible.reduce(
    (acc, row) => ({
      sent: acc.sent + row.sentQty,
      pending: acc.pending + row.pendingQty,
      value: acc.value + row.pendingValue,
    }),
    { sent: 0, pending: 0, value: 0 },
  );

  function exportVisible() {
    exportRowsToXlsx(
      `inward-challans-${toDateInputValue(new Date())}.xlsx`,
      "Challans",
      visible.map((row) => ({
        "Challan no": row.challanNo,
        Date: formatDate(row.challanDate),
        Customer: row.partyName,
        Lines: row.lineCount,
        Sent: row.sentQty,
        Returned: row.returnedQty,
        Pending: row.pendingQty,
        "Pending value": row.pendingValue,
        Status: DOC_LABEL[row.status],
        "Days open": row.daysOpen,
      })),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
            strokeWidth={1.75}
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search challan no or customer…"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | DocStatus)}
          className="w-auto min-w-[10rem]"
        >
          <option value="all">All statuses</option>
          {DOC_STATUSES.map((s) => (
            <option key={s} value={s}>
              {DOC_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select
          value={party}
          onChange={(event) => setParty(event.target.value)}
          className="w-auto min-w-[12rem]"
        >
          <option value="all">All customers</option>
          {parties.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="w-auto"
          aria-label="From date"
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="w-auto"
          aria-label="To date"
        />
        <span className="text-xs text-fg-muted">
          {visible.length} of {rows.length}
        </span>
        <Button variant="outline" size="sm" disabled={visible.length === 0} onClick={exportVisible}>
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Export
        </Button>
      </div>

      {visible.length === 0 ? (
        <TableWrap>
          <EmptyState
            title="No challans match"
            description="Try a different search term or clear the filters."
          />
        </TableWrap>
      ) : (
        <TableWrap className="max-h-[68vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Challan no</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
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
              {visible.map((row) => (
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
            <tfoot>
              <tr className="sticky bottom-0 bg-surface-2">
                <Td colSpan={4} className="text-xs font-semibold uppercase text-fg-muted">
                  Total ({visible.length})
                </Td>
                <TdNum className="font-semibold">{formatQty(totals.sent)}</TdNum>
                <Td />
                <TdNum className="font-semibold">{formatQty(totals.pending)}</TdNum>
                <TdNum className="font-semibold">{formatAmount(totals.value)}</TdNum>
                <Td />
                <Td />
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
