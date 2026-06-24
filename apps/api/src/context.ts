import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./db/schema";
import { Logger } from "@repo/logger";
import { createDb } from "./db";

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

/**
 * Custom context variables injected into Hono Request Context.
 */
export interface CustomVars {
  /** Injected Drizzle ORM database instance */
  db: DrizzleD1Database<typeof schema>;
  /** Injected structured Logger instance */
  logger: Logger;
}

export function createContext(env: Env) {
  const db = createDb(env.DB);
  return {
    db,
    env,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
