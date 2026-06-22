"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { loginAction } from "@/actions/auth/login-action";
import { useState } from "react";

const loginSchema = z.object({
  email: z.email({ message: "Ingresa un correo válido para continuar." }),
  password: z
    .string()
    .min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
});

export type LoginSchema = z.infer<typeof loginSchema>;

export function useLogin() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginSchema) {
    setIsSubmitting(true);
    const res = await loginAction(values);

    if (res.success) {
      toast.success(res.message);
      router.push("/dashboard");
    } else {
      setIsSubmitting(false);
      toast.error(res.message);
    }
  }

  return {
    form,
    isSubmitting,
    onSubmit,
  };
}
