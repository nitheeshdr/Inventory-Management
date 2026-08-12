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
import { lineTaxable, roundOffDelta, splitTax } from "@/lib/gst";
import { formatAmount, round2, toDateInputValue } from "@/lib/format";
import { savePurchaseInvoice, type PurchaseInvoiceInput } from "./actions";

interface LineRow {
  key: string;
  item: ItemOption | null;
  qty: string;
  rate: string;
  discountPct: string;
  taxPct: string;
  hsnCode: string;
}

function emptyRow(): LineRow {
  return {
    key: crypto.randomUUID(),
    item: null,
    qty: "",
    rate: "",
    discountPct: "0",
    taxPct: "18",
    hsnCode: "",
  };
}

export interface InvoiceFormValues {
  _id?: string;
  invoiceNo: string;
  invoiceDate: string;
  partyId: string;
  ackNo?: string;
  ackDate?: string;
  irn?: string;
  ewayNo?: string;
  poRefs?: string;
  vehicleNo?: string;
  transport?: string;
  destination?: string;
  notes?: string;
  lines: {
    itemId: string;
    qty: number;
    rate: number;
    discountPct: number;
    taxPct: number;
    hsnCode: string;
  }[];
}

/**
 * A bill from one of our own suppliers. No quantity or rate checking: that is a
 * principal's tool for auditing a job worker, and here we are the job worker.
 */
export function PurchaseInvoiceForm({
  items,
  parties,
  initial,
}: {
  items: ItemOption[];
  parties: PartyOption[];
  initial?: InvoiceFormValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const itemById = useMemo(() => new Map(items.map((item) => [item._id, item])), [items]);

  const [header, setHeader] = useState({
    invoiceNo: initial?.invoiceNo ?? "",
    invoiceDate: initial?.invoiceDate ?? toDateInputValue(new Date()),
    partyId: initial?.partyId ?? parties[0]?._id ?? "",
    ackNo: initial?.ackNo ?? "",
    ackDate: initial?.ackDate ?? "",
    irn: initial?.irn ?? "",
    ewayNo: initial?.ewayNo ?? "",
    poRefs: initial?.poRefs ?? "",
    vehicleNo: initial?.vehicleNo ?? "",
    transport: initial?.transport ?? "",
    destination: initial?.destination ?? "",
    notes: initial?.notes ?? "",
  });

  const [rows, setRows] = useState<LineRow[]>(() =>
    initial?.lines.length
      ? initial.lines.map((line) => ({
          key: crypto.randomUUID(),
          item: itemById.get(line.itemId) ?? null,
          qty: String(line.qty),
          rate: String(line.rate),
          discountPct: String(line.discountPct),
          taxPct: String(line.taxPct),
          hsnCode: line.hsnCode,
        }))
      : [emptyRow()],
  );

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function patchRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let qty = 0;

    for (const row of rows) {
      const q = Number(row.qty) || 0;
      const taxable = lineTaxable(q, Number(row.rate) || 0, Number(row.discountPct) || 0);
      const tax = splitTax(taxable, Number(row.taxPct) || 0, false);
      qty += q;
      subtotal += taxable;
      cgst += tax.cgstAmount;
      sgst += tax.sgstAmount;
    }

    subtotal = round2(subtotal);
    cgst = round2(cgst);
    sgst = round2(sgst);
    const { roundOff, rounded } = roundOffDelta(round2(subtotal + cgst + sgst));

    return { qty, subtotal, cgst, sgst, roundOff, grand: rounded };
  }, [rows]);

  function submit() {
    setError(null);
    setFieldErrors({});

    const lines = rows
      .filter((row) => row.item && Number(row.qty) > 0)
      .map((row) => ({
        itemId: row.item!._id,
        qty: Number(row.qty),
        rate: Number(row.rate) || 0,
        discountPct: Number(row.discountPct) || 0,
        taxPct: Number(row.taxPct) || 18,
        hsnCode: row.hsnCode,
      }));

    if (lines.length === 0) {
      setError("Add at least one line with an item and a quantity.");
      return;
    }

    const input: PurchaseInvoiceInput = { ...header, lines };

    startTransition(async () => {
      const result = await savePurchaseInvoice(input, initial?._id);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.push(`/purchase-invoices/${result.data._id}`);
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
          title="Bill details"
          subtitle="Copy the numbers off the supplier's invoice."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Invoice no" required error={fieldErrors.invoiceNo}>
            <Input
              value={header.invoiceNo}
              onChange={(e) => setHeader({ ...header, invoiceNo: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="Invoice date" required error={fieldErrors.invoiceDate}>
            <Input
              type="date"
              value={header.invoiceDate}
              onChange={(e) => setHeader({ ...header, invoiceDate: e.target.value })}
            />
          </Field>
          <Field label="Supplier" required>
            <Select
              value={header.partyId}
              onChange={(e) => setHeader({ ...header, partyId: e.target.value })}
            >
              {parties.length === 0 && <option value="">No suppliers yet</option>}
              {parties.map((party) => (
                <option key={party._id} value={party._id}>
                  {party.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vehicle no">
            <Input
              value={header.vehicleNo}
              onChange={(e) => setHeader({ ...header, vehicleNo: e.target.value })}
              className="font-mono uppercase"
            />
          </Field>
          <Field label="ACK no">
            <Input
              value={header.ackNo}
              onChange={(e) => setHeader({ ...header, ackNo: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="ACK date">
            <Input
              type="date"
              value={header.ackDate}
              onChange={(e) => setHeader({ ...header, ackDate: e.target.value })}
            />
          </Field>
          <Field label="PO refs" hint="Comma separated" className="sm:col-span-2">
            <Input
              value={header.poRefs}
              onChange={(e) => setHeader({ ...header, poRefs: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="IRN" className="sm:col-span-2 lg:col-span-4">
            <Input
              value={header.irn}
              onChange={(e) => setHeader({ ...header, irn: e.target.value })}
              className="font-mono text-[11px]"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Billed lines"
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
                <Th className="w-24">HSN</Th>
                <ThNum className="w-24">Qty</ThNum>
                <ThNum className="w-28">Rate</ThNum>
                <ThNum className="w-20">Disc %</ThNum>
                <ThNum className="w-20">Tax %</ThNum>
                <ThNum className="w-32">Taxable</ThNum>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const taxable = lineTaxable(
                  Number(row.qty) || 0,
                  Number(row.rate) || 0,
                  Number(row.discountPct) || 0,
                );

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
                            hsnCode: row.hsnCode || item.hsnCode,
                            taxPct: row.taxPct || String(item.gstRate || 18),
                          })
                        }
                      />
                    </Td>
                    <Td>
                      <Input
                        value={row.hsnCode}
                        onChange={(e) => patchRow(row.key, { hsnCode: e.target.value })}
                        className="h-8 font-mono text-xs"
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        value={row.qty}
                        onChange={(e) => patchRow(row.key, { qty: e.target.value })}
                        className="tnum h-8 text-right"
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.rate}
                        onChange={(e) => patchRow(row.key, { rate: e.target.value })}
                        className="tnum h-8 text-right"
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        value={row.discountPct}
                        onChange={(e) => patchRow(row.key, { discountPct: e.target.value })}
                        className="tnum h-8 text-right"
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        value={row.taxPct}
                        onChange={(e) => patchRow(row.key, { taxPct: e.target.value })}
                        className="tnum h-8 text-right"
                      />
                    </Td>
                    <TdNum className="font-medium">{formatAmount(taxable)}</TdNum>
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
                );
              })}
            </tbody>
          </Table>
        </TableWrap>

        <div className="flex flex-wrap justify-end gap-x-10 gap-y-2 border-t border-border px-4 py-3">
          <Figure label="Total qty" value={totals.qty.toLocaleString("en-IN")} />
          <Figure label="Before tax" value={formatAmount(totals.subtotal)} />
          <Figure label="CGST" value={formatAmount(totals.cgst)} />
          <Figure label="SGST" value={formatAmount(totals.sgst)} />
          <Figure label="Round off" value={formatAmount(totals.roundOff)} />
          <Figure label="Grand total" value={formatAmount(totals.grand)} strong />
        </div>
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
          {pending ? "Saving…" : initial?._id ? "Save changes" : "Save bill"}
        </Button>
      </div>
    </div>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={`tnum ${strong ? "text-base font-semibold" : "text-sm"} text-fg`}>{value}</p>
    </div>
  );
}
