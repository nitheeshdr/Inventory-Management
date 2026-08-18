"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import {
  Button,
  Chip,
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
import { DocStatusChip, DOC_LABEL } from "@/components/status-chip";
import { exportRowsToXlsx } from "@/lib/export-xlsx";
import { formatDate, formatQty, toDateInputValue } from "@/lib/format";

export interface GrnListRow {
  _id: string;
  grnNo: string;
  vendorDocNo: string;
  grnDate: string;
  partyName: string;
  lineCount: number;
  processed: number;
  rejected: number;
  status: "open" | "cancelled";
}

export function GrnListClient({ rows }: { rows: GrnListRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "cancelled">("all");
  const [party, setParty] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const parties = useMemo(() => [...new Set(rows.map((r) => r.partyName))].sort(), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !`${row.grnNo} ${row.vendorDocNo} ${row.partyName}`.toLowerCase().includes(q))
        return false;
      if (status !== "all" && row.status !== status) return false;
      if (party !== "all" && row.partyName !== party) return false;
      if (from && row.grnDate.slice(0, 10) < from) return false;
      if (to && row.grnDate.slice(0, 10) > to) return false;
      return true;
    });
  }, [rows, query, status, party, from, to]);

  function exportVisible() {
    exportRowsToXlsx(
      `outward-returns-${toDateInputValue(new Date())}.xlsx`,
      "Returns",
      visible.map((row) => ({
        "GRN no": row.grnNo,
        "Vendor note": row.vendorDocNo || "—",
        Date: formatDate(row.grnDate),
        Customer: row.partyName,
        Lines: row.lineCount,
        Processed: row.processed,
        Rejected: row.rejected,
        "Total qty": row.processed + row.rejected,
        Status: row.status === "cancelled" ? "Cancelled" : "Despatched",
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
            placeholder="Search GRN no, vendor note or customer…"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | "open" | "cancelled")}
          className="w-auto min-w-[10rem]"
        >
          <option value="all">All statuses</option>
          <option value="open">Despatched</option>
          <option value="cancelled">{DOC_LABEL.cancelled}</option>
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
            title="No return notes match"
            description="Try a different search term or clear the filters."
          />
        </TableWrap>
      ) : (
        <TableWrap className="max-h-[68vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>GRN no</Th>
                <Th>Vendor note</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <ThNum>Lines</ThNum>
                <ThNum>Processed</ThNum>
                <ThNum>Rejected</ThNum>
                <ThNum>Total qty</ThNum>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row._id} className="transition-colors hover:bg-surface-2">
                  <Td>
                    <Link
                      href={`/grn/${row._id}`}
                      className="font-mono text-[13px] text-accent hover:underline"
                    >
                      {row.grnNo}
                    </Link>
                  </Td>
                  <Td className="font-mono text-[13px] text-fg-muted">
                    {row.vendorDocNo || "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(row.grnDate)}</Td>
                  <Td>{row.partyName}</Td>
                  <TdNum className="text-fg-muted">{row.lineCount}</TdNum>
                  <TdNum className="text-success">{formatQty(row.processed)}</TdNum>
                  <TdNum className="text-warning">{formatQty(row.rejected)}</TdNum>
                  <TdNum className="font-medium">{formatQty(row.processed + row.rejected)}</TdNum>
                  <Td>
                    {row.status === "cancelled" ? (
                      <DocStatusChip status="cancelled" />
                    ) : (
                      <Chip tone="success">Despatched</Chip>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
