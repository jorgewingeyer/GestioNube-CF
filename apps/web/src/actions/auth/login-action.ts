"use server";

import { api } from "@/lib/api-client";
import { createSession } from "@/lib/session";
import { z } from "zod";
import { loginSchema } from "@/app/(auth)/login/schemas/login-schema";

/**
 * Action handles user login
 * @param data Login data
 */
export async function loginAction(data: z.infer<typeof loginSchema>) {
  try {
    const res = await api.auth.login.$post({ json: data });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Login API error:", res.status, errorText);
      return { success: false, message: "Login failed on server" };
    }

    const response = await res.json();

    if (!response.success || !("data" in response)) {
      const errorMsg =
        "error" in response ? (response.error as string) : undefined;
      const message =
        "message" in response ? (response.message as string) : "Login failed";
      return {
        success: false,
        message: message || errorMsg || "Login failed",
      };
    }

    await createSession(response.data.user.id);

    return { success: true, message: response.message };
  } catch (error) {
    console.error("Login action error:", error);
    return { success: false, message: "Invalid credentials or server error" };
  }
}
