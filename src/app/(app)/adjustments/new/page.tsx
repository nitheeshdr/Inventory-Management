import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { getItemOptions } from "@/lib/queries/masters";
import { getLocations } from "@/lib/queries/stock";
import { SetupRequired } from "@/components/setup-gate";
import { AdjustmentForm } from "../adjustment-form";

export const dynamic = "force-dynamic";

export default async function NewAdjustmentPage() {
  const [items, locations] = await Promise.all([getItemOptions(), getLocations()]);

  if (items.length === 0) {
    return (
      <>
        <Link
          href="/adjustments"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to adjustments
        </Link>
        <PageHeader title="New stock adjustment" />
        <SetupRequired
          title="An adjustment needs item codes"
          missing={[{ label: "No item codes yet", href: "/masters/items" }]}
        />
      </>
    );
  }

  return (
    <>
      <Link
        href="/adjustments"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to adjustments
      </Link>
      <PageHeader
        title="New stock adjustment"
        subtitle="For opening balances and physical-count corrections — everything else should come from a document."
      />
      <AdjustmentForm items={items} locations={locations} />
    </>
  );
}
