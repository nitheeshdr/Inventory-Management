"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Search } from "lucide-react";
import type { ItemOption } from "@/app/api/items/route";
import type { PartyOption } from "@/lib/queries/masters";
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
  Textarea,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { SidePanel } from "@/components/ui/modal";
import { ItemCombobox } from "@/components/item-combobox";
import { SERVICE_GST_RATE, SERVICE_HSN } from "@/lib/constants";
import { formatAmount, formatDate, toDateInputValue } from "@/lib/format";
import { deleteRoute, saveRoute, type RouteInput } from "../actions";

export interface RouteRow {
  _id: string;
  inputItemId: string;
  inputItemCode: string;
  inputDescription: string;
  outputItemId: string;
  outputItemCode: string;
  outputDescription: string;
  partyId: string | null;
  partyName: string | null;
  processName: string;
  jobRate: number;
  serviceHsn: string;
  serviceGstRate: number;
  effectiveFrom: string;
  isConfirmed: boolean;
  notes: string;
}

interface Draft {
  _id: string;
  inputItem: ItemOption | null;
  outputItem: ItemOption | null;
  partyId: string;
  processName: string;
  jobRate: string;
  serviceHsn: string;
  serviceGstRate: string;
  effectiveFrom: string;
  isConfirmed: boolean;
  notes: string;
}

function blank(): Draft {
  return {
    _id: "",
    inputItem: null,
    outputItem: null,
    partyId: "",
    processName: "",
    jobRate: "",
    serviceHsn: SERVICE_HSN,
    serviceGstRate: String(SERVICE_GST_RATE),
    effectiveFrom: toDateInputValue(new Date()),
    isConfirmed: false,
    notes: "",
  };
}

export function RoutesClient({
  rows,
  items,
  parties,
}: {
  rows: RouteRow[];
  items: ItemOption[];
  parties: PartyOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [partyFilter, setPartyFilter] = useState("all");
  const [onlyUnconfirmed, setOnlyUnconfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const unconfirmed = rows.filter((row) => !row.isConfirmed).length;

  // With a few hundred imported rates, the register is only usable filtered.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (partyFilter !== "all" && (row.partyId ?? "any") !== partyFilter) return false;
      if (onlyUnconfirmed && row.isConfirmed) return false;
      if (!q) return true;
      return `${row.inputItemCode} ${row.inputDescription} ${row.outputItemCode} ${row.outputDescription} ${row.processName}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, partyFilter, onlyUnconfirmed]);

  function openFor(row: RouteRow) {
    setError(null);
    setEditing({
      _id: row._id,
      inputItem: items.find((item) => item._id === row.inputItemId) ?? null,
      outputItem: items.find((item) => item._id === row.outputItemId) ?? null,
      partyId: row.partyId ?? "",
      processName: row.processName,
      jobRate: String(row.jobRate),
      serviceHsn: row.serviceHsn,
      serviceGstRate: String(row.serviceGstRate),
      effectiveFrom: toDateInputValue(row.effectiveFrom),
      isConfirmed: row.isConfirmed,
      notes: row.notes,
    });
  }

  function submit() {
    if (!editing) return;
    setError(null);

    if (!editing.inputItem || !editing.outputItem) {
      setError("Pick both the item sent out and the item that comes back.");
      return;
    }

    const input: RouteInput = {
      inputItemId: editing.inputItem._id,
      outputItemId: editing.outputItem._id,
      partyId: editing.partyId || undefined,
      processName: editing.processName,
      jobRate: Number(editing.jobRate) || 0,
      serviceHsn: editing.serviceHsn,
      serviceGstRate: Number(editing.serviceGstRate) || SERVICE_GST_RATE,
      effectiveFrom: editing.effectiveFrom,
      isConfirmed: editing.isConfirmed,
      notes: editing.notes || undefined,
    };

    startTransition(async () => {
      const result = await saveRoute(input, editing._id || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function remove(routeId: string) {
    startTransition(async () => {
      await deleteRoute(routeId);
      router.refresh();
    });
  }

  return (
    <>
      {unconfirmed > 0 && (
        <div className="mb-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
          {unconfirmed} {unconfirmed === 1 ? "route is" : "routes are"} still unconfirmed. Bill
          rate checks only mean something once the office has verified the pairing and rate.
        </div>
      )}

      <div className="mb-3 flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setEditing(blank())}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          New route
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[16rem] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle"
              strokeWidth={1.75}
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search item code, description or process…"
              className="pl-8"
            />
          </div>
          <Select
            value={partyFilter}
            onChange={(event) => setPartyFilter(event.target.value)}
            className="w-auto min-w-[14rem]"
          >
            <option value="all">All job workers</option>
            <option value="any">Any job worker (unscoped)</option>
            {parties.map((party) => (
              <option key={party._id} value={party._id}>
                {party.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={onlyUnconfirmed}
              onChange={(event) => setOnlyUnconfirmed(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Unconfirmed only
          </label>
          <span className="text-xs text-fg-muted">
            {visible.length} of {rows.length}
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No process routes yet"
            description="A route says which coated code comes back for a given component, and at what rate."
            action={
              <Button variant="primary" size="sm" onClick={() => setEditing(blank())}>
                New route
              </Button>
            }
          />
        </Card>
      ) : (
        <TableWrap className="max-h-[68vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Sent out</Th>
                <Th />
                <Th>Comes back as</Th>
                <Th>Process</Th>
                <Th>Job worker</Th>
                <ThNum>Rate</ThNum>
                <Th>Effective</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row._id} className="transition-colors hover:bg-surface-2">
                  <Td>
                    <span className="font-mono text-[13px]">{row.inputItemCode}</span>
                    <span className="ml-1.5 text-xs text-fg-muted">{row.inputDescription}</span>
                  </Td>
                  <Td className="text-fg-subtle">
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </Td>
                  <Td>
                    <span className="font-mono text-[13px]">{row.outputItemCode}</span>
                    <span className="ml-1.5 text-xs text-fg-muted">{row.outputDescription}</span>
                  </Td>
                  <Td>{row.processName}</Td>
                  <Td className="text-fg-muted">{row.partyName ?? "Any"}</Td>
                  <TdNum className="font-medium">{formatAmount(row.jobRate)}</TdNum>
                  <Td className="text-fg-muted">{formatDate(row.effectiveFrom)}</Td>
                  <Td>
                    {row.isConfirmed ? (
                      <Chip tone="success">Confirmed</Chip>
                    ) : (
                      <Chip tone="warning">Unconfirmed</Chip>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openFor(row)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(row._id)}
                      disabled={pending}
                    >
                      Remove
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
        title={editing?._id ? "Edit process route" : "New process route"}
        description="Links a component to the coated code it comes back as, and the agreed per-piece rate."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save route"}
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
            <Field label="Item sent out" required>
              <ItemCombobox
                items={items}
                value={editing.inputItem}
                onSelect={(item) => setEditing({ ...editing, inputItem: item })}
              />
              {editing.inputItem && (
                <p className="pt-1 text-xs text-fg-muted">{editing.inputItem.description}</p>
              )}
            </Field>
            <Field label="Item that comes back" required>
              <ItemCombobox
                items={items}
                value={editing.outputItem}
                onSelect={(item) => setEditing({ ...editing, outputItem: item })}
              />
              {editing.outputItem && (
                <p className="pt-1 text-xs text-fg-muted">{editing.outputItem.description}</p>
              )}
            </Field>
            <Field label="Process name" required>
              <Input
                value={editing.processName}
                onChange={(e) => setEditing({ ...editing, processName: e.target.value })}
                placeholder="Powder Coat – Pink"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job worker" hint="Leave blank to apply to any vendor">
                <Select
                  value={editing.partyId}
                  onChange={(e) => setEditing({ ...editing, partyId: e.target.value })}
                >
                  <option value="">Any job worker</option>
                  {parties.map((party) => (
                    <option key={party._id} value={party._id}>
                      {party.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Rate per piece" required>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.jobRate}
                  onChange={(e) => setEditing({ ...editing, jobRate: e.target.value })}
                  className="tnum text-right"
                  placeholder="14.75"
                />
              </Field>
              <Field label="Service HSN">
                <Input
                  value={editing.serviceHsn}
                  onChange={(e) => setEditing({ ...editing, serviceHsn: e.target.value })}
                  className="font-mono"
                />
              </Field>
              <Field label="Service GST %">
                <Input
                  type="number"
                  value={editing.serviceGstRate}
                  onChange={(e) => setEditing({ ...editing, serviceGstRate: e.target.value })}
                  className="tnum text-right"
                />
              </Field>
            </div>
            <Field label="Effective from">
              <Input
                type="date"
                value={editing.effectiveFrom}
                onChange={(e) => setEditing({ ...editing, effectiveFrom: e.target.value })}
              />
            </Field>
            <label className="flex items-start gap-2 rounded-md border border-border bg-surface-2 p-3">
              <input
                type="checkbox"
                checked={editing.isConfirmed}
                onChange={(e) => setEditing({ ...editing, isConfirmed: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-fg">
                  Confirmed by the office
                </span>
                <span className="block text-xs text-fg-muted">
                  Tick once the pairing and rate have been checked against the vendor&apos;s
                  agreement. Bill checks warn until this is ticked.
                </span>
              </span>
            </label>
            <Field label="Notes">
              <Textarea
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </SidePanel>
    </>
  );
}
