"use server";

import { api } from "@/lib/api-client";
import { z } from "zod";
import { registerSchema } from "@/app/(auth)/register/schemas/register-schema";
import { apiAction } from "../api-action";

/**
 * Action handles user registration using central apiAction wrapper.
 * @param data - Registration data.
 */
export async function registerAction(data: z.infer<typeof registerSchema>) {
  return apiAction({
    actionName: "register",
    apiCall: () => api.auth.register.$post({ json: data }),
  });
}
