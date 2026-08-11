"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { ItemOption } from "@/app/api/items/route";
import type { LocationOption } from "@/lib/queries/stock";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { ItemCombobox } from "@/components/item-combobox";
import { toDateInputValue } from "@/lib/format";
import { saveAdjustment, type AdjustmentInput } from "./actions";

interface LineRow {
  key: string;
  item: ItemOption | null;
  qty: string;
  remark: string;
}

function emptyRow(): LineRow {
  return { key: crypto.randomUUID(), item: null, qty: "", remark: "" };
}

const REASONS = [
  "Opening balance",
  "Physical count correction",
  "Damage / breakage write-off",
  "Found stock",
  "Data entry correction",
];

export function AdjustmentForm({
  items,
  locations,
}: {
  items: ItemOption[];
  locations: LocationOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [header, setHeader] = useState({
    adjustmentDate: toDateInputValue(new Date()),
    locationId: locations.find((l) => l.kind === "plant")?._id ?? locations[0]?._id ?? "",
    reason: REASONS[0],
    notes: "",
  });

  const [rows, setRows] = useState<LineRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);

  function patchRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function submit() {
    setError(null);

    const lines = rows
      .filter((row) => row.item && Number(row.qty) !== 0 && row.qty !== "")
      .map((row) => ({
        itemId: row.item!._id,
        qty: Number(row.qty),
        remark: row.remark || undefined,
      }));

    if (lines.length === 0) {
      setError("Add at least one line with an item and a non-zero quantity.");
      return;
    }

    const input: AdjustmentInput = { ...header, lines };

    startTransition(async () => {
      const result = await saveAdjustment(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/adjustments");
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader
          title="Adjustment details"
          subtitle="Positive quantities add stock, negative quantities remove it."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="Date" required>
            <Input
              type="date"
              value={header.adjustmentDate}
              onChange={(e) => setHeader({ ...header, adjustmentDate: e.target.value })}
            />
          </Field>
          <Field label="Location" required>
            <Select
              value={header.locationId}
              onChange={(e) => setHeader({ ...header, locationId: e.target.value })}
            >
              {locations.map((location) => (
                <option key={location._id} value={location._id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" required hint="Shows against every ledger entry">
            <Select
              value={header.reason}
              onChange={(e) => setHeader({ ...header, reason: e.target.value })}
            >
              {REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Lines"
          action={
            <Button size="sm" variant="outline" onClick={() => setRows((p) => [...p, emptyRow()])}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add line
            </Button>
          }
        />
        <TableWrap className="rounded-none border-0">
          <Table>
            <thead>
              <tr>
                <Th className="w-10">#</Th>
                <Th className="w-52">Item</Th>
                <Th>Description</Th>
                <ThNum className="w-32">Qty (±)</ThNum>
                <Th className="w-64">Remark</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <Td className="text-fg-subtle">{index + 1}</Td>
                  <Td>
                    <ItemCombobox
                      items={items}
                      value={row.item}
                      onSelect={(item) => patchRow(row.key, { item })}
                    />
                  </Td>
                  <Td className="max-w-[20rem] truncate text-fg-muted">
                    {row.item?.description ?? "—"}
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      value={row.qty}
                      onChange={(e) => patchRow(row.key, { qty: e.target.value })}
                      className="tnum h-8 text-right"
                      placeholder="-25"
                    />
                  </Td>
                  <Td>
                    <Input
                      value={row.remark}
                      onChange={(e) => patchRow(row.key, { remark: e.target.value })}
                      className="h-8"
                    />
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) =>
                          prev.length === 1 ? [emptyRow()] : prev.filter((r) => r.key !== row.key),
                        )
                      }
                      className="text-fg-subtle transition-colors hover:text-danger"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <Card className="p-4">
        <Field label="Notes">
          <Textarea
            value={header.notes}
            onChange={(e) => setHeader({ ...header, notes: e.target.value })}
          />
        </Field>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Post adjustment"}
        </Button>
      </div>
    </div>
  );
}
