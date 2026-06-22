---
name: Create API Route (tRPC)
description: Guía estandarizada para crear nuevas rutas y módulos en la API (Hono + tRPC) con capa de Actions.
---

# Guía para Crear Rutas de API con Capa de Actions

Sigue estos pasos para agregar nuevas funcionalidades a la API manteniendo una arquitectura limpia y escalable.

## 1. Arquitectura de Módulos

La API sigue una arquitectura de capas estricta:

1.  **Router Layer (tRPC)**: Define los endpoints, valida inputs (Zod) y llama a los Actions. Solo maneja Request/Response.
2.  **Actions Layer**: Contiene la lógica de negocio pura y acceso a datos.

Estructura de directorios:

```
apps/api/src/
  ├── actions/               # CAPA DE ACTIONS
  │   ├── {dominio}/         # Ej: users, auth
  │   │   └── {accion}.action.ts  # Ej: getUserById.action.ts
  │
  └── modules/               # CAPA DE ROUTERS (tRPC)
      └── {dominio}/         # Ej: users
          ├── {accion}.ts        # Procedimiento tRPC individual
          └── {dominio}.router.ts # Router del módulo
```

## 2. Crear una Action (Lógica de Negocio)

Las Actions son funciones asíncronas reutilizables que encapsulan la lógica de negocio.

**Reglas para Actions:**

- **Ubicación**: `apps/api/src/actions/{dominio}/`.
- **Naming**: `{verbo}{Entidad}Action` (ej: `createUserAction`).
- **Archivo**: `{nombreAction}.action.ts`.
- **Single Responsibility**: Un archivo por Action.
- **SOLID & DRY**: Reutiliza lógica y mantén las funciones pequeñas.
- **Idioma**: Comentarios en **Inglés**.

**Ejemplo (`src/actions/users/createUser.action.ts`):**

```ts
import { db } from "@repo/db"; // O pasar db como inyección de dependencias si se prefiere
import { users } from "@repo/db/schema";
import { eq } from "drizzle-orm";

/**
 * Creates a new user in the database
 * @param input User data
 * @returns Created user
 */
export const createUserAction = async (
  db: DrizzleD1Database,
  input: NewUser,
) => {
  // Business logic here
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .get();
  if (existing) {
    throw new Error("User already exists");
  }

  return await db.insert(users).values(input).returning().get();
};
```

## 3. Crear el Procedimiento tRPC

El procedimiento tRPC actúa como controlador. Valida la entrada y llama a la Action.

**Patrón de archivo (`src/modules/{dominio}/{accion}.ts`):**

```ts
import { publicProcedure } from "../../trpc";
import { z } from "zod";
import { createUserAction } from "../../actions/users/createUser.action";

export const createUser = publicProcedure
  .input(
    z.object({
      name: z.string(),
      email: z.string().email(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    try {
      // Call the Action
      const result = await createUserAction(ctx.db, input);

      // Standard Response
      return {
        success: true,
        message: "Usuario creado exitosamente", // Mensaje en Español: Amable, Persuasivo, Profesional
        data: result,
      };
    } catch (e) {
      return {
        success: false,
        message: "No se pudo crear el usuario", // Mensaje en Español
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });
```

**Reglas:**

- **Mensajes**: En **Español** (Amable, Persuasivo, Profesional).
- **Comentarios**: En **Inglés**.

## 4. Crear el Router del Módulo

Agrupa los procedimientos en `{dominio}.router.ts`.

```ts
import { router } from "../../trpc";
import { createUser } from "./createUser";

export const usersRouter = router({
  create: createUser,
});
```

## 5. Registrar en AppRouter

En `apps/api/src/routers/index.ts`:

```ts
import { router } from "../trpc";
import { usersRouter } from "../modules/users/users.router";

export const appRouter = router({
  users: usersRouter,
});
```
