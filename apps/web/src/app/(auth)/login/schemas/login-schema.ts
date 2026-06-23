import { z } from "zod";

export const loginSchema = z.object({
  email: z.email({ message: "Ingresa un correo válido para continuar." }),
  password: z
    .string()
    .min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
});

export type LoginSchema = z.infer<typeof loginSchema>;
