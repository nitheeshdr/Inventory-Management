"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { ItemOption } from "@/app/api/items/route";
import type { PartyOption, RouteOption } from "@/lib/queries/masters";
import type { PendingChallanLine } from "@/lib/allocation";
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
import { AgingChip } from "@/components/status-chip";
import { GRN_LINE_KINDS, GRN_LINE_KIND_LABELS, type GrnLineKind } from "@/lib/constants";
import { formatDate, formatQty, round3, toDateInputValue } from "@/lib/format";
import { saveGrn, type GrnInput } from "./actions";

/**
 * One form row = one challan line being returned. A quantity spanning several
 * challans becomes several rows, which keeps every allocation exact and
 * traceable; the printed return note groups them back together by item.
 */
interface LineRow {
  key: string;
  challanId: string;
  challanNo: string;
  challanLineId: string;
  inputItem: { _id: string; itemCode: string; description: string };
  pendingQty: number;
  lineKind: GrnLineKind;
  receivedItem: ItemOption | null;
  routeId?: string;
  qty: string;
  rejectionReason: string;
}

export interface GrnFormValues {
  _id?: string;
  grnNo: string;
  vendorDocNo?: string;
  grnDate: string;
  partyId: string;
  vehicleNo?: string;
  grNo?: string;
  transportRemark?: string;
  notes?: string;
  lines: {
    challanId: string;
    challanNo: string;
    challanLineId: string;
    inputItemId: string;
    itemId: string;
    lineKind: GrnLineKind;
    qty: number;
    rejectionReason?: string;
    routeId?: string;
  }[];
}

export function GrnForm({
  items,
  parties,
  routes,
  pendingLines,
  suggestedNo,
  initial,
  preselectChallanId,
}: {
  items: ItemOption[];
  parties: PartyOption[];
  routes: RouteOption[];
  pendingLines: PendingChallanLine[];
  suggestedNo: string;
  initial?: GrnFormValues;
  preselectChallanId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const itemById = useMemo(() => new Map(items.map((item) => [item._id, item])), [items]);

  const [header, setHeader] = useState({
    grnNo: initial?.grnNo ?? suggestedNo,
    vendorDocNo: initial?.vendorDocNo ?? "",
    grnDate: initial?.grnDate ?? toDateInputValue(new Date()),
    partyId: initial?.partyId ?? parties[0]?._id ?? "",
    vehicleNo: initial?.vehicleNo ?? "",
    grNo: initial?.grNo ?? "",
    transportRemark: initial?.transportRemark ?? "",
    notes: initial?.notes ?? "",
  });

  const [rows, setRows] = useState<LineRow[]>(() =>
    (initial?.lines ?? []).map((line) => {
      const source = pendingLines.find((p) => p.challanLineId === line.challanLineId);
      return {
        key: crypto.randomUUID(),
        challanId: line.challanId,
        challanNo: line.challanNo,
        challanLineId: line.challanLineId,
        inputItem: {
          _id: line.inputItemId,
          itemCode: source?.itemCode ?? itemById.get(line.inputItemId)?.itemCode ?? "",
          description:
            source?.description ?? itemById.get(line.inputItemId)?.description ?? "",
        },
        // On an edit the line's own quantity is still available to it.
        pendingQty: (source?.pendingQty ?? 0) + line.qty,
        lineKind: line.lineKind,
        receivedItem: itemById.get(line.itemId) ?? null,
        routeId: line.routeId,
        qty: String(line.qty),
        rejectionReason: line.rejectionReason ?? "",
      };
    }),
  );

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const availableLines = useMemo(() => {
    const used = new Map<string, number>();
    for (const row of rows) {
      used.set(row.challanLineId, (used.get(row.challanLineId) ?? 0) + (Number(row.qty) || 0));
    }
    return pendingLines
      .filter((line) => line.partyId === header.partyId)
      .map((line) => ({
        ...line,
        pendingQty: round3(line.pendingQty - (used.get(line.challanLineId) ?? 0)),
      }))
      .filter((line) => line.pendingQty > 0)
      .filter((line) => !preselectChallanId || line.challanId === preselectChallanId);
  }, [pendingLines, rows, header.partyId, preselectChallanId]);

  /** Switching job worker invalidates every allocation already made. */
  function changeParty(partyId: string) {
    setHeader((prev) => ({ ...prev, partyId }));
    setRows((prev) =>
      prev.filter((row) =>
        pendingLines.some(
          (line) => line.challanLineId === row.challanLineId && line.partyId === partyId,
        ),
      ),
    );
  }

  function routeFor(inputItemId: string) {
    return routes.find(
      (route) =>
        route.inputItemId === inputItemId &&
        (route.partyId === header.partyId || route.partyId === null),
    );
  }

  function addLine(source: PendingChallanLine, kind: GrnLineKind = "rejected") {
    const route = kind === "processed" ? routeFor(source.itemId) : undefined;
    const receivedItem =
      kind === "processed" && route
        ? (itemById.get(route.outputItemId) ?? null)
        : (itemById.get(source.itemId) ?? null);

    setRows((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        challanId: source.challanId,
        challanNo: source.challanNo,
        challanLineId: source.challanLineId,
        inputItem: {
          _id: source.itemId,
          itemCode: source.itemCode,
          description: source.description,
        },
        pendingQty: source.pendingQty,
        lineKind: kind,
        receivedItem,
        routeId: route?._id,
        qty: String(source.pendingQty),
        rejectionReason: "",
      },
    ]);
  }

  function patchRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function changeKind(row: LineRow, kind: GrnLineKind) {
    const route = kind === "processed" ? routeFor(row.inputItem._id) : undefined;
    const receivedItem =
      kind === "processed" && route
        ? (itemById.get(route.outputItemId) ?? null)
        : (itemById.get(row.inputItem._id) ?? null);
    patchRow(row.key, { lineKind: kind, receivedItem, routeId: route?._id });
  }

  const totalQty = rows.reduce((total, row) => total + (Number(row.qty) || 0), 0);

  function submit() {
    setError(null);
    setFieldErrors({});

    if (rows.length === 0) {
      setError("Add at least one line from the pending list below.");
      return;
    }

    const missingItem = rows.find((row) => !row.receivedItem);
    if (missingItem) {
      setError(
        `Line for ${missingItem.inputItem.itemCode} has no received item. Pick the code that came back, or add a process route in Masters.`,
      );
      return;
    }

    const overRow = rows.find((row) => Number(row.qty) > row.pendingQty);
    if (overRow) {
      setError(
        `${overRow.inputItem.itemCode} on challan ${overRow.challanNo}: only ${overRow.pendingQty} pcs are still in our factory.`,
      );
      return;
    }

    const input: GrnInput = {
      ...header,
      lines: rows
        .filter((row) => Number(row.qty) > 0)
        .map((row) => ({
          lineKind: row.lineKind,
          itemId: row.receivedItem!._id,
          inputItemId: row.inputItem._id,
          routeId: row.routeId,
          qty: Number(row.qty),
          rejectionReason: row.rejectionReason || undefined,
          allocations: [
            {
              challanId: row.challanId,
              challanLineId: row.challanLineId,
              qty: Number(row.qty),
            },
          ],
        })),
    };

    startTransition(async () => {
      const result = await saveGrn(input, initial?._id);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.push(`/grn/${result.data._id}`);
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
        <CardHeader title="Outward return details" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Our GRN no" required error={fieldErrors.grnNo}>
            <Input
              value={header.grnNo}
              onChange={(e) => setHeader({ ...header, grnNo: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="Our return note no" hint="The number on the printed return note">
            <Input
              value={header.vendorDocNo}
              onChange={(e) => setHeader({ ...header, vendorDocNo: e.target.value })}
              placeholder="125"
              className="font-mono"
            />
          </Field>
          <Field label="Date" required error={fieldErrors.grnDate}>
            <Input
              type="date"
              value={header.grnDate}
              onChange={(e) => setHeader({ ...header, grnDate: e.target.value })}
            />
          </Field>
          <Field label="Customer" required>
            <Select value={header.partyId} onChange={(e) => changeParty(e.target.value)}>
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
          <Field label="GR no">
            <Input
              value={header.grNo}
              onChange={(e) => setHeader({ ...header, grNo: e.target.value })}
            />
          </Field>
          <Field label="Transport / remark" className="sm:col-span-2">
            <Input
              value={header.transportRemark}
              onChange={(e) => setHeader({ ...header, transportRemark: e.target.value })}
              placeholder="BODY DENT (SCRUB)"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Returned lines"
          subtitle={
            rows.length
              ? `${rows.length} lines · ${formatQty(totalQty)} pcs going back`
              : "Pick from the pending list below to start."
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing added yet"
            description="Every returned quantity must point at the challan line it went out on."
          />
        ) : (
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Against challan</Th>
                  <Th>Sent as</Th>
                  <Th className="w-36">Kind</Th>
                  <Th className="w-52">Received as</Th>
                  <ThNum className="w-28">Qty</ThNum>
                  <ThNum className="w-24">Pending</ThNum>
                  <Th className="w-48">Reason</Th>
                  <Th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const over = Number(row.qty) > row.pendingQty;
                  return (
                    <tr key={row.key}>
                      <Td className="font-mono text-[13px]">{row.challanNo}</Td>
                      <Td>
                        <span className="font-mono text-[13px]">{row.inputItem.itemCode}</span>
                        <span className="ml-1.5 text-xs text-fg-muted">
                          {row.inputItem.description}
                        </span>
                      </Td>
                      <Td>
                        <Select
                          value={row.lineKind}
                          onChange={(e) => changeKind(row, e.target.value as GrnLineKind)}
                          className="h-8"
                        >
                          {GRN_LINE_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {GRN_LINE_KIND_LABELS[kind]}
                            </option>
                          ))}
                        </Select>
                      </Td>
                      <Td>
                        <ItemCombobox
                          items={items}
                          value={row.receivedItem}
                          onSelect={(item) => patchRow(row.key, { receivedItem: item })}
                        />
                        {row.lineKind === "processed" && !row.routeId && (
                          <p className="mt-1 text-[11px] text-warning">
                            No process route — pick the coated code manually.
                          </p>
                        )}
                      </Td>
                      <Td>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={row.qty}
                          onChange={(e) => patchRow(row.key, { qty: e.target.value })}
                          className={`tnum h-8 text-right ${over ? "border-danger" : ""}`}
                        />
                      </Td>
                      <TdNum className="text-fg-muted">{formatQty(row.pendingQty)}</TdNum>
                      <Td>
                        <Input
                          value={row.rejectionReason}
                          onChange={(e) =>
                            patchRow(row.key, { rejectionReason: e.target.value })
                          }
                          placeholder={row.lineKind === "processed" ? "—" : "Body dent (scrub)"}
                          className="h-8"
                        />
                      </Td>
                      <Td>
                        <button
                          type="button"
                          onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
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
        )}
      </Card>

      <Card>
        <CardHeader
          title="Lying in our factory"
          subtitle="Oldest inward challans first — return these before they cross one year."
        />
        {availableLines.length === 0 ? (
          <EmptyState
            title="Nothing pending"
            description="Everything this customer sent has been returned."
          />
        ) : (
          <TableWrap className="max-h-[40vh] overflow-y-auto rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Challan</Th>
                  <Th>Date</Th>
                  <Th>Item</Th>
                  <ThNum>Pending</ThNum>
                  <Th>Deadline</Th>
                  <Th className="w-56">Add as</Th>
                </tr>
              </thead>
              <tbody>
                {availableLines.map((line) => (
                  <tr key={line.challanLineId} className="hover:bg-surface-2">
                    <Td className="font-mono text-[13px]">{line.challanNo}</Td>
                    <Td className="whitespace-nowrap text-fg-muted">
                      {formatDate(line.challanDate)}
                    </Td>
                    <Td>
                      <span className="font-mono text-[13px]">{line.itemCode}</span>
                      <span className="ml-1.5 text-xs text-fg-muted">{line.description}</span>
                    </Td>
                    <TdNum className="font-medium">{formatQty(line.pendingQty)}</TdNum>
                    <Td>
                      <AgingChip daysOpen={line.daysOpen} />
                    </Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => addLine(line, "processed")}>
                          <Plus className="h-3 w-3" strokeWidth={2} />
                          Processed
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => addLine(line, "rejected")}>
                          Rejected
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
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
        {rows.some((row) => row.lineKind === "processed" && !row.routeId) && (
          <Chip tone="warning">Some processed lines have no confirmed route</Chip>
        )}
        <Button variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : initial?._id ? "Save changes" : "Save return note"}
        </Button>
      </div>
    </div>
  );
}
