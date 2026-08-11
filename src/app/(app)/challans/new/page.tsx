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
    getParties("job_worker"),
  ]);

  const missing = [
    ...(items.length === 0
      ? [{ label: "No item codes yet", href: "/masters/items" }]
      : []),
    ...(parties.length === 0
      ? [{ label: "No job workers yet", href: "/masters/parties" }]
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
        <PageHeader title="New job-work challan" />
        <SetupRequired title="A challan needs items and a job worker" missing={missing} />
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
        title="New job-work challan"
        subtitle="Goods leaving the plant for a job worker under Section 143 — returnable within one year."
      />
      <ChallanForm items={items} parties={parties} />
    </>
  );
}
