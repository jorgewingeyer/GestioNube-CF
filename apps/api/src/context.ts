import { createDb } from "./db";

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

export function createContext(env: Env) {
  const db = createDb(env.DB);
  return {
    db,
    env,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
