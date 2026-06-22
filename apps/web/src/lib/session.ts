"use server";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { COOKIE_SESSION } from "@/constants/cookies";

const secretKey = process.env.SESSION_SECRET;

// if (!secretKey) {
//   throw new Error("SESSION_SECRET is not defined");
// }
// For dev/demo purposes, fallback if not defined, but in prod it should be set.
const key = secretKey || "super-secret-key-change-me";

const encodedKey = new TextEncoder().encode(key);

type SessionPayload = {
  userId: number;
  role?: string;
  expiresAt: Date;
};

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

export async function decrypt(session: string | undefined = "") {
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    // console.error("Failed to verify session", error);
    return null;
  }
}

export async function createSession(userId: number, role: string = "user") {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({ userId, role, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_SESSION, session, {
    httpOnly: true,
    secure: true,
    expires: expiresAt,
    sameSite: "none",
    path: "/",
  });
}

export async function verifySession() {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_SESSION)?.value;

  if (!session) {
    return null;
  }

  const payload = await decrypt(session);

  if (!payload) {
    return null;
  }

  return { isAuth: true, userId: payload.userId, role: payload.role };
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_SESSION);
}
