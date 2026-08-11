"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui/primitives";
import type { CompanyInfo } from "@/lib/queries/masters";
import { saveCompany, type CompanyInput } from "../actions";

export function CompanyClient({ company }: { company: CompanyInfo | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: company?.name ?? "",
    gstin: company?.gstin ?? "",
    addressLines: company?.addressLines.join("\n") ?? "",
    state: company?.state ?? "Andhra Pradesh",
    stateCode: company?.stateCode ?? "37",
    bankName: company?.bankName ?? "",
    bankAccount: company?.bankAccount ?? "",
    bankIfsc: company?.bankIfsc ?? "",
    challanPrefix: company?.challanPrefix ?? "JW",
    salesInvoicePrefix: company?.salesInvoicePrefix ?? "HH",
    grnPrefix: company?.grnPrefix ?? "GRN",
  });

  function submit() {
    setError(null);
    setFieldErrors({});
    setSaved(false);

    startTransition(async () => {
      const result = await saveCompany(form as CompanyInput);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      {error && (
        <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          Saved. Printed documents will use these details.
        </p>
      )}

      <Card>
        <CardHeader
          title="Company"
          subtitle="Printed at the top of every challan and invoice."
        />
        <div className="space-y-4 p-4">
          <Field label="Name" required error={fieldErrors.name}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Factory address" hint="One line per row, exactly as it should print">
            <Textarea
              value={form.addressLines}
              onChange={(e) => setForm({ ...form, addressLines: e.target.value })}
              className="min-h-[96px]"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="GSTIN" required error={fieldErrors.gstin}>
              <Input
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                className="font-mono uppercase"
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </Field>
            <Field label="State code" hint="Taken from the GSTIN on save">
              <Input
                value={form.stateCode}
                onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                className="font-mono"
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Bank details" subtitle="Printed on sales invoices." />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="Bank name">
            <Input
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
          </Field>
          <Field label="Account no">
            <Input
              value={form.bankAccount}
              onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="IFSC">
            <Input
              value={form.bankIfsc}
              onChange={(e) => setForm({ ...form, bankIfsc: e.target.value.toUpperCase() })}
              className="font-mono uppercase"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Document numbering"
          subtitle="Used for the numbers this app generates. Challan numbers stay manual — they come from your existing plant software."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="Return note prefix" hint="e.g. GRN/26-27/0001">
            <Input
              value={form.grnPrefix}
              onChange={(e) => setForm({ ...form, grnPrefix: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="Sales invoice prefix">
            <Input
              value={form.salesInvoicePrefix}
              onChange={(e) => setForm({ ...form, salesInvoicePrefix: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="Challan prefix" hint="Reference only">
            <Input
              value={form.challanPrefix}
              onChange={(e) => setForm({ ...form, challanPrefix: e.target.value })}
              className="font-mono"
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save company details"}
        </Button>
      </div>
    </div>
  );
}
