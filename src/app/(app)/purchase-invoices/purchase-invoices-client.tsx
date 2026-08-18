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
import { InvoiceStatusChip, INVOICE_LABEL } from "@/components/status-chip";
import { exportRowsToXlsx } from "@/lib/export-xlsx";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/constants";
import { formatAmount, formatDate, formatQty, toDateInputValue } from "@/lib/format";

export interface PurchaseInvoiceListRow {
  _id: string;
  invoiceNo: string;
  invoiceDate: string;
  partyName: string;
  totalQty: number;
  subtotal: number;
  totalTax: number;
  grandTotal: number;
  status: InvoiceStatus;
  flagCount: number;
}

export function PurchaseInvoicesClient({ rows }: { rows: PurchaseInvoiceListRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
  const [party, setParty] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const parties = useMemo(() => [...new Set(rows.map((r) => r.partyName))].sort(), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !`${row.invoiceNo} ${row.partyName}`.toLowerCase().includes(q)) return false;
      if (status !== "all" && row.status !== status) return false;
      if (party !== "all" && row.partyName !== party) return false;
      if (from && row.invoiceDate.slice(0, 10) < from) return false;
      if (to && row.invoiceDate.slice(0, 10) > to) return false;
      return true;
    });
  }, [rows, query, status, party, from, to]);

  const totals = visible.reduce(
    (acc, row) => ({
      qty: acc.qty + row.totalQty,
      subtotal: acc.subtotal + row.subtotal,
      tax: acc.tax + row.totalTax,
      grand: acc.grand + row.grandTotal,
    }),
    { qty: 0, subtotal: 0, tax: 0, grand: 0 },
  );

  function exportVisible() {
    exportRowsToXlsx(
      `purchase-invoices-${toDateInputValue(new Date())}.xlsx`,
      "Supplier bills",
      visible.map((row) => ({
        "Invoice no": row.invoiceNo,
        Date: formatDate(row.invoiceDate),
        Supplier: row.partyName,
        Qty: row.totalQty,
        "Before tax": row.subtotal,
        Tax: row.totalTax,
        "Grand total": row.grandTotal,
        Status: INVOICE_LABEL[row.status],
        Flags: row.flagCount,
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
            placeholder="Search invoice no or supplier…"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | InvoiceStatus)}
          className="w-auto min-w-[10rem]"
        >
          <option value="all">All statuses</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INVOICE_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select
          value={party}
          onChange={(event) => setParty(event.target.value)}
          className="w-auto min-w-[12rem]"
        >
          <option value="all">All suppliers</option>
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
            title="No bills match"
            description="Try a different search term or clear the filters."
          />
        </TableWrap>
      ) : (
        <TableWrap className="max-h-[68vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Invoice no</Th>
                <Th>Date</Th>
                <Th>Supplier</Th>
                <ThNum>Qty</ThNum>
                <ThNum>Before tax</ThNum>
                <ThNum>Tax</ThNum>
                <ThNum>Grand total</ThNum>
                <Th>Status</Th>
                <Th>Flags</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row._id} className="transition-colors hover:bg-surface-2">
                  <Td>
                    <Link
                      href={`/purchase-invoices/${row._id}`}
                      className="font-mono text-[13px] text-accent hover:underline"
                    >
                      {row.invoiceNo}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    {formatDate(row.invoiceDate)}
                  </Td>
                  <Td>{row.partyName}</Td>
                  <TdNum>{formatQty(row.totalQty)}</TdNum>
                  <TdNum>{formatAmount(row.subtotal)}</TdNum>
                  <TdNum className="text-fg-muted">{formatAmount(row.totalTax)}</TdNum>
                  <TdNum className="font-medium">{formatAmount(row.grandTotal)}</TdNum>
                  <Td>
                    <InvoiceStatusChip status={row.status} />
                  </Td>
                  <Td>
                    {row.flagCount === 0 ? (
                      <Chip tone="success">Clean</Chip>
                    ) : (
                      <Chip tone="danger">
                        {row.flagCount} {row.flagCount === 1 ? "issue" : "issues"}
                      </Chip>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 bg-surface-2">
                <Td colSpan={3} className="text-xs font-semibold uppercase text-fg-muted">
                  Total ({visible.length})
                </Td>
                <TdNum className="font-semibold">{formatQty(totals.qty)}</TdNum>
                <TdNum className="font-semibold">{formatAmount(totals.subtotal)}</TdNum>
                <TdNum className="font-semibold">{formatAmount(totals.tax)}</TdNum>
                <TdNum className="font-semibold">{formatAmount(totals.grand)}</TdNum>
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
