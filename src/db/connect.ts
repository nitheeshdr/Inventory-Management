import mongoose, { type ClientSession } from "mongoose";

/** Read lazily, never at module scope: ES imports are hoisted, so a script that
 *  loads .env.local would otherwise be too late to be seen here. */
function mongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local and fill in the connection string.",
    );
  }
  return uri;
}

/**
 * Next.js reloads modules on every edit in dev, which would open a new pool each
 * time. Cache the connection promise on globalThis so we keep exactly one.
 */
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  supportsTransactions: boolean | null;
};

const globalForMongoose = globalThis as unknown as { _mongoose?: MongooseCache };

const cache: MongooseCache = (globalForMongoose._mongoose ??= {
  conn: null,
  promise: null,
  supportsTransactions: null,
});

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  cache.promise ??= mongoose
    .connect(mongoUri(), {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
    })
    .then((m) => m);

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }

  // Importing the models registers every schema on the shared connection.
  await import("./models");

  return cache.conn;
}

/**
 * Multi-document transactions need a replica set. Atlas and `mongod --replSet`
 * have one; a plain local `mongod` does not. Probe once, then remember.
 */
async function detectTransactionSupport(): Promise<boolean> {
  if (cache.supportsTransactions !== null) return cache.supportsTransactions;

  try {
    const admin = mongoose.connection.db?.admin();
    const info = await admin?.command({ hello: 1 });
    cache.supportsTransactions = Boolean(info?.setName ?? info?.msg === "isdbgrid");
  } catch {
    cache.supportsTransactions = false;
  }

  return cache.supportsTransactions;
}

/**
 * Runs `fn` inside a transaction when the deployment supports one, and plainly
 * otherwise so the app still works against a standalone mongod. Every writer
 * that uses this must also be safe to re-run — see `postMovements`, which is
 * idempotent per (docType, docId).
 */
export async function withTransaction<T>(
  fn: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  await connectDb();

  if (!(await detectTransactionSupport())) {
    return fn(undefined);
  }

  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

export { mongoose };
