import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { connectDb } from "@/db/connect";
import { Grn, Party } from "@/db/models";
import { getCompany } from "@/lib/queries/masters";
import { GRN_LINE_KIND_LABELS } from "@/lib/constants";
import { formatDate, formatQty, round3 } from "@/lib/format";
import {
  PrintRow,
  PrintSheet,
  PrintSignature,
  PrintTable,
  PrintTitle,
  PTd,
  PTh,
} from "@/components/print/sheet";

export const dynamic = "force-dynamic";

/**
 * Mirrors the vendor's "Return Note". Entry rows are split per challan line for
 * exact allocation, so they are grouped back by item and kind here — that is how
 * the paper document reads.
 */
export default async function GrnPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const grn = await Grn.findById(id).lean();
  if (!grn) notFound();

  const [party, company] = await Promise.all([Party.findById(grn.partyId).lean(), getCompany()]);

  const grouped = new Map<
    string,
    { itemCode: string; description: string; uom: string; kind: string; qty: number; reason?: string }
  >();

  for (const line of grn.lines) {
    const key = `${line.itemCode}|${line.lineKind}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.qty = round3(existing.qty + line.qty);
    } else {
      grouped.set(key, {
        itemCode: line.itemCode,
        description: line.description,
        uom: line.uom,
        kind: GRN_LINE_KIND_LABELS[line.lineKind],
        qty: line.qty,
        reason: line.rejectionReason,
      });
    }
  }

  const rows = [...grouped.values()];
  const blankRows = Math.max(0, 12 - rows.length);
  const totalQty = round3(rows.reduce((total, row) => total + row.qty, 0));

  return (
    <PrintSheet>
      <PrintTitle title="Return Note" />

      <div className="border border-black">
        <div className="border-b border-black px-2 py-1 text-center">
          <div className="text-[13px] font-bold uppercase">{party?.name}</div>
          <div className="text-[10px]">{party?.addressLines.join(", ")}</div>
          <div className="text-[10px]">GSTIN: {party?.gstin}</div>
        </div>

        <div className="grid grid-cols-2">
          <div className="border-r border-black p-2">
            <div className="font-semibold">Party Details:</div>
            <div className="font-semibold uppercase">{company?.name}</div>
            {company?.addressLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
            <PrintRow label="Party GSTIN :" value={company?.gstin} />
          </div>
          <div className="p-2">
            <PrintRow label="NO." value={grn.vendorDocNo || grn.grnNo} />
            <PrintRow label="DATE :" value={formatDate(grn.grnDate)} />
            <PrintRow label="GR No." value={grn.grNo} />
            <PrintRow label="Vehicle No." value={grn.vehicleNo} />
            <PrintRow label="TRANSPORT" value={grn.transportRemark} />
            <PrintRow label="Our GRN" value={grn.grnNo} />
          </div>
        </div>
      </div>

      <div className="mt-1">
        <PrintTable>
          <colgroup>
            <col className="w-[6%]" />
            <col className="w-[16%]" />
            <col className="w-[34%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr>
              <PTh>S.N</PTh>
              <PTh>ITEM CODE</PTh>
              <PTh>ITEM DESCRIPTION</PTh>
              <PTh>REASON</PTh>
              <PTh>QTY</PTh>
              <PTh>UNIT</PTh>
              <PTh>AMOUNT</PTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.itemCode}-${row.kind}`}>
                <PTd className="text-center">{index + 1}</PTd>
                <PTd>{row.itemCode}</PTd>
                <PTd className="break-words">{row.description}</PTd>
                <PTd className="break-words">{row.reason ?? row.kind}</PTd>
                <PTd className="text-right tabular-nums">{formatQty(row.qty)}</PTd>
                <PTd className="text-center">{row.uom}</PTd>
                <PTd className="text-right tabular-nums">0.00</PTd>
              </tr>
            ))}
            {Array.from({ length: blankRows }).map((_, index) => (
              <tr key={`blank-${index}`}>
                <PTd>&nbsp;</PTd>
                <PTd />
                <PTd />
                <PTd />
                <PTd />
                <PTd />
                <PTd />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <PTd colSpan={4} className="text-right font-semibold">
                TOTAL
              </PTd>
              <PTd className="text-right font-semibold tabular-nums">{formatQty(totalQty)}</PTd>
              <PTd />
              <PTd className="text-right font-semibold tabular-nums">0.00</PTd>
            </tr>
          </tfoot>
        </PrintTable>
      </div>

      {grn.notes && <div className="mt-2 text-[10px]">Note: {grn.notes}</div>}

      <div className="mt-2 text-[10px]">
        Goods received back against job-work challans:{" "}
        {[...new Set(grn.lines.flatMap((l) => l.allocations.map((a) => a.challanNo)))]
          .filter(Boolean)
          .join(", ") || "—"}
      </div>

      <PrintSignature label="Authorised Signatory" />
    </PrintSheet>
  );
}
