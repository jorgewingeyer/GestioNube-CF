import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { hashPassword } from "../../lib/crypto";

/**
 * Register a new user in the database
 * @param db Database instance
 * @param input User registration data
 * @returns Created user or null if user already exists
 */
export const registerUserAction = async (
  db: DrizzleD1Database<typeof schema>,
  input: { name: string; email: string; password: string },
) => {
  // Check if user already exists
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .get();

  if (existing) {
    throw new Error("El usuario ya existe");
  }

  // Hash password
  const hashedPassword = await hashPassword(input.password);

  // Create user
  return await db
    .insert(schema.users)
    .values({
      name: input.name,
      email: input.email,
      password: hashedPassword,
    })
    .returning()
    .get();
};
