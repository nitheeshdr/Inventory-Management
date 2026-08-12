import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/primitives";
import { connectDb } from "@/db/connect";
import { JobWorkChallan } from "@/db/models";
import { getItemOptions, getParties } from "@/lib/queries/masters";
import { toDateInputValue } from "@/lib/format";
import { ChallanForm } from "../../challan-form";

export const dynamic = "force-dynamic";

export default async function EditChallanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const challan = await JobWorkChallan.findById(id).lean();
  if (!challan) notFound();
  if (challan.status === "cancelled") notFound();

  const [items, parties] = await Promise.all([getItemOptions(), getParties("customer")]);

  return (
    <>
      <Link
        href={`/challans/${id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to challan
      </Link>
      <PageHeader
        title={`Edit challan ${challan.challanNo}`}
        subtitle="Saving re-posts this challan's stock movements to match the new lines."
      />
      <ChallanForm
        items={items}
        parties={parties}
        initial={{
          _id: id,
          challanNo: challan.challanNo,
          challanDate: toDateInputValue(challan.challanDate),
          partyId: challan.partyId.toString(),
          ewayBillNo: challan.ewayBillNo,
          vehicleNo: challan.vehicleNo,
          transportPo: challan.transportPo,
          natureOfProcess: challan.natureOfProcess,
          taxRate: challan.cgstRate + challan.sgstRate + challan.igstRate,
          notes: challan.notes,
          lines: challan.lines.map((line) => ({
            itemId: line.itemId.toString(),
            qty: line.qty,
            rate: line.rate,
          })),
        }}
      />
    </>
  );
}
