import * as schema from "../../db/schema";
import { DrizzleD1Database } from "drizzle-orm/d1";

/**
 * Fetch all users from database
 * @param db Database instance
 * @returns List of users
 */
export const listUsersAction = async (db: DrizzleD1Database<typeof schema>) => {
  return await db.select().from(schema.users).all();
};
