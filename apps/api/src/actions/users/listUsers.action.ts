import * as schema from "../../db/schema";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Fetch all users from database
 * @param db Database instance
 * @returns List of users
 */
export const listUsersAction = async (db: PostgresJsDatabase<typeof schema>) => {
  return await db.select().from(schema.users);
};
