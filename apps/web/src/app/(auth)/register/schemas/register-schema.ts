import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).regex(/^[a-zA-ZÀ-ÿ\s']+$/),
  email: z.email(),
  password: z
    .string()
    .min(6)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^a-zA-Z0-9]/),
});
