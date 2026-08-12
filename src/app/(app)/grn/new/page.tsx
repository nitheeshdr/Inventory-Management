import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { Grn } from "@/db/models";
import { getItemOptions, getParties, getRoutes, getCompany } from "@/lib/queries/masters";
import { getPendingChallanLines } from "@/lib/allocation";
import { nextDocNumber } from "@/lib/numbering";
import { SetupRequired } from "@/components/setup-gate";
import { GrnForm } from "../grn-form";

export const dynamic = "force-dynamic";

export default async function NewGrnPage({
  searchParams,
}: {
  searchParams: Promise<{ challanId?: string }>;
}) {
  const { challanId } = await searchParams;

  const company = await getCompany();
  const [items, parties, routes, pendingLines, suggestedNo] = await Promise.all([
    getItemOptions(),
    getParties("customer"),
    getRoutes(),
    getPendingChallanLines(),
    nextDocNumber(Grn, "grnNo", company?.grnPrefix ?? "GRN"),
  ]);

  const missing = [
    ...(items.length === 0 ? [{ label: "No item codes yet", href: "/masters/items" }] : []),
    ...(parties.length === 0
      ? [{ label: "No customers yet", href: "/masters/parties" }]
      : []),
  ];

  if (missing.length > 0) {
    return (
      <>
        <Link
          href="/grn"
          className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Back to return notes
        </Link>
        <PageHeader title="New outward return" />
        <SetupRequired title="An outward return needs items and a customer" missing={missing} />
      </>
    );
  }

  return (
    <>
      <Link
        href="/grn"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to return notes
      </Link>
      <PageHeader
        title="New outward return"
        subtitle="Goods going back to the principal — processed pieces, rejections and anything unworked."
      />
      <GrnForm
        items={items}
        parties={parties}
        routes={routes}
        pendingLines={pendingLines}
        suggestedNo={suggestedNo}
        preselectChallanId={challanId}
      />
    </>
  );
}
