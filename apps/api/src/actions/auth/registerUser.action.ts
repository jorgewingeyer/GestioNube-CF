import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { hashPassword } from "../../lib/crypto";
import { AppError } from "../../errors";

/**
 * Register a new user in the database.
 * Throws AppError if email is already registered.
 * @param db - Database instance.
 * @param input - User registration data.
 * @returns Created user details.
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
    throw new AppError(
      "Vaya, parece que este correo electrónico ya está registrado. ¿Quizás quisiste iniciar sesión?",
      400,
      "EMAIL_ALREADY_REGISTERED",
    );
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
