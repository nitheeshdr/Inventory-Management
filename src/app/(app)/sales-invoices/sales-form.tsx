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
  Chip,
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
import { amountInWords, formatAmount, round2, toDateInputValue } from "@/lib/format";
import { saveSalesInvoice, type SalesInvoiceInput } from "./actions";

interface LineRow {
  key: string;
  item: ItemOption | null;
  qty: string;
  rate: string;
  discountPct: string;
  taxPct: string;
}

function emptyRow(): LineRow {
  return { key: crypto.randomUUID(), item: null, qty: "", rate: "", discountPct: "0", taxPct: "18" };
}

export interface SalesFormValues {
  _id?: string;
  invoiceNo: string;
  invoiceDate: string;
  partyId: string;
  poNo?: string;
  vehicleNo?: string;
  transport?: string;
  destination?: string;
  ewayBillNo?: string;
  notes?: string;
  lines: { itemId: string; qty: number; rate: number; discountPct: number; taxPct: number }[];
}

export function SalesInvoiceForm({
  items,
  customers,
  companyStateCode,
  suggestedNo,
  initial,
}: {
  items: ItemOption[];
  customers: PartyOption[];
  companyStateCode: string;
  suggestedNo: string;
  initial?: SalesFormValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const itemById = useMemo(() => new Map(items.map((item) => [item._id, item])), [items]);
  // FOC items are never billed — keep them out of the picker, but leave `items`
  // (and itemById) intact so an existing line stays visible if its item is
  // flagged FOC later; the server rejects the save with a clear error instead
  // of the line silently vanishing.
  const billableItems = useMemo(() => items.filter((item) => !item.isFoc), [items]);

  const [header, setHeader] = useState({
    invoiceNo: initial?.invoiceNo ?? suggestedNo,
    invoiceDate: initial?.invoiceDate ?? toDateInputValue(new Date()),
    partyId: initial?.partyId ?? customers[0]?._id ?? "",
    poNo: initial?.poNo ?? "",
    vehicleNo: initial?.vehicleNo ?? "",
    transport: initial?.transport ?? "",
    destination: initial?.destination ?? "",
    ewayBillNo: initial?.ewayBillNo ?? "",
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
        }))
      : [emptyRow()],
  );

  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const customer = customers.find((c) => c._id === header.partyId);
  const interState = customer ? customer.stateCode !== companyStateCode : false;

  function patchRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  // Mirrors the server's per-line splitTax so the preview and the saved invoice
  // never disagree by a paisa.
  const totals = useMemo(() => {
    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let qty = 0;

    for (const row of rows) {
      const q = Number(row.qty) || 0;
      const taxable = lineTaxable(q, Number(row.rate) || 0, Number(row.discountPct) || 0);
      const tax = splitTax(taxable, Number(row.taxPct) || 0, interState);
      qty += q;
      subtotal += taxable;
      cgst += tax.cgstAmount;
      sgst += tax.sgstAmount;
      igst += tax.igstAmount;
    }

    subtotal = round2(subtotal);
    cgst = round2(cgst);
    sgst = round2(sgst);
    igst = round2(igst);
    const { roundOff, rounded } = roundOffDelta(round2(subtotal + cgst + sgst + igst));

    return { qty, subtotal, cgst, sgst, igst, roundOff, grand: rounded };
  }, [rows, interState]);

  function submit() {
    setError(null);
    setWarnings([]);
    setFieldErrors({});

    const lines = rows
      .filter((row) => row.item && Number(row.qty) > 0)
      .map((row) => ({
        itemId: row.item!._id,
        qty: Number(row.qty),
        rate: Number(row.rate) || 0,
        discountPct: Number(row.discountPct) || 0,
        taxPct: Number(row.taxPct) || 0,
      }));

    if (lines.length === 0) {
      setError("Add at least one line with an item and a quantity.");
      return;
    }

    const input: SalesInvoiceInput = { ...header, lines };

    startTransition(async () => {
      const result = await saveSalesInvoice(input, initial?._id);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      if (result.warnings?.length) {
        setWarnings(result.warnings);
        setTimeout(() => router.push(`/sales-invoices/${result.data._id}`), 2500);
        return;
      }
      router.push(`/sales-invoices/${result.data._id}`);
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
          title="Invoice details"
          subtitle={
            customer ? (
              <span className="flex items-center gap-2">
                {customer.name} · state {customer.stateCode}
                <Chip tone={interState ? "info" : "neutral"}>
                  {interState ? "Inter-state — IGST" : "Intra-state — CGST + SGST"}
                </Chip>
              </span>
            ) : (
              "Add a customer in Masters first."
            )
          }
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
          <Field label="Customer" required>
            <Select
              value={header.partyId}
              onChange={(e) => setHeader({ ...header, partyId: e.target.value })}
            >
              {customers.length === 0 && <option value="">No customers yet</option>}
              {customers.map((party) => (
                <option key={party._id} value={party._id}>
                  {party.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="PO no">
            <Input
              value={header.poNo}
              onChange={(e) => setHeader({ ...header, poNo: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="Vehicle no">
            <Input
              value={header.vehicleNo}
              onChange={(e) => setHeader({ ...header, vehicleNo: e.target.value })}
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Transport">
            <Input
              value={header.transport}
              onChange={(e) => setHeader({ ...header, transport: e.target.value })}
            />
          </Field>
          <Field label="Destination">
            <Input
              value={header.destination}
              onChange={(e) => setHeader({ ...header, destination: e.target.value })}
            />
          </Field>
          <Field label="E-way bill no">
            <Input
              value={header.ewayBillNo}
              onChange={(e) => setHeader({ ...header, ewayBillNo: e.target.value })}
              className="font-mono"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Items"
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
                <Th className="w-24">HSN</Th>
                <ThNum className="w-24">Qty</ThNum>
                <ThNum className="w-28">Rate</ThNum>
                <ThNum className="w-20">Disc %</ThNum>
                <ThNum className="w-20">GST %</ThNum>
                <ThNum className="w-32">Amount</ThNum>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const qty = Number(row.qty) || 0;
                const rate = Number(row.rate) || 0;
                const gross = qty * rate;
                const taxable = round2(gross - (gross * (Number(row.discountPct) || 0)) / 100);
                const amount = round2(taxable * (1 + (Number(row.taxPct) || 0) / 100));

                return (
                  <tr key={row.key}>
                    <Td className="text-fg-subtle">{index + 1}</Td>
                    <Td>
                      <ItemCombobox
                        items={billableItems}
                        value={row.item}
                        onSelect={(item) =>
                          patchRow(row.key, { item, taxPct: String(item.gstRate || 18) })
                        }
                      />
                    </Td>
                    <Td className="max-w-[18rem] truncate text-fg-muted">
                      {row.item?.description ?? "—"}
                    </Td>
                    <Td className="font-mono text-xs text-fg-muted">{row.item?.hsnCode ?? "—"}</Td>
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
                    <TdNum className="font-medium">{formatAmount(amount)}</TdNum>
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
          {interState ? (
            <Figure label="IGST" value={formatAmount(totals.igst)} />
          ) : (
            <>
              <Figure label="CGST" value={formatAmount(totals.cgst)} />
              <Figure label="SGST" value={formatAmount(totals.sgst)} />
            </>
          )}
          <Figure label="Round off" value={formatAmount(totals.roundOff)} />
          <Figure label="Grand total" value={formatAmount(totals.grand)} strong />
        </div>
        <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">
          {amountInWords(totals.grand)}
        </p>
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
          {pending ? "Saving…" : initial?._id ? "Save changes" : "Save invoice"}
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
