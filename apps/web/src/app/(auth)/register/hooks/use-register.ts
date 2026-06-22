"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { registerAction } from "@/actions/auth/register-action";

const registerSchema = z.object({
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
});

export type RegisterSchema = z.infer<typeof registerSchema>;

export function useRegister() {
  const router = useRouter();

  const form = useForm<RegisterSchema>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: RegisterSchema) {
    const res = await registerAction(values);
    if (res.success) {
      toast.success(res.message);
      router.push("/login");
    } else {
      toast.error(res.message);
    }
  }

  return {
    form,
    isSubmitting,
    onSubmit,
  };
}
