"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerAction } from "@/actions/auth/register-action";
import { toasted } from "@/lib/utils/action-toast";
import { registerSchema, RegisterSchema } from "../schemas/register-schema";

export function useRegister() {
  const router = useRouter();

  const form = useForm<RegisterSchema>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: RegisterSchema) {
    await toasted({
      action: () => registerAction(values),
      loadingMessage: "Creando tu cuenta y configurando tu empresa...",
      onSuccess: () => router.push("/dashboard"),
    });
  }

  return {
    form,
    isSubmitting,
    onSubmit,
  };
}
