import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hashPassword } from "../../lib/crypto";
import { DuplicateEmailError } from "../../errors";

/**
 * Register a new user in the database.
 * Throws AppError if email is already registered.
 * @param db - Database instance.
 * @param input - User registration data.
 * @returns Created user details.
 */
export const registerUserAction = async (
  db: PostgresJsDatabase<typeof schema>,
  input: { name: string; email: string; password: string },
) => {
  // Check if user already exists
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .limit(1);

  if (existing) {
    throw new DuplicateEmailError();
  }

  // Hash password
  const hashedPassword = await hashPassword(input.password);

  // Create user
  const [newUser] = await db
    .insert(schema.users)
    .values({
      name: input.name,
      email: input.email,
      password: hashedPassword,
    })
    .returning();

  return newUser;
};
