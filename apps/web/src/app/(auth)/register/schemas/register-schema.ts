import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, {
      message:
        "¡Hola! Necesitamos un nombre de al menos 2 caracteres para dirigirnos a ti.",
    })
    .regex(/^[a-zA-ZÀ-ÿ\s']+$/, {
      message: "El nombre solo debe contener letras.",
    }),
  email: z.email({
    message: "Parece que este correo no es válido. ¿Podrías revisarlo?",
  }),
  password: z
    .string()
    .min(6, {
      message:
        "Tu seguridad es importante. Usa una contraseña de al menos 6 caracteres.",
    })
    .regex(/[A-Z]/, { message: "Debe contener al menos una letra mayúscula." })
    .regex(/[0-9]/, { message: "Debe contener al menos un número." })
    .regex(/[^a-zA-Z0-9]/, {
      message: "Debe contener al menos un carácter especial.",
    }),
  passwordConfirmation: z.string().min(6, {
    message: "Por favor, confirma tu contraseña.",
  }),
}).refine((data) => data.password === data.passwordConfirmation, {
  message: "Las contraseñas no coinciden. ¿Podrías revisarlas?",
  path: ["passwordConfirmation"],
});

export type RegisterSchema = z.infer<typeof registerSchema>;
