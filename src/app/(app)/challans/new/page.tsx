import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { getItemOptions, getParties } from "@/lib/queries/masters";
import { SetupRequired } from "@/components/setup-gate";
import { ChallanForm } from "../challan-form";

export const dynamic = "force-dynamic";

export default async function NewChallanPage() {
  const [items, parties] = await Promise.all([
    getItemOptions(),
    getParties("customer"),
  ]);

  const missing = [
    ...(items.length === 0
      ? [{ label: "No item codes yet", href: "/masters/items" }]
      : []),
    ...(parties.length === 0
      ? [{ label: "No customers yet", href: "/masters/parties" }]
      : []),
  ];

  if (missing.length > 0) {
    return (
      <>
        <Link
          href="/challans"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to challans
        </Link>
        <PageHeader title="New inward challan" />
        <SetupRequired title="An inward challan needs items and a customer" missing={missing} />
      </>
    );
  }

  return (
    <>
      <Link
        href="/challans"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to challans
      </Link>
      <PageHeader
        title="New inward challan"
        subtitle="Goods arriving from a principal for processing under Section 143 — returnable within one year."
      />
      <ChallanForm items={items} parties={parties} />
    </>
  );
}
