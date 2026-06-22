---
name: Create Nextjs Page w/ Cloudflare
description: Guía estandarizada para crear páginas en Next.js con SSR, tRPC y Cloudflare D1.
---

# Guía para Crear Páginas en Next.js

Sigue estas reglas estrictas al crear nuevas páginas y funcionalidades en el proyecto.

## 1. Arquitectura de Páginas y Datos

- **Server Side Rendering (SSR)**: Todas las páginas nuevas deben ser SSR.
- **Data Fetching**: Usa **tRPC** para obtener datos en el servidor.
  - **Producción**: En producción, tRPC funciona mediante **Service Binding** para comunicación directa y eficiente entre workers.
- **Respuesta tRPC**: Los procedimientos de tRPC deben devolver un objeto con la siguiente estructura:
  ```ts
  {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
  }
  ```
- **TypeScript**:
  - Todo el tipado debe inferirse de tRPC. Solo crea interfaces manuales para `props` de componentes y atributos de métodos.
  - **Prohibido `any`**: Nunca uses el tipo `any`, ya que rompe el build en producción.

## 2. Formularios y Componentes de Cliente

- **Manejo en Cliente**: Los formularios deben ser componentes de cliente ("use client").
- **Schemas**: Los esquemas de validación (zod) deben estar en `schemas` dentro del directorio del dominio correspondiente (ej: `src/app/(auth)/login/schemas/login-schema.ts`).
- **Lógica de Cliente**: Toda la lógica de los componentes client debe estar en un custom hook (alojado en el dominio de la página dentro de `/hooks`).
  - **Regla**: 1 solo hook por página que gobierne todos los componentes client de la página.
- **Ubicación**: Coloca los formularios en una carpeta `components` dentro del directorio del dominio de la página correspondiente.
- **Herramientas**:
  - Usa el componente `Form` de **shadcn/ui**.
  - **Componentes Faltantes**: Si necesitas un componente de shadcn que no está instalado, instálalo usando el CLI de shadcn.
  - Validación con **zod** y **react-hook-form**.
- **Patrón de Implementación**:
  - Usar `Controller` de `react-hook-form` directamente.
  - Usar componentes personalizados `Field`, `FieldLabel`, `FieldError` (importados de `@/components/ui/field`).
  - **Ejemplo**:
    ```tsx
    <Controller
      name="email"
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={field.name}>Label</FieldLabel>
          <Input {...field} id={field.name} aria-invalid={fieldState.invalid} />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
    ```
- **Feedback al Usuario**:
  - Usa **sonner** para mostrar el `message` que viene en la respuesta de tRPC (tanto para éxito como para error).
  - **Loading**: En los botones de acción, usa el componente `Spinner` de shadcn a la izquierda del texto. **El texto del botón nunca debe cambiar** (ej. no cambiar "Guardar" por "Guardando...").

## 3. Diseño y UI

- **Importante**: No modificar los archivos en `components/ui`. Aplicar estilos mediante `className` props.
- **Estilo Flat**:
  - **Sombras**: Prohibidas (`shadow-none`).
  - **Bordes**: Prohibidos en contenedores (`border-0` o remover clase `border`).
- **Layouts**:
  - `(auth)`: Para páginas de autenticación (Login, Register).
  - `(app)`: Para la aplicación principal (Dashboard).
  - `(guest)`: Para páginas públicas (Landing, etc.).

## 4. Lenguaje y Comunicación

- **Idioma**: Todos los textos de cara al usuario deben estar estrictamente en **Español**.
- **Tono**: El lenguaje debe ser **amable, persuasivo y profesional**.

## 5. Mejores Prácticas de Código

- **Evitar useEffect**: Busca alternativas como Server Components o event handlers.
- **Control de Flujo**:
  - **Evitar `if` anidados**: Usa **early return** para mantener el código plano.
  - **Evitar `switch`**: Usa objetos de JavaScript (mapas de objetos) para mapear valores.
- **Manejo de Errores**:
  - **Evitar `try/catch` excesivo**: Úsalo solo en el último momento posible.
  - **API**: Todos los errores deben manejarse en la capa de API y devolver solo el mensaje al cliente.
- **Constantes y Datos Estáticos**:
  - Almacena datos repetitivos y estáticos (nombres de cookies, traducciones, colores de estado, etc.) en archivos de constantes en `apps/web/src/constants`.
  - Evita "magic strings" dispersos por el código.
- **Comentarios**:
  - Todos los comentarios de código deben estar estrictamente en **Inglés**.

## Resumen de Reglas

1. **Páginas**: SSR + tRPC (Service Binding en Prod).
2. **Forms**: Client side + shadcn Form + Zod + React Hook Form + Pattern Field/Controller.
3. **UI**: Flat design (Sin sombras ni bordes en contenedores) usando clases, no modificando componentes.
4. **Layouts**: (auth), (app), (guest).
5. **Comunicación**: Español, Amable, Persuasivo, Profesional.
6. **Clean Code**: No useEffect, Early returns, No switch, Infer types, Constantes, No Any.
