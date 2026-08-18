"use client";

import { useCallback, useMemo, useState } from "react";
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
import { formatAmount, formatQty, round3 } from "@/lib/format";
import type { ItemStockRow } from "@/lib/queries/stock";

type Filter = "all" | "plant" | "vendor" | "low" | "zero";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All items" },
  { value: "plant", label: "In our factory" },
  { value: "vendor", label: "With the customer" },
  { value: "low", label: "Below reorder level" },
  { value: "zero", label: "Nil stock" },
];

export interface StockLocationOption {
  _id: string;
  name: string;
  kind: string;
}

export function StockTable({
  rows,
  locations = [],
}: {
  rows: ItemStockRow[];
  locations?: StockLocationOption[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [vendorLocationId, setVendorLocationId] = useState("");

  const vendorLocation = locations.find((l) => l._id === vendorLocationId) ?? null;

  const qtyAt = (row: ItemStockRow, locationId: string) =>
    row.byLocation.find((l) => l.locationId === locationId)?.qty ?? 0;

  // When a vendor code is picked, Total/Value should reflect just what's in
  // our factory plus what's at that one account — not every location the item
  // has ever touched, which would silently disagree with the two columns
  // actually shown.
  const scopedTotals = useCallback(
    (row: ItemStockRow) => {
      if (!vendorLocationId) return { qty: row.totalQty, value: row.totalValue };
      const qty = round3(row.plantQty + qtyAt(row, vendorLocationId));
      return { qty, value: round3(qty * row.standardValue) };
    },
    [vendorLocationId],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (q && !`${row.itemCode} ${row.description}`.toLowerCase().includes(q)) return false;

      switch (filter) {
        case "plant":
          return row.plantQty > 0;
        case "vendor":
          return row.offSiteQty > 0;
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
        (acc, row) => {
          const scoped = scopedTotals(row);
          return {
            plant: acc.plant + row.plantQty,
            vendor: acc.vendor + (vendorLocationId ? qtyAt(row, vendorLocationId) : row.offSiteQty),
            total: acc.total + scoped.qty,
            value: acc.value + scoped.value,
          };
        },
        { plant: 0, vendor: 0, total: 0, value: 0 },
      ),
    [visible, vendorLocationId, scopedTotals],
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
        {locations.length > 0 && (
          <Select
            value={vendorLocationId}
            onChange={(event) => setVendorLocationId(event.target.value)}
            className="w-auto min-w-[14rem]"
          >
            <option value="">All vendor codes</option>
            {locations.map((location) => (
              <option key={location._id} value={location._id}>
                {location.name}
              </option>
            ))}
          </Select>
        )}
        <span className="text-xs text-fg-muted">
          {visible.length} of {rows.length} items
        </span>
      </div>

      {vendorLocation && visible.every((row) => qtyAt(row, vendorLocationId) === 0) && (
        <div className="mb-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
          No inward challan or return has ever moved stock through {vendorLocation.name} — every
          item below is genuinely at 0 for this account, not a broken filter.
        </div>
      )}

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
                <ThNum>In our factory</ThNum>
                <ThNum>{vendorLocation ? vendorLocation.name : "With customer"}</ThNum>
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
                  {(() => {
                    const vendorQty = vendorLocationId ? qtyAt(row, vendorLocationId) : row.offSiteQty;
                    return (
                      <TdNum
                        className={
                          vendorQty < 0
                            ? "text-danger"
                            : vendorQty > 0
                              ? "text-warning"
                              : "text-fg-subtle"
                        }
                      >
                        {formatQty(vendorQty)}
                      </TdNum>
                    );
                  })()}
                  {(() => {
                    const scoped = scopedTotals(row);
                    return (
                      <>
                        <TdNum className="font-medium">{formatQty(scoped.qty)}</TdNum>
                        <TdNum className="text-fg-muted">{formatAmount(scoped.value)}</TdNum>
                      </>
                    );
                  })()}
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
