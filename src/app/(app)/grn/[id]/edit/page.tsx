import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { connectDb } from "@/db/connect";
import { Grn } from "@/db/models";
import { getItemOptions, getParties, getRoutes } from "@/lib/queries/masters";
import { getPendingChallanLines } from "@/lib/allocation";
import { toDateInputValue } from "@/lib/format";
import { GrnForm } from "../../grn-form";

export const dynamic = "force-dynamic";

export default async function EditGrnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const grn = await Grn.findById(id).lean();
  if (!grn || grn.status === "cancelled") notFound();

  const [items, parties, routes, pendingLines] = await Promise.all([
    getItemOptions(),
    getParties("job_worker"),
    getRoutes(),
    // This note's own allocations are excluded so its lines stay editable.
    getPendingChallanLines({ excludeGrnId: id }),
  ]);

  return (
    <>
      <Link
        href={`/grn/${id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to return note
      </Link>
      <PageHeader
        title={`Edit return note ${grn.grnNo}`}
        subtitle="Saving re-posts the stock movements and recalculates the challans it touches."
      />
      <GrnForm
        items={items}
        parties={parties}
        routes={routes}
        pendingLines={pendingLines}
        suggestedNo={grn.grnNo}
        initial={{
          _id: id,
          grnNo: grn.grnNo,
          vendorDocNo: grn.vendorDocNo,
          grnDate: toDateInputValue(grn.grnDate),
          partyId: grn.partyId.toString(),
          vehicleNo: grn.vehicleNo,
          grNo: grn.grNo,
          transportRemark: grn.transportRemark,
          notes: grn.notes,
          lines: grn.lines.flatMap((line) =>
            line.allocations.map((alloc) => ({
              challanId: alloc.challanId.toString(),
              challanNo: alloc.challanNo,
              challanLineId: alloc.challanLineId.toString(),
              inputItemId: (line.inputItemId ?? line.itemId).toString(),
              itemId: line.itemId.toString(),
              lineKind: line.lineKind,
              qty: alloc.qty,
              rejectionReason: line.rejectionReason,
              routeId: line.routeId?.toString(),
            })),
          ),
        }}
      />
    </>
  );
}
