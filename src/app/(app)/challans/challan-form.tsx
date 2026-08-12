"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { ItemOption } from "@/app/api/items/route";
import type { PartyOption } from "@/lib/queries/masters";
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
  TdNum,
  Textarea,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { ItemCombobox } from "@/components/item-combobox";
import { lineTaxable, splitTax } from "@/lib/gst";
import { formatAmount, round2, toDateInputValue } from "@/lib/format";
import { saveChallan, type ChallanInput } from "./actions";

interface LineRow {
  key: string;
  item: ItemOption | null;
  qty: string;
  rate: string;
}

function emptyRow(): LineRow {
  return { key: crypto.randomUUID(), item: null, qty: "", rate: "" };
}

export interface ChallanFormValues {
  _id?: string;
  challanNo: string;
  challanDate: string;
  partyId: string;
  ewayBillNo?: string;
  vehicleNo?: string;
  transportPo?: string;
  natureOfProcess?: string;
  taxRate: number;
  notes?: string;
  lines: { itemId: string; qty: number; rate: number }[];
}

export function ChallanForm({
  items,
  parties,
  initial,
}: {
  items: ItemOption[];
  parties: PartyOption[];
  initial?: ChallanFormValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const itemById = useMemo(() => new Map(items.map((item) => [item._id, item])), [items]);

  const [header, setHeader] = useState({
    challanNo: initial?.challanNo ?? "",
    challanDate: initial?.challanDate ?? toDateInputValue(new Date()),
    partyId: initial?.partyId ?? parties[0]?._id ?? "",
    ewayBillNo: initial?.ewayBillNo ?? "",
    vehicleNo: initial?.vehicleNo ?? "",
    transportPo: initial?.transportPo ?? "",
    natureOfProcess: initial?.natureOfProcess ?? "",
    taxRate: String(initial?.taxRate ?? 5),
    notes: initial?.notes ?? "",
  });

  const [rows, setRows] = useState<LineRow[]>(() =>
    initial?.lines.length
      ? initial.lines.map((line) => ({
          key: crypto.randomUUID(),
          item: itemById.get(line.itemId) ?? null,
          qty: String(line.qty),
          rate: String(line.rate),
        }))
      : [emptyRow()],
  );

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);

  function patchRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((r) => r.key !== key)));
  }

  // The declared tax on a challan is computed on the document total, matching
  // the paper — unlike an invoice, which is taxed line by line.
  const totals = useMemo(() => {
    const taxable = round2(
      rows.reduce(
        (total, row) => total + lineTaxable(Number(row.qty) || 0, Number(row.rate) || 0),
        0,
      ),
    );
    const tax = splitTax(taxable, Number(header.taxRate) || 0, false);

    return {
      qty: rows.reduce((total, row) => total + (Number(row.qty) || 0), 0),
      taxable,
      cgst: tax.cgstAmount,
      sgst: tax.sgstAmount,
      total: round2(taxable + tax.totalTax),
    };
  }, [rows, header.taxRate]);

  function submit() {
    setError(null);
    setFieldErrors({});
    setWarnings([]);

    const lines = rows
      .filter((row) => row.item && Number(row.qty) > 0)
      .map((row) => ({
        itemId: row.item!._id,
        qty: Number(row.qty),
        rate: Number(row.rate) || 0,
      }));

    if (lines.length === 0) {
      setError("Add at least one line with an item and a quantity.");
      return;
    }

    const input: ChallanInput = {
      ...header,
      taxRate: Number(header.taxRate) || 0,
      lines,
    };

    startTransition(async () => {
      const result = await saveChallan(input, initial?._id);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      if (result.warnings?.length) {
        // Saved, but the plant balance says these quantities weren't there —
        // worth showing before navigating away.
        setWarnings(result.warnings);
        setTimeout(() => router.push(`/challans/${result.data._id}`), 2500);
        return;
      }
      router.push(`/challans/${result.data._id}`);
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

      {warnings.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <p className="font-medium">Saved, but check these stock balances:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader
          title="Challan details"
          subtitle="Type the challan number exactly as printed on the customer's delivery challan."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Challan no" required error={fieldErrors.challanNo}>
            <Input
              value={header.challanNo}
              onChange={(e) => setHeader({ ...header, challanNo: e.target.value })}
              placeholder="2621500964"
              className="font-mono"
            />
          </Field>
          <Field label="Challan date" required error={fieldErrors.challanDate}>
            <Input
              type="date"
              value={header.challanDate}
              onChange={(e) => setHeader({ ...header, challanDate: e.target.value })}
            />
          </Field>
          <Field label="Customer" required error={fieldErrors.partyId}>
            <Select
              value={header.partyId}
              onChange={(e) => setHeader({ ...header, partyId: e.target.value })}
            >
              {parties.length === 0 && <option value="">No customers yet</option>}
              {parties.map((party) => (
                <option key={party._id} value={party._id}>
                  {party.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Declared tax rate %" hint="Notional — no GST is paid on job work">
            <Select
              value={header.taxRate}
              onChange={(e) => setHeader({ ...header, taxRate: e.target.value })}
            >
              {["0", "5", "12", "18", "28"].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </Select>
          </Field>
          <Field label="E-way bill no">
            <Input
              value={header.ewayBillNo}
              onChange={(e) => setHeader({ ...header, ewayBillNo: e.target.value })}
            />
          </Field>
          <Field label="Vehicle no">
            <Input
              value={header.vehicleNo}
              onChange={(e) => setHeader({ ...header, vehicleNo: e.target.value })}
              placeholder="TN91F4032"
              className="font-mono uppercase"
            />
          </Field>
          <Field label="TR / PO no">
            <Input
              value={header.transportPo}
              onChange={(e) => setHeader({ ...header, transportPo: e.target.value })}
              placeholder="4951054089"
              className="font-mono"
            />
          </Field>
          <Field label="Nature of processing">
            <Input
              value={header.natureOfProcess}
              onChange={(e) => setHeader({ ...header, natureOfProcess: e.target.value })}
              placeholder="Powder coating"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Items"
          subtitle="Tab across the row; press Enter in the rate box to add another line."
          action={
            <Button size="sm" variant="outline" onClick={addRow}>
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
                <Th className="w-52">Item code</Th>
                <Th>Description</Th>
                <Th className="w-24">HSN</Th>
                <ThNum className="w-28">Qty</ThNum>
                <Th className="w-16">UOM</Th>
                <ThNum className="w-32">Rate</ThNum>
                <ThNum className="w-36">Taxable value</ThNum>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const qty = Number(row.qty) || 0;
                const rate = Number(row.rate) || 0;
                return (
                  <tr key={row.key}>
                    <Td className="text-fg-subtle">{index + 1}</Td>
                    <Td>
                      <ItemCombobox
                        items={items}
                        value={row.item}
                        onSelect={(item) =>
                          patchRow(row.key, {
                            item,
                            rate: row.rate || String(item.standardValue || ""),
                          })
                        }
                      />
                    </Td>
                    <Td className="max-w-[20rem] truncate text-fg-muted">
                      {row.item?.description ?? "—"}
                    </Td>
                    <Td className="font-mono text-xs text-fg-muted">
                      {row.item?.hsnCode ?? "—"}
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={row.qty}
                        onChange={(e) => patchRow(row.key, { qty: e.target.value })}
                        className="tnum h-8 text-right"
                      />
                    </Td>
                    <Td className="text-xs text-fg-muted">{row.item?.uom ?? "PC"}</Td>
                    <Td>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={row.rate}
                        onChange={(e) => patchRow(row.key, { rate: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && index === rows.length - 1) {
                            e.preventDefault();
                            addRow();
                          }
                        }}
                        className="tnum h-8 text-right"
                      />
                    </Td>
                    <TdNum className="font-medium">{formatAmount(round2(qty * rate))}</TdNum>
                    <Td>
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        className="text-fg-subtle transition-colors hover:text-danger"
                        aria-label={`Remove line ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>

        <div className="flex flex-wrap justify-end gap-x-10 gap-y-2 border-t border-border px-4 py-3 text-sm">
          <Figure label="Total qty" value={totals.qty.toLocaleString("en-IN")} />
          <Figure label="Total taxable" value={formatAmount(totals.taxable)} />
          <Figure label={`CGST ${Number(header.taxRate) / 2}%`} value={formatAmount(totals.cgst)} />
          <Figure label={`SGST ${Number(header.taxRate) / 2}%`} value={formatAmount(totals.sgst)} />
          <Figure label="Total value" value={formatAmount(totals.total)} strong />
        </div>
      </Card>

      <Card className="p-4">
        <Field label="Notes">
          <Textarea
            value={header.notes}
            onChange={(e) => setHeader({ ...header, notes: e.target.value })}
            placeholder="Anything the office should know about this movement…"
          />
        </Field>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : initial?._id ? "Save changes" : "Save challan"}
        </Button>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="text-right">
      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={`tnum ${strong ? "text-base font-semibold" : "text-sm"} text-fg`}>{value}</p>
    </div>
  );
}
