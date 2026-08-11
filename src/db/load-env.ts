/**
 * Loads .env.local for standalone scripts (seed, one-off tooling). Next.js does
 * this itself for the app. Import this module *first* — ES import execution
 * follows declaration order, so anything importing it earlier sees the vars.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });
