import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./db/schema";
import { Logger } from "@repo/logger";

export interface Env {
  // Cloudflare Hyperdrive binding using native type
  HYPERDRIVE: Hyperdrive;
  JWT_SECRET?: string;
}

/**
 * Custom context variables injected into Hono Request Context.
 */
export interface CustomVars {
  /** Injected Drizzle ORM database instance */
  db: PostgresJsDatabase<typeof schema>;
  /** Injected structured Logger instance */
  logger: Logger;
}
