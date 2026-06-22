import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export * from "./schema";

export const createDb = (client: D1Database) => {
  return drizzle(client, { schema });
};
