/**
 * Imports the master data in `datas/material rate details.xlsx`.
 *
 * The workbook holds Best Enterprises' three vendor accounts, the materials
 * that move under each, and the agreed per-piece rate for every conversion:
 *
 *   note                          the three vendor codes and their processes
 *   1303807-Vendor code           electrolysis & copper: SAP code → invoice code + rate
 *   1105306-vendor code Stripping stripping: coloured code → buffing body + rate
 *   1309486-vendor foc            FOC materials (list only, no rates)
 *   Return note                   materials that come back on return notes (list only)
 *
 * The sheet `1105306-vendor code colur dis` (painting & powder) contains 636
 * formatted-but-empty cells and no values at all, so those rates are read from
 * `datas/colour-rates.csv` instead. If the sheet ever comes back, it wins.
 *
 * Additive and idempotent — it creates whatever is new and never overwrites an
 * existing record, so it is safe to re-run whenever the workbook grows.
 *
 * Run with:  npm run import-rates
 *            npm run import-rates -- --undo
 *            npm run import-rates -- --file "path/to/other.xlsx"
 */
import "./load-env";

import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { connectDb, mongoose } from "./connect";
import { Item, Location, Party, ProcessRoute, StockMovement } from "./models";
import { ensureCompanyProfile, ensurePlantLocation } from "@/lib/setup";
import type { ItemType } from "@/lib/constants";

const args = process.argv.slice(2);
const UNDO = args.includes("--undo");
const fileArg = args.indexOf("--file");
const FILE =
  fileArg >= 0 && args[fileArg + 1] ? args[fileArg + 1] : "datas/material rate details.xlsx";
/** Hand-maintained painting rates, used only when the workbook sheet is empty. */
const COLOUR_CSV = "datas/colour-rates.csv";

/** Best Enterprises' letterhead, from their printed invoice. */
const VENDOR = {
  name: "BEST ENTERPRISES",
  gstin: "37ALAPP4700H1ZB",
  addressLines: [
    "PLOT NO. UDL-2A/2, S.NO. 112-1",
    "APIIC CHINNAPANDURU, VARADAIAHPALEM",
    "TIRUPATI 517541",
  ],
  state: "Andhra Pradesh",
  stateCode: "37",
  phone: "9913775149",
};

type Row = (string | number | null)[];

function sheetRows(wb: XLSX.WorkBook, name: string): Row[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, blankrows: false, defval: null });
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const code = (v: unknown) => text(v).replace(/\.0$/, "");
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface RoutePair {
  inputCode: string;
  inputDesc: string;
  outputCode: string;
  outputDesc: string;
  rate: number;
}

/**
 * Reads a two-sided sheet. Merged cells leave continuation rows blank, so the
 * side that carries the grouping is forward-filled down the block.
 */
function readPairs(
  rows: Row[],
  opts: {
    inCode: number;
    inDesc: number;
    outCode: number;
    outDesc: number;
    rate: number;
    /** Which side is merged: the input block, or the output + rate block. */
    fill: "input" | "output";
  },
): RoutePair[] {
  const pairs: RoutePair[] = [];
  let heldIn: { code: string; desc: string } | null = null;
  let heldOut: { code: string; desc: string; rate: number | null } | null = null;

  for (const row of rows.slice(2)) {
    const ic = code(row[opts.inCode]);
    const oc = code(row[opts.outCode]);
    const rate = num(row[opts.rate]);

    if (opts.fill === "input") {
      if (ic) heldIn = { code: ic, desc: text(row[opts.inDesc]) };
      if (!oc) continue;
      if (!heldIn || rate === null) continue;
      pairs.push({
        inputCode: heldIn.code,
        inputDesc: heldIn.desc,
        outputCode: oc,
        outputDesc: text(row[opts.outDesc]),
        rate,
      });
    } else {
      if (oc) heldOut = { code: oc, desc: text(row[opts.outDesc]), rate };
      if (!ic) continue;
      if (!heldOut || heldOut.rate === null) continue;
      pairs.push({
        inputCode: ic,
        inputDesc: text(row[opts.inDesc]),
        outputCode: heldOut.code,
        outputDesc: heldOut.desc,
        rate: heldOut.rate,
      });
    }
  }

  return pairs;
}

/**
 * Fallback for the painting & powder rates.
 *
 * The `colur dis` sheet is empty in the workbook, so the rates are kept in a
 * plain CSV alongside it that the office can extend by hand. Read only when that
 * sheet has nothing in it — the sheet always wins if it comes back.
 */
function readColourCsv(path: string): RoutePair[] {
  if (!existsSync(path)) return [];

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",").map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 5 && /^\d+$/.test(cells[0]) && /^\d+$/.test(cells[2]))
    .map((cells) => ({
      inputCode: cells[0],
      inputDesc: cells[1],
      outputCode: cells[2],
      outputDesc: cells[3],
      rate: Number(cells[4]),
    }))
    .filter((pair) => Number.isFinite(pair.rate));
}

/** Plain two-column material lists. */
function readList(rows: Row[]): { code: string; desc: string }[] {
  return rows
    .slice(2)
    .map((row) => ({ code: code(row[1]), desc: text(row[2]) }))
    .filter((row) => row.code && /^\d+$/.test(row.code));
}

async function undo() {
  const parties = await Party.find({ code: { $in: ["1303807", "1105306", "1309486"] } }).lean();
  const partyIds = parties.map((p) => p._id);

  const routes = await ProcessRoute.deleteMany({ partyId: { $in: partyIds } });
  await Location.deleteMany({ partyId: { $in: partyIds } });
  await Party.deleteMany({ _id: { $in: partyIds } });

  // Only remove items that have never moved — anything with ledger history stays.
  const used = await StockMovement.distinct("itemId");
  const items = await Item.deleteMany({ _id: { $nin: used } });

  console.log(`• Removed ${parties.length} vendor accounts and their stock locations`);
  console.log(`• Removed ${routes.deletedCount} process routes`);
  console.log(`• Removed ${items.deletedCount} items that had no stock movements`);
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
  await ensurePlantLocation();

  const wb = XLSX.readFile(FILE);
  console.log(`Reading ${FILE}`);
  console.log(`Sheets: ${wb.SheetNames.map((n) => `"${n}"`).join(", ")}\n`);

  /* ------------------------------------------------ vendor codes (note) */

  const noteRows = sheetRows(wb, "note");
  const vendors = noteRows
    .map((row) => ({ code: code(row[1]), process: text(row[2]) }))
    .filter((v) => /^\d+$/.test(v.code));

  if (vendors.length === 0) {
    throw new Error("No vendor codes found on the 'note' sheet.");
  }

  /* ------------------------------------------------------------- sheets */

  const electro = readPairs(sheetRows(wb, "1303807-Vendor code"), {
    inCode: 1,
    inDesc: 2,
    outCode: 3,
    outDesc: 4,
    rate: 5,
    fill: "input",
  });

  // Stripping runs the other way: the coloured code goes out on the challan and
  // the bare buffing body comes back, with one rate for the whole colour group.
  const stripping = readPairs(sheetRows(wb, "1105306-vendor code Stripping"), {
    inCode: 1,
    inDesc: 2,
    outCode: 3,
    outDesc: 4,
    rate: 5,
    fill: "output",
  });

  const focList = readList(sheetRows(wb, "1309486-vendor foc"));
  const returnList = readList(sheetRows(wb, "Return note "));

    // The sheet first, the CSV only if the sheet is empty.
  const colourSheet = readPairs(sheetRows(wb, "1105306-vendor code colur dis"), {
    inCode: 1,
    inDesc: 2,
    outCode: 3,
    outDesc: 4,
    rate: 5,
    fill: "input",
  });
  const colourCsv = colourSheet.length === 0 ? readColourCsv(COLOUR_CSV) : [];
  const colour = colourSheet.length > 0 ? colourSheet : colourCsv;

  console.log(`• 1303807 electrolysis & copper : ${electro.length} rate lines`);
  console.log(`• 1105306 stripping             : ${stripping.length} rate lines`);
  console.log(`• 1309486 FOC materials         : ${focList.length}`);
  console.log(`• Return-note materials         : ${returnList.length}`);
  console.log(
    colourSheet.length > 0
      ? `• 1105306 painting & powder     : ${colourSheet.length} rate lines`
      : `• 1105306 painting & powder     : sheet is empty — using ${colourCsv.length} lines from ${COLOUR_CSV}`,
  );

  /* -------------------------------------------------------------- items */

  const descriptions = new Map<string, string>();
  const outputCodes = new Set<string>();

  const remember = (c: string, d: string) => {
    if (!c) return;
    if (!descriptions.has(c) || (!descriptions.get(c) && d)) descriptions.set(c, d);
  };

  for (const pair of [...electro, ...stripping, ...colour]) {
    remember(pair.inputCode, pair.inputDesc);
    remember(pair.outputCode, pair.outputDesc);
    outputCodes.add(pair.outputCode);
  }
  for (const row of [...focList, ...returnList]) remember(row.code, row.desc);

  const itemOps = [...descriptions.entries()].map(([itemCode, description]) => ({
    updateOne: {
      filter: { itemCode },
      update: {
        $setOnInsert: {
          itemCode,
          description: description || itemCode,
          // The workbook carries no HSN and no material value — only job-work
          // rates, which belong on the routes below.
          hsnCode: "",
          uom: "PC",
          itemType: (outputCodes.has(itemCode) ? "processed" : "component") as ItemType,
          standardValue: 0,
          gstRate: 18,
        },
      },
      upsert: true,
    },
  }));

  const itemsBefore = await Item.countDocuments();
  await Item.bulkWrite(itemOps);
  const itemsAfter = await Item.countDocuments();

  const items = await Item.find({ itemCode: { $in: [...descriptions.keys()] } })
    .select("itemCode")
    .lean();
  const idByCode = new Map(items.map((i) => [i.itemCode, i._id]));

  console.log(
    `\n• Items: ${itemsAfter - itemsBefore} created, ${descriptions.size - (itemsAfter - itemsBefore)} already existed (${itemsAfter} total)`,
  );

  /* ----------------------------------------------------- vendor accounts */

  const partyByVendor = new Map<string, mongoose.Types.ObjectId>();

  for (const vendor of vendors) {
    const party = await Party.findOneAndUpdate(
      { code: vendor.code },
      {
        $setOnInsert: {
          code: vendor.code,
          // One legal entity, three vendor accounts — each keeps its own stock
          // location so "at electrolysis" and "at painting" stay separate.
          name: `${VENDOR.name} — ${vendor.process}`,
          partyType: "job_worker",
          gstin: VENDOR.gstin,
          addressLines: VENDOR.addressLines,
          state: VENDOR.state,
          stateCode: VENDOR.stateCode,
          phone: VENDOR.phone,
          notes: `Vendor code ${vendor.code} · ${vendor.process}`,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    await Location.findOneAndUpdate(
      { partyId: party!._id },
      {
        $setOnInsert: {
          name: `At ${party!.name}`,
          kind: "job_worker",
          partyId: party!._id,
        },
      },
      { upsert: true },
    );

    partyByVendor.set(vendor.code, party!._id);
    console.log(`• Vendor ${vendor.code} — ${vendor.process}`);
  }

  /* ------------------------------------------------------ process routes */

  async function importRoutes(pairs: RoutePair[], vendorCode: string, processName: string) {
    const partyId = partyByVendor.get(vendorCode);
    if (!partyId) return { created: 0, skipped: pairs.length };

    let created = 0;
    let skipped = 0;

    for (const pair of pairs) {
      const inputItemId = idByCode.get(pair.inputCode);
      const outputItemId = idByCode.get(pair.outputCode);

      // Same-code routes are legitimate: buffing and similar operations charge a
      // rate without changing the part number.
      if (!inputItemId || !outputItemId) {
        skipped += 1;
        continue;
      }

      const result = await ProcessRoute.updateOne(
        { inputItemId, outputItemId, partyId },
        {
          $setOnInsert: {
            inputItemId,
            outputItemId,
            partyId,
            processName,
            jobRate: pair.rate,
            effectiveFrom: new Date("2026-04-01"),
            // Rates come from the workbook, not from a signed agreement, so the
            // office confirms each one before bill checks rely on it.
            isConfirmed: false,
            notes: `Imported from "${FILE}" (vendor ${vendorCode}).`,
          },
        },
        { upsert: true },
      );

      if (result.upsertedCount) created += 1;
    }

    return { created, skipped };
  }

  const electroResult = await importRoutes(electro, "1303807", "Electrolysis & copper");
  const strippingResult = await importRoutes(stripping, "1105306", "Stripping");
  const colourResult = await importRoutes(colour, "1105306", "Painting & powder");

  console.log(
    `\n• Electrolysis & copper routes: ${electroResult.created} created${electroResult.skipped ? `, ${electroResult.skipped} skipped` : ""}`,
  );
  console.log(
    `• Stripping routes            : ${strippingResult.created} created${strippingResult.skipped ? `, ${strippingResult.skipped} skipped` : ""}`,
  );
  console.log(
    `• Painting & powder routes    : ${colourResult.created} created${colourResult.skipped ? `, ${colourResult.skipped} skipped` : ""}`,
  );

  const totalRoutes = await ProcessRoute.countDocuments();
  console.log(`• ${totalRoutes} process routes in total, all unconfirmed`);

  console.log("\nDone. Worth knowing:");
  if (colourSheet.length === 0) {
    console.log(`  · The "colur dis" sheet is empty, so ${colour.length} painting rates came`);
    console.log(`    from ${COLOUR_CSV}. Add the rest there, or restore the sheet`);
    console.log("    and re-run — the sheet always takes priority over the CSV.");
  }
  console.log("  · Every rate imported is marked unconfirmed. Tick each one in");
  console.log("    Masters → Process routes once checked against the rate agreement.");
  console.log("  · Items carry no HSN code or material value yet — set them in Masters → Items.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
