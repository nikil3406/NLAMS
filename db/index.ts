import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Drizzle database client.
 *
 * Uses a singleton pattern in development to avoid creating multiple
 * connections during Next.js hot module reloading.
 *
 * The connection is server-side only — it must NEVER be imported
 * from client components or exposed to the browser.
 */

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Create a .env.local file based on .env.example.'
  );
}

// Global singleton to survive HMR in development
const globalForDb = globalThis as typeof globalThis & {
  _nlamsDb: ReturnType<typeof drizzle> | undefined;
  _nlamsClient: ReturnType<typeof postgres> | undefined;
};

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;

if (process.env.NODE_ENV === 'production') {
  client = postgres(DATABASE_URL, { max: 10 });
  db = drizzle(client, { schema });
} else {
  if (!globalForDb._nlamsClient) {
    globalForDb._nlamsClient = postgres(DATABASE_URL, { max: 10 });
  }
  if (!globalForDb._nlamsDb) {
    globalForDb._nlamsDb = drizzle(globalForDb._nlamsClient, { schema });
  }
  client = globalForDb._nlamsClient;
  db = globalForDb._nlamsDb as ReturnType<typeof drizzle<typeof schema>>;
}

export { db, client };
