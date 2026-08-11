# Sri City Inventory & Job Work

Inventory and job-work management for a plant that sends components out to job
workers for processing, gets them back changed, and pays a per-piece charge.

It tracks where every piece is, how long it has been out against the one-year GST
deadline, and whether the vendor's bill matches what actually came back.

**The app ships with no business data.** Every item code, party, rate, opening
balance and document is entered by you. Only the plant's own letterhead is
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
without (the plant location the ledger posts against, and the company profile
that prints on every document) and builds the schema indexes.
`npm run bootstrap:reset` empties every collection first.

## First run

The dashboard shows a setup checklist until there's enough master data to raise a
challan. Work down it in order:

1. **Masters → Company** — pre-filled from your printed challan
   (HAMILTON HOUSEWARES PVT LTD, GSTIN `37AABCD1683Q3Z3`, Sri City). Check it,
   and add bank details if you want them on sales invoices. The GSTIN's first
   two digits set your state code, which decides CGST+SGST versus IGST.
2. **Masters → Items** — the component codes you send out and the processed codes
   that come back. Set `standard value` per piece: that's the value declared on
   job-work challans.
3. **Masters → Parties** — job workers and customers. Saving a job worker
   automatically creates their stock location.
4. **Masters → Routes** — which processed code comes back for each component, and
   the agreed per-piece rate. This is what makes bill-checking possible. Tick
   *Confirmed* once you've verified a pairing against the vendor's agreement;
   rate checks warn until you do.
5. **Stock → New adjustment** — opening balances from a physical count, so
   balances start from the truth.

Then the day-to-day work begins with **Outward challans**.

Entry screens refuse to open until their masters exist, and tell you what's
missing rather than failing on save.

## Imported documents

`npm run import-docs` transcribes three documents the office provided, and the
masters they need (20 item codes, Best Enterprises, 3 process routes):

| Document | Number | Date | Figures |
|---|---|---|---|
| Job-work challan | `2621500964` | 05.08.2026 | 11 lines · taxable ₹8,55,132.42 · total ₹8,97,889.04 |
| Return note | `125` (as `GRN/26-27/0001`) | 11-07-2026 | 6 lines · 266 pcs rejected, "BODY DENT (SCRUB)" |
| Job-work bill | `BE/26-27/0344` | 05-08-2026 | 5 lines · 4,565 pcs · ₹74,836.04 + GST = ₹88,307 |

Run `npm run import-docs -- --undo` to remove all three and their ledger rows.

**Two records in that import are inferred, not transcribed, and both should be
replaced:**

- **`PRE-SYSTEM/2026`** — a stand-in challan. Return note 125 is dated a month
  *before* challan 2621500964, and four of its six codes never appear on it, so
  those goods went out on earlier challans that were never recorded. This
  stand-in gives every returned piece something real to be allocated against.
  Replace it with the actual challan numbers when they're known.
- **`ADJ/26-27/0001`** — opening stock, set to exactly what the two challans
  consume so the ledger never goes negative. It is not a physical count. Post a
  real one at Stock → New adjustment.

The bill is imported as **flagged**: no return notes exist for the five coated
codes it charges for, because that work predates the system. That is the
verification working, not a defect.

## How the data model works

Everything on screen is derived from one append-only collection,
`stock_movements`. There is no cached `qtyOnHand` field anywhere, because a
cached total is a total that eventually drifts.

Each job worker gets their own **location**, which is what turns "stock lying at
the vendor" into a real balance instead of a report calculation.

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

**Challan numbers are manual** — they come from your existing plant software and
are typed in as printed.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run bootstrap` | Prepare an empty database (add `-- --reset` to wipe first) |
| `npm run import-docs` | Import the three provided documents (add `-- --undo` to remove) |
| `npm test` | Ledger, allocation, GST and formatting tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Transactions

Multi-document writes run inside a Mongo transaction when the deployment is a
replica set (Atlas, or local `mongod --replSet`). On a plain standalone `mongod`
the app detects this once and falls back to sequential writes, so it runs either
way — ledger posting is idempotent per document, so a partial failure can be
re-run safely.

## Not built yet

- **Photo OCR intake.** Entry forms accept an initial-values object, so a later
  `/api/extract` route can drop a photographed challan straight into an unsaved,
  editable draft. No model provider chosen yet.
- **E-invoicing / e-way bill APIs.** IRN and ACK numbers are recorded as typed,
  not generated.
- **Login.** Single user, as specified.
