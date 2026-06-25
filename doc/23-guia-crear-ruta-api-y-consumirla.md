# Guía Práctica: De la Ruta API al Componente Web

Este documento explica paso a paso cómo funciona la arquitectura actual del monorepo y cómo crear una nueva funcionalidad completa: desde definir la lógica en la API hasta consumirla desde `apps/web`.

> **Referencia de arquitectura**: Esta guía es la continuación práctica de [22-simplificacion-acciones-y-logs.md](./22-simplificacion-acciones-y-logs.md), que documenta el diseño y la motivación detrás de estas decisiones.

---

## Visión General del Flujo

```
[Componente React]
      │  llama al Server Action
      ▼
[Server Action] → apiAction()   ← apps/web/src/actions/
      │  hace fetch usando el cliente Hono RPC
      ▼
[API Hono - Router/Module]       ← apps/api/src/modules/
      │  valida con zValidator (Zod) y delega la lógica
      ▼
[API Action (lógica de negocio)] ← apps/api/src/actions/
      │  consulta DB, lanza AppError si hay fallo
      ▼
[app.onError / Respuesta JSON]   ← apps/api/src/index.ts
```

El **contrato de respuesta** de la API siempre es:
```json
{
  "success": true | false,
  "message": "Mensaje amigable en español",
  "data": { ... } | null,
  "error": "CODIGO_ERROR | null"
}
```

---

## Estructura de Archivos Relevante

```
gestionube_cf/
├── apps/
│   ├── api/src/
│   │   ├── index.ts                       ← Entry point: middleware global + onError
│   │   ├── context.ts                     ← Tipos Env y CustomVars (db, logger)
│   │   ├── routers/index.ts               ← Barrel que monta todos los módulos
│   │   ├── errors/
│   │   │   ├── app-error.ts               ← Clase base con auto-logging
│   │   │   ├── authentication-error.ts    ← 401 UNAUTHORIZED
│   │   │   ├── not-found-error.ts         ← 404 NOT_FOUND
│   │   │   └── index.ts                   ← Barrel de re-exportación
│   │   ├── modules/
│   │   │   └── auth/
│   │   │       ├── auth.router.ts         ← Agrupa las rutas del módulo
│   │   │       ├── login.ts               ← Endpoint POST /api/auth/login
│   │   │       └── register.ts            ← Endpoint POST /api/auth/register
│   │   └── actions/
│   │       └── auth/
│   │           ├── loginUser.action.ts    ← Lógica de negocio: login
│   │           └── registerUser.action.ts ← Lógica de negocio: register
│   │
│   └── web/src/
│       ├── actions/
│       │   ├── api-action.ts              ← Wrapper central de Server Actions
│       │   └── auth/
│       │       └── login-action.ts        ← Server Action: login
│       └── lib/
│           └── api-client.ts             ← Cliente Hono RPC tipado
│
└── packages/
    └── logger/src/index.ts               ← @repo/logger (Logger compartido)
```

---

## Paso 1 — Crear la Lógica de Negocio (API Action)

Los **API Actions** son funciones puras que reciben la base de datos y los parámetros necesarios. No manejan HTTP, no formatean respuestas: solo ejecutan la lógica de negocio y **lanzan errores tipificados** si algo falla.

**Ubicación:** `apps/api/src/actions/<modulo>/<nombre>.action.ts`

### Ejemplo: `getProductAction`

```typescript
// apps/api/src/actions/products/getProduct.action.ts
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { NotFoundError } from "../../errors";

/**
 * Retrieves a single product by ID.
 * Throws NotFoundError if the product does not exist.
 * @param db - Injected database instance.
 * @param productId - The ID of the product to retrieve.
 * @returns The found product record.
 */
export const getProductAction = async (
  db: PostgresJsDatabase<typeof schema>,
  productId: number,
) => {
  const [product] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, productId))
    .limit(1);

  if (!product) {
    throw new NotFoundError("El producto solicitado no existe o fue eliminado.");
  }

  return product;
};
```

**Reglas de esta capa:**
- ✅ Lanzar `AppError` o sus subclases para errores de negocio esperados.
- ✅ Dejar que los errores de DB (inesperados) se propaguen solos — `app.onError` los captura.
- ❌ No usar `try-catch` aquí. No formatear JSON. No loggear manualmente.
- ❌ No instanciar `Logger` aquí — el auto-logging está en el constructor de `AppError`.

---

## Paso 2 — Crear el Router / Module de Hono

El **router** es el endpoint HTTP. Valida el input con Zod vía `zValidator`, obtiene `db` del contexto (inyectado por middleware), llama al action y retorna el JSON de éxito.

**Ubicación:** `apps/api/src/modules/<modulo>/<nombre>.ts`

### Ejemplo: `getProduct.ts`

```typescript
// apps/api/src/modules/products/getProduct.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getProductAction } from "../../actions/products/getProduct.action";
import { Env, CustomVars } from "../../context";

export const getProductRouter = new Hono<{
  Bindings: Env;
  Variables: CustomVars;
}>().get(
  "/:id",
  zValidator("param", z.object({ id: z.coerce.number().int().positive() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = c.get("db"); // Inyectado por el middleware global

    const product = await getProductAction(db, id);

    return c.json({
      success: true,
      message: "Producto obtenido correctamente.",
      data: product,
    });
  },
);
```

**Reglas de esta capa:**
- ✅ Siempre usar `c.get("db")` — nunca instanciar la DB manualmente.
- ✅ Siempre usar `zValidator` para validar el input antes de usarlo.
- ✅ El mensaje de éxito va en el router — los mensajes de error van en el action o en `AppError`.
- ❌ No usar `try-catch` en el router. El `app.onError` del entry point los maneja.

---

## Paso 3 — Registrar el Router en el Módulo y en el Barrel

### 3.1. Router del módulo

Agrupa los endpoints de un módulo en un router padre.

**Ubicación:** `apps/api/src/modules/<modulo>/<modulo>.router.ts`

```typescript
// apps/api/src/modules/products/products.router.ts
import { Hono } from "hono";
import { getProductRouter } from "./getProduct";
// import { createProductRouter } from "./createProduct";
// import { deleteProductRouter } from "./deleteProduct";

export const productsRouter = new Hono()
  .route("/", getProductRouter);
  // .route("/", createProductRouter)
  // .route("/:id", deleteProductRouter);
```

### 3.2. Barrel global de routers

Montar el módulo en el barrel global para que quede expuesto:

```typescript
// apps/api/src/routers/index.ts
import { Hono } from "hono";
import { authRouter } from "../modules/auth/auth.router";
import { usersRouter } from "../modules/users/users.router";
import { productsRouter } from "../modules/products/products.router"; // ← Agregar

const app = new Hono()
  .route("/auth", authRouter)
  .route("/users", usersRouter)
  .route("/products", productsRouter); // ← Agregar

export type AppType = typeof app;
export default app;
```

La ruta final expuesta será: `GET /api/products/:id`

> **Importante**: `AppType` es el tipo que el cliente Hono RPC (`api-client.ts` en web) usa para tener autocompletado y tipado completo end-to-end. Al agregar nuevos routers, el cliente los detecta automáticamente.

---

## Paso 4 — Crear el Server Action en Web

Los **Server Actions** de Next.js usan el wrapper `apiAction` para llamar a la API de forma tipada. Este wrapper centraliza el `try-catch`, la validación HTTP y el logging de errores.

**Ubicación:** `apps/web/src/actions/<modulo>/<nombre>-action.ts`

```typescript
// apps/web/src/actions/products/get-product-action.ts
"use server";

import { api } from "@/lib/api-client";
import { apiAction } from "../api-action";

/**
 * Server Action to fetch a single product from the API.
 * @param productId - The ID of the product to retrieve.
 */
export async function getProductAction(productId: number) {
  return apiAction({
    actionName: "getProduct",
    apiCall: () => api.products[":id"].$get({ param: { id: String(productId) } }),
  });
}
```

### Parámetros de `apiAction`

| Parámetro | Tipo | Descripción |
|---|---|---|
| `actionName` | `string` | Nombre descriptivo para logs (ej. `"getProduct"`, `"createInvoice"`). |
| `apiCall` | `() => Promise<Response>` | Función que retorna la llamada al cliente Hono RPC. |
| `onSuccess` | `(data: T) => void \| Promise<void>` | *(Opcional)* Callback que corre en el servidor Next.js si la respuesta fue exitosa. |

### Cuándo usar `onSuccess`

Usalo cuando necesitás ejecutar lógica de servidor adicional **después** de confirmar que la API respondió con éxito. Los casos más comunes son:

```typescript
// Caso 1: Guardar cookie de sesión después de login
export async function loginAction(data: z.infer<typeof loginSchema>) {
  return apiAction({
    actionName: "login",
    apiCall: () => api.auth.login.$post({ json: data }),
    onSuccess: async (responseData: any) => {
      await createSession(responseData.user.id);
    },
  });
}

// Caso 2: Revalidar el cache de Next.js después de crear un recurso
export async function createProductAction(data: CreateProductInput) {
  return apiAction({
    actionName: "createProduct",
    apiCall: () => api.products.$post({ json: data }),
    onSuccess: async () => {
      revalidatePath("/products");
    },
  });
}
```

---

## Paso 5 — Consumir el Server Action en un Componente

```tsx
// apps/web/src/app/products/[id]/page.tsx
"use client";

import { useState } from "react";
import { getProductAction } from "@/actions/products/get-product-action";
import { toasted } from "@/lib/utils/action-toast";

export default function ProductPage({ params }: { params: { id: string } }) {
  const [product, setProduct] = useState<any>(null);

  const handleLoad = async () => {
    // toasted() ejecuta el action y muestra automáticamente
    // un toast con el mensaje de éxito o error que vino de la API
    const result = await toasted(() => getProductAction(Number(params.id)));

    if (result.success) {
      setProduct(result.data);
    }
  };

  // ...
}
```

`toasted()` consume el `ActionResponse<T>` retornado por `apiAction` y muestra automáticamente una notificación flotante con el `message` que vino de la API, tanto en caso de éxito como de error. No necesitás manejar el toast manualmente.

---

## Paso 6 — Crear un Error de Negocio Personalizado (si es necesario)

Si necesitás un nuevo tipo de error específico para tu módulo:

**1. Crear el archivo del error:**

```typescript
// apps/api/src/errors/out-of-stock-error.ts
import { AppError } from "./app-error";

/**
 * Thrown when a product has no available stock to fulfill the request.
 */
export class OutOfStockError extends AppError {
  constructor(productName: string) {
    super(
      `El producto "${productName}" no tiene stock disponible en este momento.`,
      409,
      "OUT_OF_STOCK",
    );
    this.name = "OutOfStockError";
  }
}
```

**2. Agregar al barrel de exportación:**

```typescript
// apps/api/src/errors/index.ts
export * from "./app-error";
export * from "./authentication-error";
export * from "./not-found-error";
export * from "./out-of-stock-error"; // ← Agregar
```

**3. Usarlo en el action:**

```typescript
import { OutOfStockError } from "../../errors";

if (product.stock <= 0) {
  throw new OutOfStockError(product.name);
}
```

El error se **loggea automáticamente** al ser instanciado (en el constructor de `AppError`) y es capturado por `app.onError`, que lo convierte en una respuesta JSON con el código HTTP correcto. No es necesario hacer nada más.

---

## Resumen de Responsabilidades por Capa

| Capa | Archivo | Responsabilidad |
|---|---|---|
| **API Action** | `apps/api/src/actions/` | Lógica de negocio pura. Lanza `AppError` en fallos esperados. |
| **Module/Router** | `apps/api/src/modules/` | Valida input (Zod), llama al action, retorna JSON de éxito. |
| **Router Barrel** | `apps/api/src/routers/index.ts` | Monta y exporta todos los módulos. Define `AppType`. |
| **Error Handler** | `apps/api/src/index.ts` | Captura cualquier error lanzado y lo convierte en JSON con código HTTP. |
| **AppError** | `apps/api/src/errors/` | Encapsula tipo de error + HTTP code + auto-logging en constructor. |
| **Server Action** | `apps/web/src/actions/` | Envuelve la llamada al API client con `apiAction()`. |
| **`apiAction`** | `apps/web/src/actions/api-action.ts` | Try-catch central, validación HTTP, logging de errores de red. |
| **Componente** | `apps/web/src/app/` | Llama al Server Action y consume el resultado. |
| **Logger** | `packages/logger/` | Logging estructurado compartido por API y Web. Solo loggea errores/warns. |

---

## Errores Predefinidos Disponibles

| Clase | Código | HTTP | Cuándo usarlo |
|---|---|---|---|
| `AppError` | `BAD_REQUEST` | 400 | Error de negocio genérico no categorizado |
| `AuthenticationError` | `UNAUTHORIZED` | 401 | Credenciales inválidas o sesión expirada |
| `NotFoundError` | `NOT_FOUND` | 404 | Recurso solicitado no existe en la DB |

Para agregar nuevos errores: ver **Paso 6** de esta guía.

---

## Qué NO hacer

| ❌ Incorrecto | ✅ Correcto |
|---|---|
| `const db = createDb(c.env.DB)` dentro del router | `const db = c.get("db")` |
| `try-catch` con `console.error` en el router o action | Dejar que `app.onError` lo capture |
| Definir mensajes de error en el Server Action web | Definir los mensajes en el `AppError` o en el action de API |
| `new Logger(...)` dentro de un action de API | El Logger se inyecta automáticamente vía `AppError` |
| Logs de `info` para rutas exitosas | No loggear rutas exitosas — solo `warn` y `error` |
