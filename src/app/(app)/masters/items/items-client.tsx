"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  TableWrap,
  Td,
  TdNum,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { SidePanel } from "@/components/ui/modal";
import { ITEM_TYPES, UOMS, type ItemType } from "@/lib/constants";
import { formatAmount, formatQty } from "@/lib/format";
import { saveItem, type ItemInput } from "../actions";

export interface ItemRow {
  _id: string;
  itemCode: string;
  description: string;
  hsnCode: string;
  uom: string;
  itemType: ItemType;
  standardValue: number;
  gstRate: number;
  reorderLevel: number;
  isActive: boolean;
  isFoc: boolean;
}

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  component: "Component (sent out)",
  processed: "Processed (comes back)",
  finished_good: "Finished good",
  raw_material: "Raw material",
};

function blank(): ItemRow {
  return {
    _id: "",
    itemCode: "",
    description: "",
    hsnCode: "",
    uom: "PC",
    itemType: "component",
    standardValue: 0,
    gstRate: 18,
    reorderLevel: 0,
    isActive: true,
    isFoc: false,
  };
}

export function ItemsClient({ rows }: { rows: ItemRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ItemType>("all");
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter !== "all" && row.itemType !== typeFilter) return false;
      if (!q) return true;
      return `${row.itemCode} ${row.description}`.toLowerCase().includes(q);
    });
  }, [rows, query, typeFilter]);

  function submit() {
    if (!editing) return;
    setError(null);
    setFieldErrors({});

    const input: ItemInput = {
      itemCode: editing.itemCode,
      description: editing.description,
      hsnCode: editing.hsnCode,
      uom: editing.uom as (typeof UOMS)[number],
      itemType: editing.itemType,
      standardValue: Number(editing.standardValue) || 0,
      gstRate: Number(editing.gstRate) || 0,
      reorderLevel: Number(editing.reorderLevel) || 0,
      isActive: editing.isActive,
      isFoc: editing.isFoc,
    };

    startTransition(async () => {
      const result = await saveItem(input, editing._id || undefined);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as "all" | ItemType)}
          className="w-auto min-w-[14rem]"
        >
          <option value="all">All types</option>
          {ITEM_TYPES.map((type) => (
            <option key={type} value={type}>
              {ITEM_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <Button variant="primary" size="sm" onClick={() => setEditing(blank())}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          New item
        </Button>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            title="No items match"
            description="Adjust the search, or add the item code."
            action={
              <Button variant="primary" size="sm" onClick={() => setEditing(blank())}>
                New item
              </Button>
            }
          />
        </Card>
      ) : (
        <TableWrap className="max-h-[68vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Item code</Th>
                <Th>Description</Th>
                <Th>HSN</Th>
                <Th>Type</Th>
                <Th>UOM</Th>
                <ThNum>Standard value</ThNum>
                <ThNum>GST %</ThNum>
                <ThNum>Reorder level</ThNum>
                <Th>FOC</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row._id} className="transition-colors hover:bg-surface-2">
                  <Td className="font-mono text-[13px]">{row.itemCode}</Td>
                  <Td className="max-w-[22rem] truncate">{row.description}</Td>
                  <Td className="font-mono text-xs text-fg-muted">{row.hsnCode || "—"}</Td>
                  <Td>
                    <Chip tone={row.itemType === "processed" ? "info" : "neutral"}>
                      {ITEM_TYPE_LABELS[row.itemType].split(" (")[0]}
                    </Chip>
                  </Td>
                  <Td className="text-fg-muted">{row.uom}</Td>
                  <TdNum>{formatAmount(row.standardValue)}</TdNum>
                  <TdNum className="text-fg-muted">{row.gstRate}</TdNum>
                  <TdNum className="text-fg-muted">{formatQty(row.reorderLevel)}</TdNum>
                  <Td>
                    {row.isFoc && <Chip tone="warning">FOC</Chip>}
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                      Edit
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <SidePanel
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?._id ? `Edit ${editing.itemCode}` : "New item"}
        description="Item codes must match exactly what the plant software prints."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save item"}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {error && (
              <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <Field label="Item code" required error={fieldErrors.itemCode}>
              <Input
                value={editing.itemCode}
                onChange={(e) => setEditing({ ...editing, itemCode: e.target.value })}
                className="font-mono"
                placeholder="80078506"
              />
            </Field>
            <Field label="Description" required error={fieldErrors.description}>
              <Input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="MALMO 1200 ML INNER BOTTLE ASSEMBLY"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="HSN code">
                <Input
                  value={editing.hsnCode}
                  onChange={(e) => setEditing({ ...editing, hsnCode: e.target.value })}
                  className="font-mono"
                  placeholder="73239390"
                />
              </Field>
              <Field label="Unit">
                <Select
                  value={editing.uom}
                  onChange={(e) => setEditing({ ...editing, uom: e.target.value })}
                >
                  {UOMS.map((uom) => (
                    <option key={uom} value={uom}>
                      {uom}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Type" hint="Components go out on challans; processed codes come back.">
              <Select
                value={editing.itemType}
                onChange={(e) =>
                  setEditing({ ...editing, itemType: e.target.value as ItemType })
                }
              >
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ITEM_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Standard value" hint="Per piece, for challans">
                <Input
                  type="number"
                  step="0.01"
                  value={editing.standardValue}
                  onChange={(e) =>
                    setEditing({ ...editing, standardValue: Number(e.target.value) })
                  }
                  className="tnum text-right"
                />
              </Field>
              <Field label="GST %">
                <Input
                  type="number"
                  value={editing.gstRate}
                  onChange={(e) => setEditing({ ...editing, gstRate: Number(e.target.value) })}
                  className="tnum text-right"
                />
              </Field>
              <Field label="Reorder level">
                <Input
                  type="number"
                  value={editing.reorderLevel}
                  onChange={(e) =>
                    setEditing({ ...editing, reorderLevel: Number(e.target.value) })
                  }
                  className="tnum text-right"
                />
              </Field>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isFocItem"
                checked={editing.isFoc}
                onChange={(e) => setEditing({ ...editing, isFoc: e.target.checked })}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              <label htmlFor="isFocItem" className="text-sm font-medium text-fg cursor-pointer">
                Free of cost — never billed, only handled through Returns
              </label>
            </div>
          </div>
        )}
      </SidePanel>
    </>
  );
}
