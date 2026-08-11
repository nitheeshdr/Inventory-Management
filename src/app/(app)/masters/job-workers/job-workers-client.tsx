"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  MapPin,
  Plus,
  Route,
  Search,
  Users,
  XCircle,
} from "lucide-react";
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
import { isValidGstin, stateCodeFromGstin, stateNameFromCode } from "@/lib/gst";
import { saveParty, type PartyInput } from "../actions";

export interface JobWorkerRow {
  _id: string;
  code: string;
  name: string;
  partyType: "job_worker";
  gstin: string;
  pan: string;
  addressLines: string[];
  state: string;
  stateCode: string;
  contactName: string;
  phone: string;
  email: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  notes: string;
  isActive: boolean;
  locationName: string;
  routeCount: number;
}

function blank(): JobWorkerRow {
  return {
    _id: "",
    code: "",
    name: "",
    partyType: "job_worker",
    gstin: "",
    pan: "",
    addressLines: [],
    state: "Andhra Pradesh",
    stateCode: "37",
    contactName: "",
    phone: "",
    email: "",
    bankName: "",
    bankAccount: "",
    bankIfsc: "",
    notes: "",
    isActive: true,
    locationName: "Will be created automatically",
    routeCount: 0,
  };
}

export function JobWorkersClient({ rows }: { rows: JobWorkerRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<JobWorkerRow | null>(null);
  const [address, setAddress] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.isActive).length;
    const inactive = total - active;
    const totalRoutes = rows.reduce((acc, r) => acc + r.routeCount, 0);
    return { total, active, inactive, totalRoutes };
  }, [rows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter === "active" && !row.isActive) return false;
      if (statusFilter === "inactive" && row.isActive) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        row.code.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.gstin.toLowerCase().includes(q) ||
        row.pan.toLowerCase().includes(q) ||
        row.phone.toLowerCase().includes(q) ||
        row.contactName.toLowerCase().includes(q) ||
        row.state.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  function open(row: JobWorkerRow) {
    setEditing(row);
    setAddress(row.addressLines.join("\n"));
    setError(null);
    setFieldErrors({});
  }

  function handleGstinChange(val: string) {
    if (!editing) return;
    const gstin = val.toUpperCase();
    const updates: Partial<JobWorkerRow> = { gstin };

    if (isValidGstin(gstin)) {
      const code = stateCodeFromGstin(gstin);
      if (code) {
        updates.stateCode = code;
        updates.state = stateNameFromCode(code) || editing.state;
      }
      // Auto populate PAN if empty or if previous PAN matched old GSTIN derive
      const autoPan = gstin.substring(2, 12);
      if (!editing.pan || editing.pan === editing.gstin.substring(2, 12)) {
        updates.pan = autoPan;
      }
    }

    setEditing({ ...editing, ...updates });
  }

  function submit() {
    if (!editing) return;
    setError(null);
    setFieldErrors({});

    const input: PartyInput = {
      code: editing.code,
      name: editing.name,
      partyType: "job_worker",
      gstin: editing.gstin || undefined,
      pan: editing.pan || undefined,
      addressLines: address,
      state: editing.state,
      stateCode: editing.stateCode,
      contactName: editing.contactName || undefined,
      phone: editing.phone || undefined,
      email: editing.email || undefined,
      bankName: editing.bankName || undefined,
      bankAccount: editing.bankAccount || undefined,
      bankIfsc: editing.bankIfsc || undefined,
      notes: editing.notes || undefined,
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

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="space-y-5">
      {/* Top metrics dashboard */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Total Registered</span>
            <Users className="h-4 w-4 text-accent" strokeWidth={1.75} />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-fg">{metrics.total}</div>
          <p className="mt-0.5 text-xs text-fg-subtle">Job workers in master directory</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Active Workers</span>
            <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.75} />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-fg">{metrics.active}</div>
          <p className="mt-0.5 text-xs text-fg-subtle">Eligible for outward challans</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Stock Locations</span>
            <MapPin className="h-4 w-4 text-info" strokeWidth={1.75} />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-fg">{metrics.active}</div>
          <p className="mt-0.5 text-xs text-fg-subtle">Vendor locations mapped for inventory</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Linked Processes</span>
            <Route className="h-4 w-4 text-warning" strokeWidth={1.75} />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-fg">
            {metrics.totalRoutes}
          </div>
          <p className="mt-0.5 text-xs text-fg-subtle">Configured process routes</p>
        </Card>
      </div>

      {/* Toolbar & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-fg-subtle" strokeWidth={1.75} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, name, GSTIN, phone..."
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-32 shrink-0"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>

        <Button variant="primary" size="md" onClick={() => open(blank())}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          Register Job Worker
        </Button>
      </div>

      {/* Directory Table */}
      {filteredRows.length === 0 ? (
        <Card>
          <EmptyState
            title={rows.length === 0 ? "No Job Workers Registered" : "No matches found"}
            description={
              rows.length === 0
                ? "Register job workers to send goods out via job-work challans and track lying inventory."
                : "Try clearing search filters or registering a new job worker."
            }
            action={
              <Button variant="primary" size="sm" onClick={() => open(blank())}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Register Job Worker
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
                <Th>Job Worker Name</Th>
                <Th>GSTIN / PAN</Th>
                <Th>Stock Location</Th>
                <Th>Contact Details</Th>
                <Th>Bank Account</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row._id} className="transition-colors hover:bg-surface-2">
                  <Td className="font-mono text-xs font-semibold text-accent">{row.code}</Td>

                  <Td>
                    <div className="min-w-[140px]">
                      <div className="font-medium text-fg">{row.name}</div>
                      {row.notes && (
                        <div className="line-clamp-1 text-[11px] text-fg-subtle">{row.notes}</div>
                      )}
                    </div>
                  </Td>

                  <Td>
                    <div className="space-y-0.5 font-mono text-xs">
                      {row.gstin ? (
                        <div className="flex items-center gap-1 text-fg">
                          <span>{row.gstin}</span>
                          <button
                            onClick={() => copyToClipboard(row.gstin, `gst-${row._id}`)}
                            title="Copy GSTIN"
                            className="text-fg-subtle hover:text-fg"
                          >
                            {copiedId === `gst-${row._id}` ? (
                              <CheckCircle2 className="h-3 w-3 text-success" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-fg-subtle">Unregistered</span>
                      )}
                      {row.pan && (
                        <div className="text-[11px] text-fg-muted">
                          PAN: <span className="font-mono uppercase">{row.pan}</span>
                        </div>
                      )}
                    </div>
                  </Td>

                  <Td>
                    <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-info" />
                      <span>{row.locationName}</span>
                    </div>
                  </Td>

                  <Td>
                    <div className="text-xs">
                      {row.contactName && (
                        <div className="font-medium text-fg">{row.contactName}</div>
                      )}
                      {row.phone && <div className="text-fg-muted">{row.phone}</div>}
                      {!row.contactName && !row.phone && (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </div>
                  </Td>

                  <Td>
                    {row.bankAccount ? (
                      <div className="flex items-center gap-1 text-xs text-fg-muted">
                        <CreditCard className="h-3.5 w-3.5 text-success" />
                        <span className="font-mono">{row.bankName || "Bank"} (…{row.bankAccount.slice(-4)})</span>
                      </div>
                    ) : (
                      <span className="text-xs text-fg-subtle">Not added</span>
                    )}
                  </Td>

                  <Td>
                    <Chip tone={row.isActive ? "success" : "neutral"}>
                      {row.isActive ? "Active" : "Inactive"}
                    </Chip>
                  </Td>

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

      {/* Interactive Registration SidePanel */}
      <SidePanel
        open={editing !== null}
        onOpenChange={(isOpen) => !isOpen && setEditing(null)}
        title={editing?._id ? `Edit ${editing.name}` : "Register New Job Worker"}
        description="Registering a job worker provisions their vendor stock location for inventory balance tracking."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {pending
                ? "Saving..."
                : editing?._id
                ? "Update Job Worker"
                : "Register Job Worker"}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-5">
            {error && (
              <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            {/* Section 1: Vendor Profile */}
            <div className="rounded-lg border border-border bg-surface p-3.5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border text-xs font-semibold text-fg uppercase tracking-wider">
                <Building2 className="h-4 w-4 text-accent" />
                Vendor Identity
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Vendor / Short Code" required error={fieldErrors.code}>
                  <Input
                    value={editing.code}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                    className="font-mono uppercase"
                    placeholder="BE or JW-001"
                  />
                </Field>

                <Field label="Worker / Legal Name" required error={fieldErrors.name}>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="BEST ENTERPRISES"
                  />
                </Field>
              </div>

              <Field
                label="GSTIN"
                error={fieldErrors.gstin}
                hint="15-character GST identification number. State code & PAN are auto-derived."
              >
                <Input
                  value={editing.gstin}
                  onChange={(e) => handleGstinChange(e.target.value)}
                  className="font-mono uppercase"
                  placeholder="37ALAPP4700H1ZB"
                />
              </Field>
            </div>

            {/* Section 2: Contact Details */}
            <div className="rounded-lg border border-border bg-surface p-3.5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border text-xs font-semibold text-fg uppercase tracking-wider">
                <Users className="h-4 w-4 text-accent" />
                Contact & Address
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Primary Contact Person">
                  <Input
                    value={editing.contactName}
                    onChange={(e) => setEditing({ ...editing, contactName: e.target.value })}
                    placeholder="E.g. K. Rajesh"
                  />
                </Field>

                <Field label="Phone Number">
                  <Input
                    value={editing.phone}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </Field>
              </div>

              <Field label="Email Address">
                <Input
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  placeholder="vendor@bestenterprises.com"
                />
              </Field>

              <Field label="Factory / Registered Address" hint="One line per row, as it will appear on job work challans">
                <Textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="min-h-[80px]"
                  placeholder="Plot No 45, Industrial Estate, Sri City..."
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="State">
                  <Input
                    value={editing.state}
                    onChange={(e) => setEditing({ ...editing, state: e.target.value })}
                  />
                </Field>
                <Field label="State Code">
                  <Input
                    value={editing.stateCode}
                    onChange={(e) => setEditing({ ...editing, stateCode: e.target.value })}
                    className="font-mono"
                  />
                </Field>
              </div>
            </div>

            {/* Section 3: Tax & Bank Account */}
            <div className="rounded-lg border border-border bg-surface p-3.5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border text-xs font-semibold text-fg uppercase tracking-wider">
                <CreditCard className="h-4 w-4 text-accent" />
                Taxation & Banking
              </div>

              <Field label="PAN Number" hint="10-digit Permanent Account Number">
                <Input
                  value={editing.pan}
                  onChange={(e) => setEditing({ ...editing, pan: e.target.value.toUpperCase() })}
                  className="font-mono uppercase"
                  placeholder="ALAPP4700H"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Bank Name">
                  <Input
                    value={editing.bankName}
                    onChange={(e) => setEditing({ ...editing, bankName: e.target.value })}
                    placeholder="HDFC Bank"
                  />
                </Field>

                <Field label="Account Number">
                  <Input
                    value={editing.bankAccount}
                    onChange={(e) => setEditing({ ...editing, bankAccount: e.target.value })}
                    className="font-mono"
                    placeholder="5010023456789"
                  />
                </Field>

                <Field label="IFSC Code">
                  <Input
                    value={editing.bankIfsc}
                    onChange={(e) => setEditing({ ...editing, bankIfsc: e.target.value.toUpperCase() })}
                    className="font-mono uppercase"
                    placeholder="HDFC0001234"
                  />
                </Field>
              </div>
            </div>

            {/* Section 4: Operational Notes & Status */}
            <div className="rounded-lg border border-border bg-surface p-3.5 space-y-3">
              <Field label="Process Specialization / Notes" hint="Optional notes, process capabilities, or quality remarks">
                <Textarea
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="E.g. Heat treatment, CNC machining, electroplating capacity 500kg/day..."
                  className="min-h-[64px]"
                />
              </Field>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActiveWorker"
                  checked={editing.isActive}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                />
                <label htmlFor="isActiveWorker" className="text-sm font-medium text-fg cursor-pointer">
                  Active for outward challans and job work
                </label>
              </div>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
