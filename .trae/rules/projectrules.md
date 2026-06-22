# PROJECT RULES

## General

- Este proyecto es un monorepo Turborepo.
- Funciona en Cloudflare Workers y Pages.
- Contiene 2 apps: `api` (Hono) y `web` (Next.js).
- Contiene un paquete de base de datos: `packages/db` (Drizzle + D1).
- **Comentarios**: Todos los comentarios del código deben estar en **Inglés**.

## Constantes

- Todas las constantes de la aplicación web deben estar en `apps/web/src/constants`.
- Evita "magic strings" dispersos por el código.

## Backend (apps/api)

- Framework: Hono.
- Comunicación: tRPC (Server) y Fetch API.
- Base de Datos: Acceso exclusivo a D1 mediante Drizzle.
- Estructura: Rutas agrupadas por dominio en `src/routers`.
- Principios: SOLID y DRY.

## Frontend (apps/web)

- Framework: Next.js (Cloudflare Pages).
- Comunicación con API: Service Binding a `api` usando cliente tRPC.
- UI: Shadcn UI + Lucide React.
- Autenticación: Cookie `auth_token` gestionada en Server Actions.
- Middleware: Protección de rutas `/dashboard`.

## Arquitectura de Páginas y Datos (apps/web)

- **Server Side Rendering (SSR)**: Todas las páginas nuevas deben ser SSR.
- **Data Fetching**: Usa **tRPC** para obtener datos en el servidor.
- **Respuesta tRPC**: Los procedimientos deben devolver: `{ success: boolean; data?: T; error?: string; message?: string; }`.

## Formularios y Componentes de Cliente

- **Manejo en Cliente**: Los formularios deben ser componentes de cliente (`"use client"`).
- **Schemas**: Los esquemas de validación (zod) deben estar en `schemas` dentro del directorio del dominio correspondiente (ej: `src/app/(auth)/login/schemas/login-schema.ts`).
- **Lógica de Cliente**: Toda la lógica de los componentes client debe estar en un custom hook (alojado en el dominio de la página dentro de `/hooks`).
  - **Regla**: 1 solo hook por página que gobierne todos los componentes client de la página.
- **Ubicación**: En carpeta `components` dentro del directorio del dominio correspondiente.
- **Herramientas**: `shadcn/ui Form`, `zod`, `react-hook-form`.
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
- **Feedback**:
  - Usa **sonner** para mostrar mensajes (éxito/error).
  - **Loading**: Usa `Spinner` de shadcn en botones. **El texto del botón nunca debe cambiar**.

## Diseño y UI

- **Importante**: No modificar los archivos en `components/ui`. Aplicar estilos mediante `className` props.
- **Estilo Flat**:
  - **Sombras**: Prohibidas (`shadow-none`).
  - **Bordes**: Prohibidos en contenedores (`border-0` o remover clase `border`).
- **Layouts**:
  - `(auth)`: Para páginas de autenticación (Login, Register).
  - `(app)`: Para la aplicación principal (Dashboard).
  - `(guest)`: Para páginas públicas (Landing, etc.).

## Lenguaje y Comunicación

- **Idioma**: Textos de usuario estrictamente en **Español**.
- **Tono**: Amable, persuasivo y profesional.

## Mejores Prácticas de Código

- **Evitar useEffect**: Busca alternativas como Server Components o event handlers.
- **Control de Flujo**:
  - Evitar `if` anidados (usar early return).
  - Evitar `switch` (usar mapas de objetos).
- **Manejo de Errores**:
  - Evitar `try/catch` excesivo.
  - Manejar errores en la capa de API y devolver mensaje al cliente.
- **Typado**:
  - Inferencia estricta de tRPC.
  - Interfaces solo para props y argumentos.
  - **Prohibido `any`**.

## Base de Datos (packages/db)

- ORM: Drizzle.
- Driver: D1 (drizzle-orm/d1).
- Migraciones: Generadas con `drizzle-kit`, aplicadas con `wrangler`.

## Scripts

- `pnpm dev`: Inicia el entorno de desarrollo local.
- `pnpm build`: Construye todas las aplicaciones.
- `pnpm migrate:local`: Aplica migraciones a la base de datos D1 local.
- `pnpm migrate:remote`: Aplica migraciones a la base de datos D1 remota.
- `pnpm db:studio`: Abre Drizzle Studio para inspeccionar la base de datos local.
