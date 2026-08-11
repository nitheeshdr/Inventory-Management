"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Search } from "lucide-react";
import {
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
import { formatAmount, formatQty } from "@/lib/format";
import type { ItemStockRow } from "@/lib/queries/stock";

type Filter = "all" | "plant" | "vendor" | "low" | "zero";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All items" },
  { value: "plant", label: "In plant" },
  { value: "vendor", label: "With job workers" },
  { value: "low", label: "Below reorder level" },
  { value: "zero", label: "Nil stock" },
];

export function StockTable({ rows }: { rows: ItemStockRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (q && !`${row.itemCode} ${row.description}`.toLowerCase().includes(q)) return false;

      switch (filter) {
        case "plant":
          return row.plantQty > 0;
        case "vendor":
          return row.vendorQty > 0;
        case "low":
          return row.isBelowReorder;
        case "zero":
          return row.totalQty === 0;
        default:
          return true;
      }
    });
  }, [rows, query, filter]);

  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, row) => ({
          plant: acc.plant + row.plantQty,
          vendor: acc.vendor + row.vendorQty,
          total: acc.total + row.totalQty,
          value: acc.value + row.totalValue,
        }),
        { plant: 0, vendor: 0, total: 0, value: 0 },
      ),
    [visible],
  );

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
            placeholder="Search item code or description…"
            className="pl-8"
          />
        </div>
        <Select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          className="w-auto min-w-[12rem]"
        >
          {FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <span className="text-xs text-fg-muted">
          {visible.length} of {rows.length} items
        </span>
      </div>

      {visible.length === 0 ? (
        <TableWrap>
          <EmptyState
            title="No items match"
            description="Try a different search term or clear the filter."
          />
        </TableWrap>
      ) : (
        <TableWrap className="max-h-[70vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Item code</Th>
                <Th>Description</Th>
                <Th>Type</Th>
                <ThNum>In plant</ThNum>
                <ThNum>With job workers</ThNum>
                <ThNum>Total</ThNum>
                <ThNum>Value</ThNum>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.itemId} className="transition-colors hover:bg-surface-2">
                  <Td className="font-mono text-[13px]">
                    <Link
                      href={`/stock/${row.itemId}`}
                      className="text-accent hover:underline"
                    >
                      {row.itemCode}
                    </Link>
                  </Td>
                  <Td className="max-w-[22rem] truncate" title={row.description}>
                    <span className="inline-flex items-center gap-1.5">
                      {row.description}
                      {row.isBelowReorder && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 shrink-0 text-warning"
                          strokeWidth={2}
                        />
                      )}
                    </span>
                  </Td>
                  <Td>
                    <Chip tone={row.itemType === "processed" ? "info" : "neutral"}>
                      {row.itemType === "processed"
                        ? "Processed"
                        : row.itemType === "finished_good"
                          ? "Finished"
                          : "Component"}
                    </Chip>
                  </Td>
                  <TdNum className={row.plantQty < 0 ? "text-danger" : undefined}>
                    {formatQty(row.plantQty)}
                  </TdNum>
                  <TdNum className={row.vendorQty > 0 ? "text-warning" : "text-fg-subtle"}>
                    {formatQty(row.vendorQty)}
                  </TdNum>
                  <TdNum className="font-medium">{formatQty(row.totalQty)}</TdNum>
                  <TdNum className="text-fg-muted">{formatAmount(row.totalValue)}</TdNum>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 bg-surface-2">
                <Td colSpan={3} className="text-xs font-semibold uppercase text-fg-muted">
                  Total ({visible.length} items)
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
    </div>
  );
}
