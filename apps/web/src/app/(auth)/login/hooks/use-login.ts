"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { loginAction } from "@/actions/auth/login-action";

const loginSchema = z.object({
  email: z.email({ message: "Ingresa un correo válido para continuar." }),
  password: z
    .string()
    .min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
});

export type LoginSchema = z.infer<typeof loginSchema>;

export function useLogin() {
  const router = useRouter();

  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: LoginSchema) {
    const promise = (async () => {
      const res = await loginAction(values);

      if (!res.success) {
        throw new Error(
          res.message.toString() || "Ocurrió un error inesperado.",
        );
      }

      router.push("/dashboard");
      return res.message;
    })();

    toast.promise(promise, {
      loading: "Iniciando sesión...",
      success: (message) => message as string,
      error: (err) =>
        err.message ||
        "No pudimos iniciar sesión. Por favor, inténtalo nuevamente.",
    });

    try {
      await promise;
    } catch (error) {
      // Error manejado por toast.promise
    }
  }

  return {
    form,
    isSubmitting,
    onSubmit,
  };
}
