import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { signJWT, verifyPassword } from "../../lib/crypto";

/**
 * Login user and generate JWT token
 * @param db Database instance
 * @param input Login credentials
 * @returns User data and token
 */
export const loginUserAction = async (
  db: DrizzleD1Database<typeof schema>,
  input: { email: string; password: string },
  jwtSecret: string,
) => {
  // Find user by email
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .get();

  if (!user) {
    throw new Error("Credenciales inválidas");
  }

  // Verify password
  const isValid = await verifyPassword(input.password, user.password);

  if (!isValid) {
    throw new Error("Credenciales inválidas");
  }

  // Generate token
  const token = await signJWT(
    { sub: user.id.toString(), email: user.email },
    jwtSecret,
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
    },
  };
};
