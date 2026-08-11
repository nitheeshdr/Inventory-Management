import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { getItemOptions, getParties } from "@/lib/queries/masters";
import { SetupRequired } from "@/components/setup-gate";
import { PurchaseInvoiceForm } from "../invoice-form";

export const dynamic = "force-dynamic";

export default async function NewPurchaseInvoicePage() {
  const [items, parties] = await Promise.all([getItemOptions(), getParties("job_worker")]);

  const missing = [
    ...(items.length === 0 ? [{ label: "No item codes yet", href: "/masters/items" }] : []),
    ...(parties.length === 0
      ? [{ label: "No job workers yet", href: "/masters/parties" }]
      : []),
  ];

  if (missing.length > 0) {
    return (
      <>
        <Link
          href="/purchase-invoices"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to bills
        </Link>
        <PageHeader title="New job-work bill" />
        <SetupRequired title="A bill needs items and a job worker" missing={missing} />
      </>
    );
  }

  return (
    <>
      <Link
        href="/purchase-invoices"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to bills
      </Link>
      <PageHeader
        title="New job-work bill"
        subtitle="Checked line by line against the processed goods actually received and the agreed rate."
      />
      <PurchaseInvoiceForm items={items} parties={parties} />
    </>
  );
}
