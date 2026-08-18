/**
 * One-time correction for a bug in saveSalesInvoice: it was posting stock
 * movements as if a sales invoice were goods leaving the plant. It isn't — we
 * are the job worker, the customer owns the material throughout, and it
 * already left the plant's books on the return note (GRN) that sent it back
 * to them. A sales invoice here is the job-work bill: money only, exactly
 * like a purchase invoice. See src/app/(app)/sales-invoices/actions.ts.
 *
 * This does not touch the sales invoices themselves — they stay exactly as
 * issued. It only neutralises the stock effect they should never have had,
 * the same way cancelling a document already works in this app: by posting
 * reversing rows, never by deleting the originals. Safe to re-run — an
 * invoice already reversed (including by a real cancellation) is skipped.
 *
 * Run with:  npm run fix-sales-invoice-stock
 */
import "./load-env";

import { connectDb, mongoose, withTransaction } from "./connect";
import { SalesInvoice, StockMovement } from "./models";
import { reverseMovements } from "@/lib/ledger";
import { getItemStock } from "@/lib/queries/stock";

async function negativeCount() {
  const rows = await getItemStock();
  return rows.filter(
    (r) => r.plantQty < 0 || r.byLocation.some((l) => l.qty < 0),
  ).length;
}

async function main() {
  await connectDb();
  console.log(`Connected to ${mongoose.connection.name}\n`);

  const before = await negativeCount();
  console.log(`• Items with a negative balance somewhere, before: ${before}`);

  const invoiceIds = await StockMovement.distinct("docId", {
    docType: "sales_invoice",
    isReversal: false,
  });

  console.log(`• Sales invoices with a stock effect on record: ${invoiceIds.length}\n`);

  let corrected = 0;
  let skipped = 0;

  for (const docId of invoiceIds) {
    const invoice = await SalesInvoice.findById(docId).select("invoiceNo").lean();
    const label = invoice?.invoiceNo ?? docId.toString();

    const reversedCount = await withTransaction((session) =>
      reverseMovements(
        { docType: "sales_invoice", docId },
        new Date(),
        "Corrected: sales invoices are money-only job-work bills and must not move stock",
        session,
      ),
    );

    if (reversedCount > 0) {
      console.log(`• Corrected ${label} — ${reversedCount} rows reversed`);
      corrected += 1;
    } else {
      console.log(`• ${label} already clean — skipped`);
      skipped += 1;
    }
  }

  const after = await negativeCount();

  console.log(`\nDone. ${corrected} invoices corrected, ${skipped} already clean.`);
  console.log(`• Items with a negative balance somewhere, after: ${after}`);
  console.log("\nThe invoices themselves are untouched — only their stock effect was reversed.");
  console.log("Any balance still negative is a separate, real data-entry gap (e.g. missing");
  console.log("opening stock) and needs a physical count entered at Stock → New adjustment.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
