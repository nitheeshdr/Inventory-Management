import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { connectDb } from "@/db/connect";
import { JobWorkChallan, Party } from "@/db/models";
import { getCompany } from "@/lib/queries/masters";
import { formatAmount, formatDate } from "@/lib/format";
import {
  PrintBox,
  PrintRow,
  PrintSheet,
  PrintSignature,
  PrintTable,
  PrintTitle,
  PTd,
  PTh,
} from "@/components/print/sheet";

export const dynamic = "force-dynamic";

/** Mirrors the paper "Delivery Challan (Job Work)" the plant issues today. */
export default async function ChallanPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const challan = await JobWorkChallan.findById(id).lean();
  if (!challan) notFound();

  const [party, company] = await Promise.all([
    Party.findById(challan.partyId).lean(),
    getCompany(),
  ]);

  // Keep the grid looking like a pre-printed book even on a short challan.
  const blankRows = Math.max(0, 12 - challan.lines.length);

  return (
    <PrintSheet>
      <PrintTitle
        title="Delivery Challan (Job Work)"
        subtitle={
          <>
            <div>Under Rule 10(2) of Input tax credit Rule 2017 (U/S.143)</div>
            <div>(For movement of input/Capital Goods or Partially Processed Goods by principal to Job workers)</div>
          </>
        }
        right="ORIGINAL"
      />

      <div className="border border-black">
        <div className="border-b border-black px-2 py-1 text-center text-[13px] font-bold uppercase">
          {company?.name ?? "—"}
        </div>
        <div className="grid grid-cols-2">
          <div className="border-r border-black p-2">
            {company?.addressLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
            <PrintRow label="State :" value={company?.state} />
            <PrintRow label="State code :" value={company?.stateCode} />
            <PrintRow label="GSTIN No :" value={company?.gstin} />
          </div>
          <div className="p-2">
            <PrintRow label="Challan No :" value={challan.challanNo} />
            <PrintRow label="Date :" value={formatDate(challan.challanDate)} />
            <PrintRow label="E-way bill no :" value={challan.ewayBillNo} />
            <PrintRow label="Vehicle No :" value={challan.vehicleNo} />
            <PrintRow label="TR. PO :" value={challan.transportPo} />
          </div>
        </div>

        <PrintBox className="border-x-0 border-b-0">
          <div className="font-semibold">Name &amp; address of consignee :</div>
          <div className="text-[10px] italic">(Place of processing/manufacturing)</div>
          <div className="mt-1 font-semibold uppercase">{party?.name}</div>
          {party?.addressLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
          <PrintRow label="State :" value={party?.state ?? "Andhra Pradesh"} />
          <PrintRow label="State code :" value={party?.stateCode} />
          <PrintRow label="GSTIN NO :" value={party?.gstin} />
        </PrintBox>
      </div>

      <div className="mt-1">
        <PrintTable>
          <colgroup>
            <col className="w-[6%]" />
            <col className="w-[12%]" />
            <col className="w-[34%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[6%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr>
              <PTh>SR NO</PTh>
              <PTh>Item code</PTh>
              <PTh>Description of Goods</PTh>
              <PTh>HSN CODE</PTh>
              <PTh>Quantity</PTh>
              <PTh>UNIT</PTh>
              <PTh>Rate</PTh>
              <PTh>Taxable Value</PTh>
            </tr>
          </thead>
          <tbody>
            {challan.lines.map((line) => (
              <tr key={line._id.toString()}>
                <PTd className="text-center">{line.srNo}</PTd>
                <PTd>{line.itemCode}</PTd>
                <PTd className="break-words">{line.description}</PTd>
                <PTd className="text-center">{line.hsnCode}</PTd>
                <PTd className="text-right tabular-nums">{formatAmount(line.qty)}</PTd>
                <PTd className="text-center">{line.uom}</PTd>
                <PTd className="text-right tabular-nums">{formatAmount(line.rate)}</PTd>
                <PTd className="text-right tabular-nums">
                  {formatAmount(line.taxableValue)}
                </PTd>
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
                <PTd />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <PTd colSpan={4} className="border-0" />
              <PTd colSpan={3} className="text-right font-semibold">TOTAL TAXABLE</PTd>
              <PTd className="text-right font-semibold tabular-nums">
                {formatAmount(challan.totalTaxable)}
              </PTd>
            </tr>
            <tr>
              <PTd colSpan={4} className="border-0" />
              <PTd colSpan={3} className="text-right">IN: Central GST {challan.cgstRate}%</PTd>
              <PTd className="text-right tabular-nums">{formatAmount(challan.cgstAmount)}</PTd>
            </tr>
            <tr>
              <PTd colSpan={4} className="border-0" />
              <PTd colSpan={3} className="text-right">IN: State GST {challan.sgstRate}%</PTd>
              <PTd className="text-right tabular-nums">{formatAmount(challan.sgstAmount)}</PTd>
            </tr>
            <tr>
              <PTd colSpan={4} className="border-0" />
              <PTd colSpan={3} className="text-right">IN: Integrated GST {challan.igstRate}%</PTd>
              <PTd className="text-right tabular-nums">{formatAmount(challan.igstAmount)}</PTd>
            </tr>
            <tr>
              <PTd colSpan={4} className="border-0" />
              <PTd colSpan={3} className="text-right font-semibold">TOTAL</PTd>
              <PTd className="text-right font-semibold tabular-nums">
                {formatAmount(challan.totalValue)}
              </PTd>
            </tr>
          </tfoot>
        </PrintTable>
      </div>

      <div className="mt-1 border border-black p-2">
        <PrintRow label="Nature of processing/manufacturing to be done :" value={challan.natureOfProcess} />
        <PrintRow label="Expected duration of process/manufacturing:" value={challan.expectedDuration} />
        <div className="mt-1 font-bold">
          PART-II (To be filled by the processing factory (job worker) in original and duplicate
          challans.)
        </div>
        <ol className="ml-4 list-decimal text-[10px] leading-5">
          <li>Date of despatch of semi-finish/finished goods to principal factory /another.</li>
          <li>Quantity despatch (No./Weight/Litre/Metre) and entered in Account.</li>
          <li>Nature of processing/manufacturing done</li>
          <li>
            Quantity of the waste material returned to the parent factory or cleared for home
            consumption. Invoice No. and date. Quantum of duty paid (Both Figure and Words)
          </li>
        </ol>
        <div className="mt-1 font-bold">Declaration :</div>
        <div>
          Goods Sent for Job Work under section 143 of GST Act 2016 without payment of GST to be
          returned within one year.
        </div>
        <div className="mt-1 text-[10px]">
          Return due by <span className="font-semibold">{formatDate(challan.dueDate)}</span>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div className="text-[10px]">DATE :</div>
        <PrintSignature label="Authorized signatory :" />
      </div>

      <div className="mt-2 text-right text-[9px]">Page 1 of 1</div>
    </PrintSheet>
  );
}
