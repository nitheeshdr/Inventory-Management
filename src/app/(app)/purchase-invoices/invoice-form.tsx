"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { ItemOption } from "@/app/api/items/route";
import type { PartyOption } from "@/lib/queries/masters";
import type { BillableLine } from "@/lib/queries/verification";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
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
import { SERVICE_GST_RATE, SERVICE_HSN } from "@/lib/constants";
import { lineTaxable, roundOffDelta, splitTax } from "@/lib/gst";
import { formatAmount, round2, toDateInputValue } from "@/lib/format";
import { loadBillableWork, savePurchaseInvoice, type PurchaseInvoiceInput } from "./actions";

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
    taxPct: String(SERVICE_GST_RATE),
    hsnCode: SERVICE_HSN,
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
  periodFrom: string;
  periodTo: string;
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

/** Default period: the calendar month containing today. */
function defaultPeriod() {
  const now = new Date();
  return {
    from: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

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
  const [loadingWork, startLoadingWork] = useTransition();

  const itemById = useMemo(() => new Map(items.map((item) => [item._id, item])), [items]);
  const period = defaultPeriod();

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
    periodFrom: initial?.periodFrom ?? period.from,
    periodTo: initial?.periodTo ?? period.to,
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

  const [billable, setBillable] = useState<BillableLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const refreshWork = useMemo(
    () => (partyId: string, from: string, to: string) => {
      if (!partyId || !from || !to) return;
      startLoadingWork(async () => {
        setBillable(await loadBillableWork(partyId, from, to));
      });
    },
    [],
  );

  useEffect(() => {
    refreshWork(header.partyId, header.periodFrom, header.periodTo);
  }, [header.partyId, header.periodFrom, header.periodTo, refreshWork]);

  const billableByItem = useMemo(
    () => new Map(billable.map((row) => [row.itemId, row])),
    [billable],
  );

  function patchRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function fillFromWork() {
    const lines = billable
      .filter((row) => row.unbilledQty > 0)
      .map((row) => ({
        key: crypto.randomUUID(),
        item: itemById.get(row.itemId) ?? null,
        qty: String(row.unbilledQty),
        rate: row.routeRate !== null ? String(row.routeRate) : "",
        discountPct: "0",
        taxPct: String(SERVICE_GST_RATE),
        hsnCode: SERVICE_HSN,
      }));
    setRows(lines.length > 0 ? lines : [emptyRow()]);
  }

  // Uses the same per-line splitTax the server does, so the figure on screen is
  // the figure that gets saved.
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
        taxPct: Number(row.taxPct) || SERVICE_GST_RATE,
        hsnCode: row.hsnCode || SERVICE_HSN,
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
        <CardHeader title="Invoice details" subtitle="Copy the numbers off the vendor's bill." />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Invoice no" required error={fieldErrors.invoiceNo}>
            <Input
              value={header.invoiceNo}
              onChange={(e) => setHeader({ ...header, invoiceNo: e.target.value })}
              placeholder="BE/26-27/0344"
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
          <Field label="Job worker" required>
            <Select
              value={header.partyId}
              onChange={(e) => setHeader({ ...header, partyId: e.target.value })}
            >
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
              placeholder="4500738933, 4500738934"
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
          title="Work this bill covers"
          subtitle="Processed goods received back in this period — the basis for checking the bill."
          action={
            <div className="flex items-end gap-2">
              <Field label="From">
                <Input
                  type="date"
                  value={header.periodFrom}
                  onChange={(e) => setHeader({ ...header, periodFrom: e.target.value })}
                  className="h-8 w-36"
                />
              </Field>
              <Field label="To">
                <Input
                  type="date"
                  value={header.periodTo}
                  onChange={(e) => setHeader({ ...header, periodTo: e.target.value })}
                  className="h-8 w-36"
                />
              </Field>
              <Button size="sm" variant="outline" onClick={fillFromWork} disabled={loadingWork}>
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loadingWork ? "animate-spin" : ""}`}
                  strokeWidth={1.75}
                />
                Fill lines from work
              </Button>
            </div>
          }
        />
        {billable.length === 0 ? (
          <EmptyState
            title="No processed goods received in this period"
            description="Record the return notes first, otherwise there is nothing to check the bill against."
          />
        ) : (
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Process</Th>
                  <ThNum>Received</ThNum>
                  <ThNum>Already billed</ThNum>
                  <ThNum>Unbilled</ThNum>
                  <ThNum>Agreed rate</ThNum>
                  <ThNum>Expected value</ThNum>
                </tr>
              </thead>
              <tbody>
                {billable.map((row) => (
                  <tr key={row.itemId} className="hover:bg-surface-2">
                    <Td>
                      <span className="font-mono text-[13px]">{row.itemCode}</span>
                      <span className="ml-1.5 text-xs text-fg-muted">{row.description}</span>
                    </Td>
                    <Td className="text-xs text-fg-muted">
                      {row.processName ?? <Chip tone="warning">No route</Chip>}
                      {row.processName && !row.routeConfirmed && (
                        <Chip tone="warning" className="ml-1.5">
                          Unconfirmed
                        </Chip>
                      )}
                    </Td>
                    <TdNum>{row.processedQty}</TdNum>
                    <TdNum className="text-fg-muted">{row.billedQty}</TdNum>
                    <TdNum className="font-medium">{row.unbilledQty}</TdNum>
                    <TdNum>{row.routeRate === null ? "—" : formatAmount(row.routeRate)}</TdNum>
                    <TdNum className="text-fg-muted">
                      {row.routeRate === null
                        ? "—"
                        : formatAmount(round2(row.unbilledQty * row.routeRate))}
                    </TdNum>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Billed lines"
          subtitle="Variances against received quantity and agreed rate are highlighted as you type."
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
                <Th className="w-56">Check</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const qty = Number(row.qty) || 0;
                const rate = Number(row.rate) || 0;
                const discount = Number(row.discountPct) || 0;
                const gross = qty * rate;
                const taxable = round2(gross - (gross * discount) / 100);

                const work = row.item ? billableByItem.get(row.item._id) : undefined;
                const qtyOver = work ? round2(qty - work.unbilledQty) : 0;
                const rateOff =
                  work && work.routeRate !== null ? round2(rate - work.routeRate) : 0;

                return (
                  <tr key={row.key}>
                    <Td className="text-fg-subtle">{index + 1}</Td>
                    <Td>
                      <ItemCombobox
                        items={items}
                        value={row.item}
                        onSelect={(item) => {
                          const match = billableByItem.get(item._id);
                          patchRow(row.key, {
                            item,
                            rate:
                              row.rate ||
                              (match?.routeRate !== null && match?.routeRate !== undefined
                                ? String(match.routeRate)
                                : ""),
                          });
                        }}
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
                    <Td className="space-y-1">
                      {!row.item ? (
                        <span className="text-xs text-fg-subtle">—</span>
                      ) : !work ? (
                        <Chip tone="danger">Nothing received for this code</Chip>
                      ) : (
                        <>
                          {qtyOver > 0 ? (
                            <Chip tone="danger">Over-billed {qtyOver} pcs</Chip>
                          ) : (
                            <Chip tone="success">Qty OK</Chip>
                          )}
                          {work.routeRate === null ? (
                            <Chip tone="warning">No agreed rate</Chip>
                          ) : rateOff !== 0 ? (
                            <Chip tone="danger">
                              Rate {rateOff > 0 ? "+" : ""}
                              {rateOff}
                            </Chip>
                          ) : (
                            <Chip tone="success">Rate OK</Chip>
                          )}
                        </>
                      )}
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
