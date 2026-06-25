"use server";

import { cookies } from "next/headers";
import { COOKIE_SESSION } from "@/constants/cookies";

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_SESSION);
}
