"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginAction } from "@/actions/auth/login-action";
import { toasted } from "@/lib/utils/action-toast";
import { loginSchema, LoginSchema } from "../schemas/login-schema";

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
    await toasted({
      action: () => loginAction(values),
      loadingMessage: "Iniciando sesión...",
      onSuccess: () => router.push("/dashboard"),
    });
  }

  return {
    form,
    isSubmitting,
    onSubmit,
  };
}
