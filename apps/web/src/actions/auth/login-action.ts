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
    const response = await res.json();

    if (!response.success || !("data" in response)) {
      return {
        success: false,
        message: response.error,
      };
    }

    await createSession(response.data.user.id);

    return { success: true, message: response.message };
  } catch (error) {
    console.error("Login action error:", error);
    return {
      success: false,
      message:
        "Lo sentimos, las credenciales ingresadas no son válidas o ha ocurrido un error en el servidor. Por favor, intenta nuevamente.",
    };
  }
}
