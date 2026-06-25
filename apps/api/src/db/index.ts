import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

/**
 * Creates a Drizzle database instance.
 * In production, it uses the connection string from Hyperdrive.
 * In local development, it uses the direct connection string.
 */
export const createDb = (connectionString: string) => {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
};
