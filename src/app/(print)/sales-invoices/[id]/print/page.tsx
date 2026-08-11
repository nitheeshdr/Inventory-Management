import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { connectDb } from "@/db/connect";
import { Party, SalesInvoice } from "@/db/models";
import { getCompany } from "@/lib/queries/masters";
import { amountInWords, formatAmount, formatDate, formatQty } from "@/lib/format";
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

/** GST tax invoice in the same shape as the vendor bills the office already files. */
export default async function SalesInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectDb();
  const invoice = await SalesInvoice.findById(id).lean();
  if (!invoice) notFound();

  const [party, company] = await Promise.all([
    Party.findById(invoice.partyId).lean(),
    getCompany(),
  ]);

  const blankRows = Math.max(0, 10 - invoice.lines.length);

  return (
    <PrintSheet>
      <PrintTitle title="Tax Invoice" />

      <div className="border border-black">
        <div className="border-b border-black px-2 py-1 text-center">
          <div className="text-[14px] font-bold uppercase">{company?.name}</div>
          <div className="text-[10px]">{company?.addressLines.join(", ")}</div>
          <div className="text-[10px]">
            GSTIN: {company?.gstin} · State: {company?.state} ({company?.stateCode})
          </div>
        </div>

        <div className="grid grid-cols-2">
          <div className="border-r border-black p-2">
            <div className="font-semibold">BILL TO / SHIP TO</div>
            <div className="font-semibold uppercase">{party?.name}</div>
            {party?.addressLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
            <PrintRow label="GSTIN :" value={party?.gstin} />
            <PrintRow label="State code :" value={party?.stateCode} />
          </div>
          <div className="p-2">
            <PrintRow label="Invoice No :" value={invoice.invoiceNo} />
            <PrintRow label="Invoice Date :" value={formatDate(invoice.invoiceDate)} />
            <PrintRow label="PO No :" value={invoice.poNo} />
            <PrintRow label="Vehicle No :" value={invoice.vehicleNo} />
            <PrintRow label="Transport :" value={invoice.transport} />
            <PrintRow label="Destination :" value={invoice.destination} />
            <PrintRow label="E-way bill :" value={invoice.ewayBillNo} />
          </div>
        </div>
      </div>

      <div className="mt-1">
        <PrintTable>
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[33%]" />
            <col className="w-[11%]" />
            <col className="w-[9%]" />
            <col className="w-[6%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead>
            <tr>
              <PTh>S.N</PTh>
              <PTh>ITEM DESCRIPTION</PTh>
              <PTh>HSN CODE</PTh>
              <PTh>QTY</PTh>
              <PTh>UOM</PTh>
              <PTh>RATE</PTh>
              <PTh>TAXABLE AMT.</PTh>
              <PTh>AMOUNT</PTh>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line._id.toString()}>
                <PTd className="text-center">{line.srNo}</PTd>
                <PTd className="break-words">
                  {line.itemCode} — {line.description}
                </PTd>
                <PTd className="text-center">{line.hsnCode}</PTd>
                <PTd className="text-right tabular-nums">{formatQty(line.qty)}</PTd>
                <PTd className="text-center">{line.uom}</PTd>
                <PTd className="text-right tabular-nums">{formatAmount(line.rate)}</PTd>
                <PTd className="text-right tabular-nums">
                  {formatAmount(line.taxableAmount)}
                </PTd>
                <PTd className="text-right tabular-nums">{formatAmount(line.amount)}</PTd>
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
        </PrintTable>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-1">
        <div className="border border-black p-2">
          <div className="font-semibold">Bill Amount In Words :</div>
          <div>{invoice.amountInWords || amountInWords(invoice.grandTotal)}</div>
          {company?.bankName && (
            <>
              <div className="mt-2 font-semibold">Bank details :</div>
              <div>{company.bankName}</div>
              <div>
                A/C {company.bankAccount} · IFSC {company.bankIfsc}
              </div>
            </>
          )}
          <div className="mt-2 text-[9px]">
            Certified that the particulars given above are true and correct, and that the amount
            indicated represents the price actually charged.
          </div>
        </div>

        <div className="border border-black">
          <table className="w-full text-[10px]">
            <tbody>
              <TotalLine label="Total Qty" value={formatQty(invoice.totalQty)} />
              <TotalLine label="Total Amount Before Tax" value={formatAmount(invoice.subtotal)} />
              {invoice.isInterState ? (
                <TotalLine label="Add: IGST" value={formatAmount(invoice.igstAmount)} />
              ) : (
                <>
                  <TotalLine label="Add: CGST" value={formatAmount(invoice.cgstAmount)} />
                  <TotalLine label="Add: SGST" value={formatAmount(invoice.sgstAmount)} />
                </>
              )}
              <TotalLine label="Total Tax Amount : GST" value={formatAmount(invoice.totalTax)} />
              <TotalLine label="Round Off" value={formatAmount(invoice.roundOff)} />
              <tr className="border-t border-black">
                <td className="px-2 py-1 font-bold">GRAND TOTAL</td>
                <td className="px-2 py-1 text-right font-bold tabular-nums">
                  {formatAmount(invoice.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-1 flex items-end justify-between">
        <div className="text-[9px]">E. &amp; O.E.</div>
        <div>
          <div className="text-right text-[10px] font-semibold">For {company?.name}</div>
          <PrintSignature label="Authorised Signatory" />
        </div>
      </div>
    </PrintSheet>
  );
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="px-2 py-0.5">{label}</td>
      <td className="px-2 py-0.5 text-right tabular-nums">{value}</td>
    </tr>
  );
}
