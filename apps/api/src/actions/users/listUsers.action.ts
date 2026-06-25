import * as schema from "../../db/schema";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Fetch all users from database
 * Selecting only columns that exist in the current physical database.
 * @param db Database instance
 * @returns List of users
 */
export const listUsersAction = async (
  db: PostgresJsDatabase<typeof schema>,
) => {
  return await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      created_at: schema.users.created_at,
    })
    .from(schema.users);
};
