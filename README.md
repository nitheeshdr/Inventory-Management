# Best Enterprises — Inventory & Job Work

Inventory and job-work management for **BEST ENTERPRISES** (Chinnapanduru,
Tirupati — GSTIN `37ALAPP4700H1ZB`), a job worker who receives components from
principals, processes them (electrolysis, copper plating, painting, powder
coating, stripping, buffing) and returns them.

Hamilton Housewares runs SAP; this is Best Enterprises' own system.

It tracks what customer-owned stock is sitting in the factory, how long it has
been held against the one-year GST deadline, and what to invoice for the work.

## Which way round the books run

| Document | Direction | Effect on stock |
|---|---|---|
| **Inward challan** | the principal's delivery challan arriving with their goods | into our factory |
| **Outward return** | processed pieces and rejections going back | out of our factory |
| **Job-work invoice** | what we bill for the processing (HSN 998898) | **none** — a service, not goods |
| **Supplier bill** | a bill from one of our own suppliers | none |
| **Sales invoice** | goods we own being sold | out of our factory |

The goods never become ours. They arrive under the customer's item code, we
process them, and they leave under whichever code the process route says.

**The app ships with no business data.** Every item code, customer, rate,
opening balance and document is entered by you. Only our own letterhead is
pre-filled. See [First run](#first-run).

Three real documents from the office have been imported as a starting point —
see [Imported documents](#imported-documents).

## Getting started

```bash
cp .env.example .env.local     # then set MONGODB_URI
npm install
npm run bootstrap              # prepares an empty database
npm run dev                    # http://localhost:3000
```

`npm run bootstrap` creates no business data — no items, parties, stock or
documents. It only writes the two configuration records the app can't run
without (the factory location the ledger posts against, and the company profile
that prints on every document) and builds the schema indexes.
`npm run bootstrap:reset` empties every collection first.

## First run

The dashboard shows a setup checklist until there's enough master data to raise a
challan. Work down it in order:

1. **Masters → Company** — pre-filled as BEST ENTERPRISES, GSTIN
   `37ALAPP4700H1ZB`, with the SBI account from your return note. The GSTIN's
   first two digits set your state code, which decides CGST+SGST versus IGST.
2. **Masters → Items** — the codes you receive and the codes you return. Set
   `standard value` per piece: that's the value declared on the challan.
3. **Masters → Customers** — the principals who send you goods. Saving one
   automatically creates its stock location. Hamilton is set up as three
   accounts, one per vendor code.
4. **Masters → Routes** — which code you return for each code received, and the
   rate you charge. This is what prices your invoices. Tick *Confirmed* once
   checked against the rate agreement; checks warn until you do.
5. **Stock → New adjustment** — what is physically in the factory right now.

Then the day-to-day work begins with **Inward challans**.

Entry screens refuse to open until their masters exist, and tell you what's
missing rather than failing on save.

## Imported documents

`npm run import-docs` transcribes three documents the office provided, and the
masters they need (20 item codes, Best Enterprises, 3 process routes):

| Document | Number | Date | Figures |
|---|---|---|---|
| Inward challan (Hamilton's) | `2621500964` | 05.08.2026 | 11 lines · taxable ₹8,55,132.42 · total ₹8,97,889.04 |
| Outward return | `125` (as `GRN/26-27/0001`) | 11-07-2026 | 6 lines · 266 pcs rejected, "BODY DENT (SCRUB)" |
| Job-work invoice | `BE/26-27/0344` | 05-08-2026 | 5 lines · 4,565 pcs · ₹74,836.04 + GST = ₹88,307 |

Run `npm run import-docs -- --undo` to remove all three and their ledger rows.

**Two records in that import are inferred, not transcribed, and both should be
replaced:**

- **`PRE-SYSTEM/2026`** — a stand-in inward challan. Return note 125 is dated a
  month *before* challan 2621500964, and four of its six codes never appear on
  it, so those goods arrived on earlier challans that were never recorded. This
  stand-in gives every returned piece something real to be allocated against.
  Replace it with the actual challan numbers when they're known.
- **`ADJ/26-27/0001`** — a customer-side opening balance, set to exactly what the
  two inward challans bring in so the ledger never goes negative. It is not a
  physical count. Post a real one at Stock → New adjustment.

## Importing the rate workbook

`npm run import-rates` reads `datas/material rate details.xlsx` and loads the
master data from it. It is **additive and idempotent** — it creates whatever is
new and never overwrites an existing record, so re-run it whenever the workbook
grows.

| Sheet | What comes in |
|---|---|
| `note` | Best Enterprises' three vendor codes and their processes |
| `1303807-Vendor code` | 128 electrolysis & copper rates (SAP code → invoice code) |
| `1105306-vendor code Stripping` | 89 stripping rates (coloured code → buffing body) |
| `1309486-vendor foc` | 104 FOC materials (list only, no rates) |
| `Return note ` | 180 return-note materials (list only) |
| `1105306-vendor code colur dis` | **empty sheet** — rates read from `datas/colour-rates.csv` instead |

Result: 297 items, 3 customer accounts (Hamilton's vendor codes), 229 process routes.

Each vendor code becomes its own customer account with its own stock location,
so electrolysis work and painting work stay separate balances even though it is
one customer on one GSTIN.

`npm run import-rates -- --undo` removes the three customer accounts, their
locations and routes, and any item that has never moved. Pass
`-- --file "path/to/other.xlsx"` to read a different workbook.

Three things the workbook does not contain, so they stay blank:

- **Painting & powder rates.** `1105306-vendor code colur dis` has 106 rows and
  636 cells, every one of them a style with no content — no `<v>`, no inline
  string, no formula. Twelve of those rate lines were read before the sheet was
  cleared and now live in `datas/colour-rates.csv`; the importer uses that file
  whenever the sheet is empty. Add the remaining lines there, or restore the
  sheet and re-run — **the sheet always takes priority over the CSV**.
- **HSN codes and material values.** The sheet carries job-work rates only. Set
  HSN and standard value in Masters → Items.
- **Eight descriptions.** Codes `80082496`, `80082588`–`80082594` have blank
  description cells on the stripping sheet, so they show their code instead.

Every imported rate is marked **unconfirmed**. Bill checks warn until each is
ticked in Masters → Process routes.

**Same-code routes are allowed.** 47 of the electrolysis lines charge a rate
without changing the part number (buffing bodies go out and come back as the
same code), so a route no longer has to change the item code.

## How the data model works

Everything on screen is derived from one append-only collection,
`stock_movements`. There is no cached `qtyOnHand` field anywhere, because a
cached total is a total that eventually drifts.

Each customer gets their own **location**, which is what turns "still in our
factory" into a real balance instead of a report calculation.

| Document | What it does to stock |
|---|---|
| Job-work challan (outward) | Moves the component out of the plant and into the job worker's location |
| Return note / GRN (inward) | Consumes the input code at the vendor; brings the processed code into the plant. Rejections come back under the original code |
| Job-work bill (inward invoice) | **Nothing.** A bill is money, not stock |
| Sales invoice (outward) | Moves finished goods out of the plant |
| Stock adjustment | Opening balances and physical-count corrections |

**Item codes change through the process.** A component goes out under one code
and comes back coated under another. A **process route** links the two and
records the agreed per-piece rate.

Every returned quantity is **allocated against the exact challan line it went out
on**. That allocation is what makes "pending with the vendor" and the one-year
deadline trustworthy, and it's enforced — a return can never exceed what's still
with the vendor.

Cancelling any document posts **reversing** ledger rows rather than deleting the
originals, so history stays auditable.

## Editing a saved document

Saving an edit re-posts that document's ledger rows to match the new lines. A
cancelled document can't be edited or re-posted. Reducing a challan line below
what has already been returned against it is refused.

## Money

Amounts are computed in **integer paise**. Binary floats can't hold values like
`1829.295`, and rounding one the wrong way throws a printed invoice off by paise.
CGST and SGST are each computed on half the rate rather than by halving a rounded
total, which is what vendor billing software does.

Checked against the two priced documents above: the challan (₹8,55,132.42
taxable / ₹8,97,889.04 total) and the bill (CGST and SGST ₹6,735.25 each /
₹88,307 grand total). Both reconcile to the paisa, and those figures are locked
in as regression tests in `src/lib/gst.test.ts`.

## Document numbering

Return notes, sales invoices and adjustments are numbered `PREFIX/FY/NNNN`
(`GRN/26-27/0007`), derived from the highest existing number rather than a
counter document, so restoring a backup can't leave the counter behind. Prefixes
are set in Masters → Company.

**Challan numbers are manual** — they come from the customer's own system and
are typed in exactly as printed on their delivery challan.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run bootstrap` | Prepare an empty database (add `-- --reset` to wipe first) |
| `npm run import-docs` | Import the three provided documents (add `-- --undo` to remove) |
| `npm run import-rates` | Import the material-rate workbook (add `-- --undo` to remove) |
| `npm test` | Ledger, allocation, GST and formatting tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Transactions

Multi-document writes run inside a Mongo transaction when the deployment is a
replica set (Atlas, or local `mongod --replSet`). On a plain standalone `mongod`
the app detects this once and falls back to sequential writes, so it runs either
way — ledger posting is idempotent per document, so a partial failure can be
re-run safely.

## What the principal does, and we don't

- **ITC-04** is filed by the principal. `Reports → ITC-04 for customer` produces
  the figures they need each quarter; nothing is filed from here.
- **The inward challan** is their document. We record it and reference its number
  — there is no print view for it. We print our own return note and invoices.
- **Bill verification** (billed qty vs goods received, billed rate vs agreed
  rate) is a principal's tool for auditing a job worker. `Supplier bills` is now
  a plain register for bills from our own suppliers, with no such checking.

## Not built yet

- **Photo OCR intake.** Entry forms accept an initial-values object, so a later
  `/api/extract` route can drop a photographed challan straight into an unsaved,
  editable draft. No model provider chosen yet.
- **E-invoicing / e-way bill APIs.** IRN and ACK numbers are recorded as typed,
  not generated.
- **Login.** Single user, as specified.
