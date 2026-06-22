"use server";

import { api } from "@/lib/api-client";
import { z } from "zod";
import { registerSchema } from "@/app/(auth)/register/schemas/register-schema";

/**
 * Action handles user registration
 * @param data Registration data
 */
export async function registerAction(data: z.infer<typeof registerSchema>) {
  try {
    const res = await api.auth.register.$post({ json: data });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Register API error:", res.status, errorText);
      return { success: false, message: "Registration failed on server" };
    }

    const response = await res.json();

    if (!response.success) {
      const errorMsg =
        "error" in response ? (response.error as string) : undefined;
      const message =
        "message" in response
          ? (response.message as string)
          : "Registration failed";
      return {
        success: false,
        message: message || errorMsg || "Registration failed",
      };
    }

    return { success: true, message: response.message };
  } catch (error) {
    console.error("Register action error:", error);
    return { success: false, message: "Registration failed or server error" };
  }
}
