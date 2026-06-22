"use client";

import { Controller } from "react-hook-form";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Form } from "@repo/ui/components/form";
import { Field, FieldLabel, FieldError } from "@repo/ui/components/field";
import { useRegister } from "../hooks/use-register";
import { Spinner } from "@repo/ui/components/spinner";
import { Info } from "lucide-react";

export function RegisterForm() {
  const { form, isSubmitting, onSubmit } = useRegister();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Nombre Completo</FieldLabel>
              <Input
                {...field}
                id={field.name}
                placeholder="Juan Pérez"
                autoComplete="name"
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Correo Electrónico</FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="email"
                placeholder="tu@ejemplo.com"
                autoComplete="email"
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Contraseña</FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
              />
              <div className="mt-2 text-xs text-muted-foreground p-2 bg-muted/50 rounded-md flex gap-2 items-start">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <ul className="list-disc pl-4 space-y-1">
                  <li>Mínimo 6 caracteres</li>
                  <li>Al menos 1 mayúscula (A-Z)</li>
                  <li>Al menos 1 número (0-9)</li>
                  <li>Al menos 1 carácter especial</li>
                </ul>
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Crear Cuenta
        </Button>
      </form>
    </Form>
  );
}
