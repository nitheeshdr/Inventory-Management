/**
 * Imports the three real documents the office provided, plus the masters they
 * depend on:
 *
 *   1. Job-work challan  2621500964   05.08.2026   Hamilton → Best Enterprises
 *   2. Job-work bill     BE/26-27/0344 05-08-2026  Best Enterprises → Hamilton
 *   3. Return note       125          11-07-2026   Best Enterprises → Hamilton
 *
 * Everything here is transcribed from the paperwork. Two things are *not* on the
 * paper and are marked as such wherever they appear:
 *
 *   - Opening stock. Real plant balances are unknown, so opening quantities are
 *     set to exactly what these documents consume. Replace them with a physical
 *     count (Stock → New adjustment).
 *   - A "pre-system" challan. Return note 125 is dated 11-07-2026, a month
 *     *before* challan 2621500964, and four of its six codes never appear on it.
 *     Those goods went out on earlier challans that were never entered. Rather
 *     than drop the data or misdate it, one challan numbered PRE-SYSTEM/2026
 *     stands in for those earlier consignments so every returned piece is
 *     allocated to something real.
 *
 * Run with:  npm run import-docs
 *            npm run import-docs -- --undo   (removes everything it created)
 */
import "./load-env";

import { Types } from "mongoose";
import { connectDb, mongoose } from "./connect";
import {
  Grn,
  Item,
  JobWorkChallan,
  Location,
  Party,
  ProcessRoute,
  SalesInvoice,
  StockAdjustment,
  StockMovement,
} from "./models";
import { postMovements } from "@/lib/ledger";
import { ensureCompanyProfile, ensurePlantLocation } from "@/lib/setup";
import { addYears, amountInWords, round2, round3 } from "@/lib/format";
import { lineTaxable, roundOffDelta, splitTax } from "@/lib/gst";
import { SERVICE_GST_RATE, SERVICE_HSN } from "@/lib/constants";
import type { ItemType } from "@/lib/constants";

const UNDO = process.argv.includes("--undo");

const CHALLAN_NO = "2621500964";
const LEGACY_CHALLAN_NO = "PRE-SYSTEM/2026";
const GRN_NO = "GRN/26-27/0001";
const BILL_NO = "BE/26-27/0344";
const OPENING_ADJ_NO = "ADJ/26-27/0001";

/* ----------------------------------------------------------------- masters */

type SeedItem = {
  code: string;
  description: string;
  hsn: string;
  type: ItemType;
  value: number;
};

/** The 11 lines of challan 2621500964, with the rates printed on it. */
const CHALLAN_LINES: { code: string; qty: number; rate: number }[] = [
  { code: "80029903", qty: 2100, rate: 54.26 },
  { code: "80078503", qty: 1908, rate: 211.65 },
  { code: "80078506", qty: 840, rate: 74.31 },
  { code: "80048606", qty: 470, rate: 61.39 },
  { code: "80048391", qty: 1440, rate: 34.37 },
  { code: "80046601", qty: 168, rate: 90.87 },
  { code: "80046293", qty: 368, rate: 93.97 },
  { code: "80043912", qty: 68, rate: 91.45 },
  { code: "80042400", qty: 840, rate: 53.71 },
  { code: "80039010", qty: 750, rate: 45.6 },
  { code: "80036609", qty: 960, rate: 63.76 },
];

/** The 6 lines of return note 125 — all rejections, "BODY DENT (SCRUB)". */
const RETURN_LINES: { code: string; qty: number }[] = [
  { code: "80046317", qty: 147 },
  { code: "80078506", qty: 50 },
  { code: "80037504", qty: 2 },
  { code: "80046305", qty: 59 },
  { code: "80046293", qty: 7 },
  { code: "80045595", qty: 1 },
];

/** The 5 lines of bill BE/26-27/0344 — job-work charges, HSN 998898 @ 18%. */
const BILL_LINES: { code: string; qty: number; rate: number }[] = [
  { code: "80045466", qty: 1980, rate: 13.01 },
  { code: "80078908", qty: 1378, rate: 14.75 },
  { code: "80065577", qty: 848, rate: 23.82 },
  { code: "80065570", qty: 194, rate: 23.82 },
  { code: "80065580", qty: 165, rate: 23.82 },
];

const ITEMS: SeedItem[] = [
  // Components on challan 2621500964, valued at the rates it declares.
  { code: "80029903", description: "AQUA SS ASSEMBLE BODY 1000 ML", hsn: "73239990", type: "component", value: 54.26 },
  { code: "80078503", description: "MALMO 1200 ML VACCUM# BODY", hsn: "73239390", type: "component", value: 211.65 },
  { code: "80078506", description: "MALMO 1200 ML INNER BOTTLE ASSEMBLY", hsn: "73239390", type: "component", value: 74.31 },
  { code: "80048606", description: "CARAFE 1000ML INNER BODY ASSEMBLY", hsn: "73239390", type: "component", value: 61.39 },
  { code: "80048391", description: "ELFIN 160ML INNER BODY ASSEMBLY", hsn: "73239390", type: "component", value: 34.37 },
  { code: "80046601", description: "CARAFE 2000ML INNER BODY ASSEMBLY", hsn: "73239390", type: "component", value: 90.87 },
  { code: "80046293", description: "DUO DLX 1500 ML INNER BOTTLE ASSEMBLY", hsn: "73239390", type: "component", value: 93.97 },
  { code: "80043912", description: "THREADED JAR 2000ML ASSEMBLY BODY", hsn: "73239390", type: "component", value: 91.45 },
  { code: "80042400", description: "SHINE SS ASSEMBLE BODY 1000 ML J4", hsn: "73239390", type: "component", value: 53.71 },
  { code: "80039010", description: "BULLET 500ML FLIP LID INNER ASSEMBLY", hsn: "73239390", type: "component", value: 45.6 },
  { code: "80036609", description: "BULLET 1000 ML INNER BOTTLE ASSEMBLY", hsn: "73239390", type: "component", value: 63.76 },

  // Components that appear only on return note 125 — no rate is printed there,
  // so their standard value stays 0 until the office sets it.
  { code: "80046317", description: "DUO DLX 2000 ML INNER ASSLY", hsn: "73239390", type: "component", value: 0 },
  { code: "80037504", description: "BULLET 750 ML INNER BOTTLE", hsn: "73239390", type: "component", value: 0 },
  { code: "80046305", description: "DUO DLX 1800 ML INNER ASSLY", hsn: "73239390", type: "component", value: 0 },
  { code: "80045595", description: "BULLET 350 ML INNER BOTTLE ASSLY", hsn: "73239390", type: "component", value: 0 },

  // Coated codes billed on BE/26-27/0344.
  { code: "80045466", description: "SHINE 800ML MAT RED", hsn: "73239390", type: "processed", value: 0 },
  { code: "80078908", description: "MALMO 1200ML PINK POWDER", hsn: "73239390", type: "processed", value: 0 },
  { code: "80065577", description: "ELFIN 300 ML PECH", hsn: "73239390", type: "processed", value: 0 },
  { code: "80065570", description: "ELFIN 500 ML BODY PECH", hsn: "73239390", type: "processed", value: 0 },
  { code: "80065580", description: "ELFIN 160 ML BODY PECH", hsn: "73239390", type: "processed", value: 0 },
];

/**
 * Input → output pairings inferred by matching volume between the challan and
 * the bill. All start unconfirmed: the office must verify each against the
 * vendor's rate agreement before the bill check means anything.
 */
const ROUTES: { input: string; output: string; process: string; rate: number; note: string }[] = [
  {
    input: "80078506",
    output: "80078908",
    process: "Powder coat – Pink",
    rate: 14.75,
    note: "Volumes match (1200 ML). Rate from BE/26-27/0344 line 2.",
  },
  {
    input: "80048391",
    output: "80065580",
    process: "Coating – Peach",
    rate: 23.82,
    note: "Volumes match (160 ML). Rate from BE/26-27/0344 line 5.",
  },
  {
    input: "80042400",
    output: "80045466",
    process: "Coating – Mat Red",
    rate: 13.01,
    note: "UNVERIFIED: challan input is 1000 ML but the billed output is 800 ML. Confirm the correct input code.",
  },
];

async function undo() {
  const challans = await JobWorkChallan.find({
    challanNo: { $in: [CHALLAN_NO, LEGACY_CHALLAN_NO] },
  }).lean();
  const grns = await Grn.find({ grnNo: GRN_NO }).lean();
  const adjustments = await StockAdjustment.find({ adjustmentNo: OPENING_ADJ_NO }).lean();

  const docIds = [...challans, ...grns, ...adjustments].map((d) => d._id);
  const { deletedCount } = await StockMovement.deleteMany({ docId: { $in: docIds } });

  await JobWorkChallan.deleteMany({ challanNo: { $in: [CHALLAN_NO, LEGACY_CHALLAN_NO] } });
  await Grn.deleteMany({ grnNo: GRN_NO });
  await SalesInvoice.deleteMany({ invoiceNo: BILL_NO });
  await StockAdjustment.deleteMany({ adjustmentNo: OPENING_ADJ_NO });

  console.log(`• Removed 3 documents, the opening adjustment and ${deletedCount} ledger rows`);
  console.log("  (items, the party and the routes were left in place)");
}

async function main() {
  await connectDb();
  console.log(`Connected to ${mongoose.connection.name}\n`);

  if (UNDO) {
    await undo();
    await mongoose.disconnect();
    return;
  }

  await ensureCompanyProfile();
  const plant = await ensurePlantLocation();

  /* --------------------------------------------------------------- items */

  await Item.bulkWrite(
    ITEMS.map((item) => ({
      updateOne: {
        filter: { itemCode: item.code },
        update: {
          $setOnInsert: {
            itemCode: item.code,
            description: item.description,
            hsnCode: item.hsn,
            itemType: item.type,
            standardValue: item.value,
            uom: "PC",
            gstRate: 18,
          },
        },
        upsert: true,
      },
    })),
  );

  const items = await Item.find({ itemCode: { $in: ITEMS.map((i) => i.code) } }).lean();
  const byCode = new Map(items.map((i) => [i.itemCode, i]));
  console.log(`• ${items.length} item codes ready`);

  /* -------------------------------------------------- Best Enterprises */

  // Reuse the vendor account the rate workbook created rather than adding a
  // second Best Enterprises. These documents are coating work, which is vendor
  // 1105306 (painting & powder). Falls back to creating "BE" on a database that
  // has not had the rate workbook imported.
  const best =
    (await Party.findOne({ code: "1105306", partyType: "customer" })) ??
    (await Party.findOne({ gstin: "37AABCD1683Q3Z3", partyType: "customer" })) ??
    (await Party.findOneAndUpdate(
      { code: "BE" },
      {
        $setOnInsert: {
          code: "BE",
          name: "BEST ENTERPRISES",
          partyType: "job_worker",
          gstin: "37ALAPP4700H1ZB",
          addressLines: [
            "PLOT NO. UDL-2A/2, S.NO. 112-1",
            "APIIC CHINNAPANDURU, VARADAIAHPALEM",
            "TIRUPATI 517541",
          ],
          state: "Andhra Pradesh",
          stateCode: "37",
          phone: "9913775149",
        },
      },
      { upsert: true, returnDocument: "after" },
    ));

  const customerLocation = await Location.findOneAndUpdate(
    { partyId: best!._id },
    { $setOnInsert: { name: `At ${best!.name}`, kind: "job_worker", partyId: best!._id } },
    { upsert: true, returnDocument: "after" },
  );
  console.log(`• Job worker ready: ${best!.name} (${best!.gstin})`);

  /* -------------------------------------------------------------- routes */

  for (const route of ROUTES) {
    const input = byCode.get(route.input);
    const output = byCode.get(route.output);
    if (!input || !output) continue;

    await ProcessRoute.findOneAndUpdate(
      { inputItemId: input._id, outputItemId: output._id, partyId: best!._id },
      {
        $setOnInsert: {
          inputItemId: input._id,
          outputItemId: output._id,
          partyId: best!._id,
          processName: route.process,
          jobRate: route.rate,
          effectiveFrom: new Date("2026-04-01"),
          isConfirmed: false,
          notes: route.note,
        },
      },
      { upsert: true },
    );
  }
  console.log(`• ${ROUTES.length} process routes ready (all unconfirmed)`);

  /* ------------------------------------------------------- opening stock */

  if (!(await StockAdjustment.findOne({ adjustmentNo: OPENING_ADJ_NO }))) {
    // Exactly what the two challans below consume — no more, no less, so the
    // ledger never goes negative and no quantity is invented.
    const needed = new Map<string, number>();
    for (const line of CHALLAN_LINES) {
      needed.set(line.code, (needed.get(line.code) ?? 0) + line.qty);
    }
    for (const line of RETURN_LINES) {
      needed.set(line.code, (needed.get(line.code) ?? 0) + line.qty);
    }

    const lines = [...needed.entries()].map(([code, qty]) => {
      const item = byCode.get(code)!;
      return {
        _id: new Types.ObjectId(),
        itemId: item._id,
        itemCode: item.itemCode,
        description: item.description,
        qty,
        uom: "PC",
        remark: "Derived from the imported documents — replace with a physical count",
      };
    });

    const adjustment = await StockAdjustment.create({
      adjustmentNo: OPENING_ADJ_NO,
      adjustmentDate: new Date("2026-06-30"),
      locationId: customerLocation!._id,
      reason: "Opening balance",
      notes:
        "Customer-side opening balance, set to exactly what the two inward challans bring in. Not a physical count.",
      lines,
      status: "open",
    });

    await postMovements(
      {
        docType: "stock_adjustment",
        docId: adjustment._id,
        docNo: adjustment.adjustmentNo,
        movementDate: adjustment.adjustmentDate,
      },
      lines.map((line) => ({
        itemId: line.itemId,
        locationId: customerLocation!._id,
        qty: line.qty,
        docLineId: line._id,
        remark: "Held by the customer before despatch to us",
      })),
    );

    console.log(`• Opening stock posted for ${lines.length} items`);
  }

  /* ------------------------------- helper for writing a challan + ledger */

  async function createChallan(opts: {
    challanNo: string;
    date: Date;
    lines: { code: string; qty: number; rate: number }[];
    taxRate: number;
    vehicleNo?: string;
    transportPo?: string;
    natureOfProcess?: string;
    notes?: string;
  }) {
    const existing = await JobWorkChallan.findOne({ challanNo: opts.challanNo });
    if (existing) return existing;

    const lines = opts.lines.map((line, index) => {
      const item = byCode.get(line.code)!;
      return {
        _id: new Types.ObjectId(),
        srNo: index + 1,
        itemId: item._id,
        itemCode: item.itemCode,
        description: item.description,
        hsnCode: item.hsnCode,
        qty: line.qty,
        uom: "PC",
        rate: line.rate,
        taxableValue: lineTaxable(line.qty, line.rate),
      };
    });

    const totalTaxable = round2(lines.reduce((total, line) => total + line.taxableValue, 0));
    const tax = splitTax(totalTaxable, opts.taxRate, false);

    const challan = await JobWorkChallan.create({
      challanNo: opts.challanNo,
      challanDate: opts.date,
      partyId: best!._id,
      fromLocationId: customerLocation!._id,
      toLocationId: plant._id,
      vehicleNo: opts.vehicleNo,
      transportPo: opts.transportPo,
      natureOfProcess: opts.natureOfProcess,
      lines,
      totalTaxable,
      cgstRate: opts.taxRate / 2,
      cgstAmount: tax.cgstAmount,
      sgstRate: opts.taxRate / 2,
      sgstAmount: tax.sgstAmount,
      igstRate: 0,
      igstAmount: 0,
      totalValue: round2(totalTaxable + tax.totalTax),
      dueDate: addYears(opts.date, 1),
      status: "open",
      notes: opts.notes,
    });

    await postMovements(
      {
        docType: "job_work_challan",
        docId: challan._id,
        docNo: challan.challanNo,
        movementDate: opts.date,
        partyId: best!._id,
      },
      lines.flatMap((line) => [
        {
          itemId: line.itemId,
          locationId: customerLocation!._id,
          qty: -line.qty,
          docLineId: line._id,
        },
        { itemId: line.itemId, locationId: plant._id, qty: line.qty, docLineId: line._id },
      ]),
    );

    return challan;
  }

  /* ------------------------------- 1. the pre-system challan for RN 125 */

  const legacy = await createChallan({
    challanNo: LEGACY_CHALLAN_NO,
    date: new Date("2026-07-01"),
    // Rate 0: no value was printed for these on any document we have.
    lines: RETURN_LINES.map((line) => ({ code: line.code, qty: line.qty, rate: 0 })),
    taxRate: 0,
    natureOfProcess: "Coating",
    notes:
      "NOT A REAL CHALLAN NUMBER. Stands in for consignments issued before this system was in use, so the six lines of return note 125 have something to be allocated against. Replace with the actual challan numbers when they are known.",
  });
  console.log(`• Pre-system challan ${legacy.challanNo} created (${legacy.lines.length} lines)`);

  /* ---------------------------------------- 2. challan 2621500964 (real) */

  const challan = await createChallan({
    challanNo: CHALLAN_NO,
    date: new Date("2026-08-05"),
    lines: CHALLAN_LINES,
    taxRate: 5,
    vehicleNo: "TN91F4032",
    transportPo: "4951054089",
    natureOfProcess: "Coating / powder coating",
  });
  console.log(
    `• Challan ${challan.challanNo} — ${challan.lines.length} lines, taxable ₹${challan.totalTaxable.toLocaleString("en-IN")}, total ₹${challan.totalValue.toLocaleString("en-IN")}`,
  );

  /* -------------------------------------------- 3. return note 125 (real) */

  if (!(await Grn.findOne({ grnNo: GRN_NO }))) {
    const grnDate = new Date("2026-07-11");

    const lines = RETURN_LINES.map((line, index) => {
      const item = byCode.get(line.code)!;
      const challanLine = legacy.lines.find((l) => l.itemCode === line.code)!;

      return {
        _id: new Types.ObjectId(),
        srNo: index + 1,
        lineKind: "rejected" as const,
        itemId: item._id,
        itemCode: item.itemCode,
        description: item.description,
        qty: line.qty,
        uom: "PC",
        inputItemId: item._id,
        rejectionReason: "BODY DENT (SCRUB)",
        allocations: [
          {
            _id: new Types.ObjectId(),
            challanId: legacy._id,
            challanNo: legacy.challanNo,
            challanLineId: challanLine._id,
            qty: line.qty,
          },
        ],
      };
    });

    const grn = await Grn.create({
      grnNo: GRN_NO,
      vendorDocNo: "125",
      grnDate,
      partyId: best!._id,
      fromLocationId: customerLocation!._id,
      toLocationId: plant._id,
      vehicleNo: "TN 18 AA 7654",
      grNo: "REFER OUR ATTACHMENT",
      transportRemark: "BODY DENT (SCRUB)",
      lines,
      status: "open",
      notes: "Transcribed from Best Enterprises return note no. 125 dated 11-07-2026.",
    });

    await postMovements(
      {
        docType: "grn",
        docId: grn._id,
        docNo: grn.grnNo,
        movementDate: grnDate,
        partyId: best!._id,
      },
      lines.flatMap((line) => [
        {
          itemId: line.itemId,
          locationId: plant._id,
          qty: -line.qty,
          docLineId: line._id,
          remark: "Returned to the customer",
        },
        {
          itemId: line.itemId,
          locationId: customerLocation!._id,
          qty: line.qty,
          docLineId: line._id,
          remark: "rejected — BODY DENT (SCRUB)",
        },
      ]),
    );

    // Everything sent on the pre-system challan came back, so it closes.
    legacy.status = "closed";
    await legacy.save();

    const total = round3(lines.reduce((sum, line) => sum + line.qty, 0));
    console.log(`• Return note 125 — ${lines.length} lines, ${total} pcs rejected`);
  }

  /* ------------------ 4. our job-work invoice BE/26-27/0344 (real) */

  if (!(await SalesInvoice.findOne({ invoiceNo: BILL_NO }))) {
    const lines = BILL_LINES.map((line, index) => {
      const item = byCode.get(line.code)!;
      const taxableAmount = lineTaxable(line.qty, line.rate);
      const tax = splitTax(taxableAmount, SERVICE_GST_RATE, false);

      return {
        _id: new Types.ObjectId(),
        srNo: index + 1,
        itemId: item._id,
        itemCode: item.itemCode,
        description: item.description,
        hsnCode: SERVICE_HSN,
        qty: line.qty,
        uom: "Pcs",
        rate: line.rate,
        discountPct: 0,
        taxableAmount,
        taxPct: SERVICE_GST_RATE,
        cgstAmount: tax.cgstAmount,
        sgstAmount: tax.sgstAmount,
        igstAmount: tax.igstAmount,
        amount: round2(taxableAmount + tax.totalTax),
      };
    });

    const subtotal = round2(lines.reduce((total, line) => total + line.taxableAmount, 0));
    const half = round2(
      lines.reduce(
        (total, line) => total + splitTax(line.taxableAmount, line.taxPct, false).cgstAmount,
        0,
      ),
    );
    const totalTax = round2(half * 2);
    const { roundOff, rounded } = roundOffDelta(round2(subtotal + totalTax));

    const invoice = await SalesInvoice.create({
      invoiceNo: BILL_NO,
      invoiceDate: new Date("2026-08-05"),
      partyId: best!._id,
      locationId: plant._id,
      shipToLines: best!.addressLines,
      poNo: "4500738933",
      vehicleNo: "TN85M5349",
      transport: "REFER OUR ATTACHMENT",
      isInterState: false,
      lines,
      totalQty: round3(lines.reduce((total, line) => total + line.qty, 0)),
      subtotal,
      cgstAmount: half,
      sgstAmount: half,
      igstAmount: 0,
      totalTax,
      roundOff,
      grandTotal: rounded,
      amountInWords: amountInWords(rounded),
      // A job-work invoice bills a service; the goods moved on the return note,
      // so this document deliberately posts nothing to the stock ledger.
      status: "open",
      notes: [
        "ACK 112631802757500 · ACK date 2026-08-05 11:38",
        "IRN c574c23841a30525d44c061f82aaceeb1c481f86da881ed5e76d86b2ea60a9f7",
        "Second PO reference is cut off in the photograph.",
      ].join("\n"),
    });

    console.log(
      `• Job-work invoice ${invoice.invoiceNo} — ${invoice.lines.length} lines, ${invoice.totalQty} pcs, before tax ₹${invoice.subtotal.toLocaleString("en-IN")}, grand total ₹${invoice.grandTotal.toLocaleString("en-IN")}`,
    );
  }

  console.log("\nDone. Two things to fix in the app:");
  console.log(`  · Challan ${LEGACY_CHALLAN_NO} is a stand-in — replace it with the real`);
  console.log("    challan numbers those returned goods went out on.");
  console.log(`  · Opening balance ${OPENING_ADJ_NO} is derived, not counted.`);
  console.log("    Post a real physical count at Stock → New adjustment.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
