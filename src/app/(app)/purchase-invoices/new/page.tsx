import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { getItemOptions, getParties } from "@/lib/queries/masters";
import { SetupRequired } from "@/components/setup-gate";
import { PurchaseInvoiceForm } from "../invoice-form";

export const dynamic = "force-dynamic";

export default async function NewPurchaseInvoicePage() {
  const [items, parties] = await Promise.all([getItemOptions(), getParties("supplier")]);

  const missing = [
    ...(items.length === 0 ? [{ label: "No item codes yet", href: "/masters/items" }] : []),
    ...(parties.length === 0
      ? [{ label: "No suppliers yet", href: "/masters/parties" }]
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
        <PageHeader title="New supplier bill" />
        <SetupRequired title="A bill needs items and a supplier" missing={missing} />
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
        title="New supplier bill"
        subtitle="A bill from one of your own suppliers. It records money only — no stock moves."
      />
      <PurchaseInvoiceForm items={items} parties={parties} />
    </>
  );
}
