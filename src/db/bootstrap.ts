/**
 * Prepares an empty database for first use.
 *
 * This creates no business data — no items, no parties, no documents, no stock.
 * It only makes sure the two structural records exist that the app cannot run
 * without, and that the indexes declared on the schemas are actually built.
 * Everything else is entered through the UI.
 *
 * Run with:  npm run bootstrap
 *            npm run bootstrap -- --reset   (empties every collection first)
 */
import "./load-env";

import { connectDb, mongoose } from "./connect";
import { ensureCompanyProfile, ensurePlantLocation } from "@/lib/setup";

const RESET = process.argv.includes("--reset");

async function main() {
  await connectDb();
  console.log(`Connected to ${mongoose.connection.name}`);

  if (RESET) {
    const collections = await mongoose.connection.db!.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
    console.log(`• Emptied ${collections.length} collections`);
  }

  const plant = await ensurePlantLocation();
  console.log(`• Plant location ready: "${plant.name}"`);

  const company = await ensureCompanyProfile();
  console.log(`• Company profile ready: ${company.name} (${company.gstin})`);

  // Unique constraints on item code, challan number and so on only exist once
  // the indexes are built; on a fresh database that hasn't happened yet.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));
  console.log(`• Indexes built for ${mongoose.modelNames().length} collections`);

  console.log("\nReady. Next steps, in order:");
  console.log("  1. Masters → Company    — check the address, bank details and prefixes");
  console.log("  2. Masters → Items      — the item codes you send out and get back");
  console.log("  3. Masters → Parties    — your job workers and customers");
  console.log("  4. Masters → Routes     — which coated code comes back for each component");
  console.log("  5. Stock → New adjustment — opening balances from a physical count");
  console.log("  6. Outward challans     — then the day-to-day work begins");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
