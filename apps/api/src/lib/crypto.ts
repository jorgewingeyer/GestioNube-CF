import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

// Hashing configuration
const BCRYPT_ROUNDS = 12;

/**
 * Hashes a password using Bcrypt (Laravel compatible)
 * @param password The plain text password
 * @returns The hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verifies a password against a stored hash (Laravel compatible)
 * @param password The plain text password
 * @param storedHash The hashed password from the database (e.g., $2y$12$...)
 * @returns True if the password matches the hash
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    // bcryptjs.compare handles extraction of salt/rounds from the hash string
    // It is compatible with Laravel's $2y$ prefix by normalising it to $2a$
    const hashToVerify = storedHash.replace(/^\$2y\$/, "$2a$");
    return await bcrypt.compare(password, hashToVerify);
  } catch (error) {
    return false;
  }
}

/**
 * Signs a JWT using jose (Edge compatible)
 * @param payload The data to be encoded in the JWT
 * @param secret The secret key for signing
 * @returns The signed JWT string
 */
export async function signJWT(payload: any, secret: string): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

/**
 * Verifies a JWT using jose (Edge compatible)
 * @param token The JWT string to verify
 * @param secret The secret key for verification
 * @returns The decoded payload or null if invalid
 */
export async function verifyJWT(token: string, secret: string): Promise<any> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);
    return payload;
  } catch (error) {
    return null;
  }
}
