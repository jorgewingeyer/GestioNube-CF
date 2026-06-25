"use server";

import { api } from "@/lib/api-client";
import { createSession } from "@/lib/session";
import { z } from "zod";
import { registerSchema } from "@/app/(auth)/register/schemas/register-schema";
import { apiAction } from "../api-action";
import { InferResponseType } from "hono";

type RegisterResponse = InferResponseType<typeof api.auth.register.$post>;

/**
 * Action handles user registration using central apiAction wrapper.
 * @param data - Registration data.
 */
export async function registerAction(data: z.infer<typeof registerSchema>) {
  return apiAction<NonNullable<RegisterResponse["data"]>>({
    actionName: "register",
    apiCall: () => api.auth.register.$post({ json: data }),
    onSuccess: async (data) => {
      if (data?.id) {
        await createSession(data.id);
      }
    },
  });
}
