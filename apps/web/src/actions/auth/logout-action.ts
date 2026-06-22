"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSION } from "@/constants/cookies";

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_SESSION);
  redirect("/login");
}
