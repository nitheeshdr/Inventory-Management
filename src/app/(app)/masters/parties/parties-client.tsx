"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
  Textarea,
  Th,
} from "@/components/ui/primitives";
import { SidePanel } from "@/components/ui/modal";
import { PARTY_TYPES, type PartyType } from "@/lib/constants";
import { saveParty, type PartyInput } from "../actions";

export interface PartyRow {
  _id: string;
  code: string;
  name: string;
  partyType: PartyType;
  gstin: string;
  addressLines: string[];
  state: string;
  stateCode: string;
  contactName: string;
  phone: string;
  email: string;
  isActive: boolean;
}

const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  job_worker: "Job worker",
  customer: "Customer",
  supplier: "Supplier",
};

function blank(): PartyRow {
  return {
    _id: "",
    code: "",
    name: "",
    partyType: "job_worker",
    gstin: "",
    addressLines: [],
    state: "Andhra Pradesh",
    stateCode: "37",
    contactName: "",
    phone: "",
    email: "",
    isActive: true,
  };
}

export function PartiesClient({ rows }: { rows: PartyRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<PartyRow | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function open(row: PartyRow) {
    setEditing(row);
    setAddress(row.addressLines.join("\n"));
    setError(null);
    setFieldErrors({});
  }

  function submit() {
    if (!editing) return;
    setError(null);
    setFieldErrors({});

    const input: PartyInput = {
      code: editing.code,
      name: editing.name,
      partyType: editing.partyType,
      gstin: editing.gstin || undefined,
      addressLines: address,
      state: editing.state,
      stateCode: editing.stateCode,
      contactName: editing.contactName || undefined,
      phone: editing.phone || undefined,
      email: editing.email || undefined,
      isActive: editing.isActive,
    };

    startTransition(async () => {
      const result = await saveParty(input, editing._id || undefined);
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
      <div className="mb-3 flex justify-end">
        <Button variant="primary" size="sm" onClick={() => open(blank())}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          New party
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No parties yet"
            description="Add your job workers and customers here."
            action={
              <Button variant="primary" size="sm" onClick={() => open(blank())}>
                New party
              </Button>
            }
          />
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>GSTIN</Th>
                <Th>State</Th>
                <Th>Contact</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="transition-colors hover:bg-surface-2">
                  <Td className="font-mono text-[13px]">{row.code}</Td>
                  <Td className="font-medium">{row.name}</Td>
                  <Td>
                    <Chip tone={row.partyType === "job_worker" ? "accent" : "neutral"}>
                      {PARTY_TYPE_LABELS[row.partyType]}
                    </Chip>
                  </Td>
                  <Td className="font-mono text-xs text-fg-muted">{row.gstin || "—"}</Td>
                  <Td className="text-fg-muted">
                    {row.state} ({row.stateCode})
                  </Td>
                  <Td className="text-fg-muted">{row.phone || "—"}</Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => open(row)}>
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
        onOpenChange={(isOpen) => !isOpen && setEditing(null)}
        title={editing?._id ? `Edit ${editing.name}` : "New party"}
        description="Saving a job worker also creates their stock location."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save party"}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" required error={fieldErrors.code}>
                <Input
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  className="font-mono uppercase"
                  placeholder="BE"
                />
              </Field>
              <Field label="Type" required>
                <Select
                  value={editing.partyType}
                  onChange={(e) =>
                    setEditing({ ...editing, partyType: e.target.value as PartyType })
                  }
                >
                  {PARTY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PARTY_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Name" required error={fieldErrors.name}>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="BEST ENTERPRISES"
              />
            </Field>
            <Field
              label="GSTIN"
              error={fieldErrors.gstin}
              hint="The state code is taken from the first two digits."
            >
              <Input
                value={editing.gstin}
                onChange={(e) => setEditing({ ...editing, gstin: e.target.value.toUpperCase() })}
                className="font-mono uppercase"
                placeholder="37ALAPP4700H1ZB"
              />
            </Field>
            <Field label="Address" hint="One line per row, as it should print">
              <Textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="min-h-[96px]"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="State">
                <Input
                  value={editing.state}
                  onChange={(e) => setEditing({ ...editing, state: e.target.value })}
                />
              </Field>
              <Field label="State code">
                <Input
                  value={editing.stateCode}
                  onChange={(e) => setEditing({ ...editing, stateCode: e.target.value })}
                  className="font-mono"
                />
              </Field>
              <Field label="Contact name">
                <Input
                  value={editing.contactName}
                  onChange={(e) => setEditing({ ...editing, contactName: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}
      </SidePanel>
    </>
  );
}
