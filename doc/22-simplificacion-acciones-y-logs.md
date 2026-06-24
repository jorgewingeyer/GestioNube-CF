# Simplificación de Server Actions y Logging Unificado

Este documento analiza la arquitectura actual de comunicación entre la aplicación Next.js (`apps/web`) y la API de Hono (`apps/api`), identifica redundancias y propone una solución para simplificar los Server Actions mediante un wrapper reutilizable y unificar el logging a través de un paquete compartido (`@repo/logger`) utilizable por la API, la web y futuros aplicativos. Asimismo, propone una serie de optimizaciones para los módulos (routers) y acciones de la API.

---

## 1. Análisis de la Situación Actual

### 1.1. Arquitectura de Comunicación
Actualmente, el flujo de datos y autenticación sigue estos pasos:
1. **Cliente (Componente React)**: Invoca un Server Action en el frontend (`apps/web/src/actions`).
2. **Server Action**: Realiza un `try-catch`, ejecuta la llamada a la API usando el cliente de Hono RPC (`api-client.ts`), valida el código HTTP, parsea la respuesta JSON, realiza tareas secundarias en el servidor de Next.js (como crear o borrar cookies de sesión) y retorna un objeto de tipo `ActionResponse<T>`.
3. **API (Hono + Drizzle)**: Procesa la solicitud a nivel de módulos y base de datos, captura excepciones y devuelve un JSON uniforme:
   ```json
   {
     "success": true | false,
     "message": "Mensaje amigable en español",
     "data": { ... } | null,
     "error": "Detalles técnicos del error (si aplica)"
   }
   ```
4. **Cliente**: Consume el resultado del Server Action, a menudo pasándolo a la utilidad `toasted` (`action-toast.ts`) para mostrar notificaciones flotantes automáticas.

### 1.2. Puntos de Dolor Identificados
- **Verbosidad y Duplicación de Código**: Cada Server Action (ej. `loginAction`, `registerAction`) requiere escribir un bloque `try-catch` completo, verificar de forma redundante si `res.ok` es verdadero, manejar errores HTTP de red, deserializar el JSON y estructurar el retorno de error de forma manual.
- **Mensajes de Error Inconsistentes**: Las Server Actions a veces redefinen sus propios mensajes de error ("Registration failed on server", "Lo sentimos, las credenciales..."). Esto fragmenta las fuentes de la verdad y duplica lógica, dificultando la depuración sobre qué capa del sistema generó el mensaje de error o la notificación.
- **Ausencia de un Sistema de Logging Unificado**: Se utiliza `console.error` de forma directa sin contexto estructurado. En desarrollo no hay diferenciación visual y en producción los logs de Cloudflare carecen de estructura estándar (JSON) para análisis masivo.
- **Manejo Manual y Repetitivo en la API**: Los routers de Hono instancian manualmente la base de datos (`createDb(c.env.DB)`) y envuelven su lógica de negocio en bloques `try-catch` locales en cada endpoint para dar formato al error. Esto genera código repetitivo y acopla los routers con la estructuración del error.

---

## 2. Propuesta de Solución

La solución consta de tres pilares principales:
1. **Wrapper Reutilizable para Server Actions (`apiAction`)**: que simplifique la estructura de Next.js, unifique el parseo y asegure que los mensajes de cara al usuario provengan directamente de la API. Con el fin de evitar ruidos innecesarios en producción, **no se registrará información sobre solicitudes exitosas (no hay logs de tipo `info` ni de ciclo de vida exitoso)**; únicamente se registrarán logs cuando ocurra un error o un comportamiento inesperado (`error` o `warn`).
2. **Paquete de Logger Compartido (`@repo/logger`)**: en la carpeta `packages/logger`, utilizable por `apps/api`, `apps/web` y cualquier otro aplicativo. Soporta un atributo de contexto dinámico (para especificar archivo, línea, método, etc.) y detectará el entorno para imprimir logs coloreados en desarrollo y JSON estructurado en producción de Cloudflare.
3. **Optimización de la API (Hono)**: Inyección de base de datos a través de middleware de contexto y un manejador global de errores (`app.onError`) con clases de error de negocio tipificadas (`AppError`). Esto remueve la necesidad de bloques `try-catch` en cada endpoint.

---

## 3. Implementación del Logger Compartido (`@repo/logger`)

Para que el Logger sea reutilizable por cualquier aplicación del Turborepo, se propone estructurarlo como un paquete local dentro de `packages/`.

### 3.1. Estructura de Archivos del Paquete
```
packages/logger/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

#### **tsconfig.json**
```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

#### **package.json**
```json
{
  "name": "@repo/logger",
  "version": "0.0.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "typescript": "^5.0.0"
  }
}
```

#### **src/index.ts (Clase Logger con JSDocs y Ejemplos)**
```typescript
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Context interface for logging metadata.
 * Allows tracking the origin of the log like file name, line number, or custom business properties.
 */
export interface LogContext {
  /** The filename where the log was triggered */
  file?: string;
  /** The line number in the source file */
  line?: number;
  /** Any other dynamic contextual properties */
  [key: string]: any;
}

/**
 * Standard structured logger designed to run across multiple environments:
 * - Local development: Prints readable, ANSI-colored formatted console logs.
 * - Cloudflare Workers: Outputs structured JSON for automated log indexing and search.
 *
 * @example
 * // Create a logger instance for a module
 * const logger = new Logger("API:Auth:Login");
 * 
 * // Log a warning when validation fails
 * logger.warn("Validation failed for user email", { file: "login.ts", line: 24, email: "user@example.com" });
 * 
 * // Log a critical error with raw exception details
 * try {
 *   await db.insert(...);
 * } catch (error) {
 *   logger.error("Failed to insert user to database", { file: "db.ts", line: 110 }, error);
 * }
 */
export class Logger {
  private serviceName: string;

  /**
   * Initializes a new Logger instance.
   * @param serviceName - The name of the application service or module (e.g. "API:Auth", "Web:ServerAction").
   */
  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Evaluates if the current execution is running in development mode.
   * @returns true if running in development or testing, false otherwise.
   */
  private checkIsDev(): boolean {
    if (typeof process !== "undefined" && process.env) {
      return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    }
    return true; // Fallback to dev if we can't determine
  }

  /**
   * Internal formatting and logging dispatcher.
   * Prints color logs to stdout in dev, and stringifies structured JSON in prod.
   * @param level - Severity level of the log.
   * @param message - Main descriptive message of the event.
   * @param context - Additional structured metadata.
   * @param args - Extra raw parameters or caught errors to include.
   */
  private log(level: LogLevel, message: string, context?: LogContext, ...args: any[]): void {
    const isDev = this.checkIsDev();
    const timestamp = new Date().toISOString();

    if (isDev) {
      // ANSI colors for readable terminal formatting in development
      const colors = {
        debug: "\x1b[36m", // Cyan
        info: "\x1b[32m",  // Green
        warn: "\x1b[33m",  // Yellow
        error: "\x1b[31m", // Red
      };
      const reset = "\x1b[0m";
      const color = colors[level] || reset;

      // Format contextual properties like [filename.ts:line] if provided
      const contextStr = context 
        ? ` [${context.file || ""}${context.line ? `:${context.line}` : ""}]`
        : "";

      console.log(
        `${color}[${timestamp}] [${level.toUpperCase()}] [${this.serviceName}]${contextStr}:${reset} ${message}`,
        context ? { ...context } : "",
        ...args
      );
      return;
    }

    // Structured JSON logging for production (Cloudflare Workers logs)
    const logData = {
      timestamp,
      level,
      serviceName: this.serviceName,
      message,
      context,
      details: args.length > 0 ? args : undefined,
    };

    if (level === "error") {
      console.error(JSON.stringify(logData));
      return;
    }
    
    if (level === "warn") {
      console.warn(JSON.stringify(logData));
      return;
    }

    console.log(JSON.stringify(logData));
  }

  /**
   * Logs events at the 'debug' level for local tracing.
   * @param message - Main event description.
   * @param context - Optional key-value metadata to append.
   * @param args - Additional parameters or error trace object.
   */
  debug(message: string, context?: LogContext, ...args: any[]): void {
    this.log("debug", message, context, ...args);
  }

  /**
   * Logs events at the 'info' level.
   * @param message - Main event description.
   * @param context - Optional key-value metadata to append.
   * @param args - Additional parameters or error trace object.
   */
  info(message: string, context?: LogContext, ...args: any[]): void {
    this.log("info", message, context, ...args);
  }

  /**
   * Logs warnings about unexpected business flow issues or schema validation errors.
   * @param message - Main event description.
   * @param context - Optional key-value metadata to append.
   * @param args - Additional parameters or error trace object.
   */
  warn(message: string, context?: LogContext, ...args: any[]): void {
    this.log("warn", message, context, ...args);
  }

  /**
   * Logs critical errors, server crashes, or API connection issues.
   * @param message - Main event description.
   * @param context - Optional key-value metadata to append.
   * @param args - Additional parameters or error trace object.
   */
  error(message: string, context?: LogContext, ...args: any[]): void {
    this.log("error", message, context, ...args);
  }
}
```

---

## 4. Implementación del Wrapper `apiAction`

Ubicación propuesta: `apps/web/src/actions/api-action.ts`.

Este wrapper procesará cualquier llamada de Hono RPC en el servidor de Next.js, capturando errores y abstrayendo el boilerplate repetitivo. **Solo se invocará al Logger cuando ocurra un error o advertencia**, evitando contaminar la terminal o los logs de producción en caminos de ejecución exitosos.

```typescript
import { ActionResponse } from "@/lib/utils/action-toast";
import { Logger } from "@repo/logger";

/**
 * Configuration options required to execute a Server Action securely.
 */
interface ApiActionOptions<T> {
  /** The asynchronous Hono RPC API call function execution (returns a Promise<Response>) */
  apiCall: () => Promise<Response>;
  /** Optional callback to process success data on the server side (e.g. cookie manipulation) */
  onSuccess?: (data: T) => Promise<void> | void;
  /** Context name of the Server Action for logging and identification */
  actionName: string;
}

/**
 * Wraps Hono RPC fetch calls inside Next.js Server Actions to centralize try-catch handling,
 * response JSON parsing, HTTP status validation, and unified logging.
 *
 * Establishes that user-facing success and failure messages originate solely from the API backend.
 * Only logs on failure (errors or warnings) to avoid polluting logs on successful executions.
 *
 * @example
 * // In apps/web/src/actions/auth/login-action.ts
 * export async function loginAction(data: LoginCredentials) {
 *   return apiAction({
 *     actionName: "login",
 *     apiCall: () => api.auth.login.$post({ json: data }),
 *     onSuccess: async (responseData) => {
 *       // Manage server session cookie safely on NextJS server
 *       await createSession(responseData.user.id);
 *     }
 *   });
 * }
 *
 * @param options - Parameters containing the API call function, the action context name, and onSuccess callback.
 * @returns A structured promise containing success status, friendly user message, and typed data/error details.
 */
export async function apiAction<T>({
  apiCall,
  onSuccess,
  actionName,
}: ApiActionOptions<T>): Promise<ActionResponse<T>> {
  const logger = new Logger("Web:ServerAction");
  const logContext = { file: "api-action.ts", actionName };

  try {
    const response = await apiCall();

    // 1. Check HTTP level errors (e.g. 500 Internal Error, 404 Not Found)
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`HTTP error returned. Status: ${response.status}`, logContext, errorText);

      // Attempt to parse if the backend returned structured error in JSON format
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson && typeof errorJson === "object" && "message" in errorJson) {
          return {
            success: false,
            message: errorJson.message,
            error: errorJson.error || `HTTP ${response.status}`,
          };
        }
      } catch {
        // Fallback to default response if parsing fails
      }

      return {
        success: false,
        message: "No se pudo procesar la solicitud en el servidor. Por favor, intenta de nuevo.",
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    // 2. Parse response JSON safely
    const json = await response.json();

    // 3. Check application business-level failure (e.g. authentication failed, invalid states)
    if (!json.success) {
      logger.warn("API request failed validation/business logic", logContext, json.message || json.error);
      return {
        success: false,
        message: json.message || "La operación no se pudo completar.",
        error: json.error,
      };
    }

    // 4. Run secondary server-side callbacks (such as createSession)
    if (onSuccess) {
      await onSuccess(json.data);
    }

    // Notice that there is no logger.info() here if everything is successful, as requested.
    return {
      success: true,
      message: json.message,
      data: json.data as T,
    };
  } catch (error) {
    // 5. Catch unexpected runtime crashes
    logger.error("Unexpected crash during action execution", logContext, error);

    return {
      success: false,
      message: "Ocurrió un error inesperado al procesar la solicitud. Por favor, intenta de nuevo.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

---

## 5. Comparativa de Implementación (Antes vs. Después)

### 5.1. Vinculación en `package.json`
Para utilizar el logger en `apps/api` o `apps/web`, simplemente se agrega al bloque `dependencies`:
```json
"dependencies": {
  "@repo/logger": "workspace:*"
}
```

### 5.2. Uso en Server Actions (`apps/web/src/actions/auth/login-action.ts`)

#### **Antes**
```typescript
"use server";

import { api } from "@/lib/api-client";
import { createSession } from "@/lib/session";
import { z } from "zod";
import { loginSchema } from "@/app/(auth)/login/schemas/login-schema";

export async function loginAction(data: z.infer<typeof loginSchema>) {
  try {
    const res = await api.auth.login.$post({ json: data });
    const response = await res.json();

    if (!response.success || !("data" in response)) {
      return {
        success: false,
        message: response.error,
      };
    }

    await createSession(response.data.user.id);

    return { success: true, message: response.message };
  } catch (error) {
    console.error("Login action error:", error);
    return {
      success: false,
      message:
        "Lo sentimos, las credenciales ingresadas no son válidas o ha ocurrido un error en el servidor. Por favor, intenta nuevamente.",
    };
  }
}
```

#### **Después**
```typescript
"use server";

import { api } from "@/lib/api-client";
import { createSession } from "@/lib/session";
import { z } from "zod";
import { loginSchema } from "@/app/(auth)/login/schemas/login-schema";
import { apiAction } from "../api-action";

export async function loginAction(data: z.infer<typeof loginSchema>) {
  return apiAction({
    actionName: "login",
    apiCall: () => api.auth.login.$post({ json: data }),
    onSuccess: async (data: any) => {
      await createSession(data.user.id);
    },
  });
}
```

---

## 6. Optimización en la API (Modules y Actions)

Para evitar duplicar la instanciación de base de datos y la gestión de bloques `try-catch` con formato JSON en cada endpoint de Hono, se sugieren las siguientes optimizaciones estructurales en la API:

### 6.1. Inyección de Base de Datos mediante Middleware de Contexto
En lugar de instanciar la base de datos manualmente en cada endpoint (`const db = createDb(c.env.DB)`), podemos inyectarla al inicio de la petición utilizando un middleware central en `apps/api/src/index.ts`.

#### **Definición de Variables en Hono Context**
```typescript
import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./db/schema";
import { Logger } from "@repo/logger";

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

// Custom variables accessible via c.get("db") / c.get("logger")
export interface CustomVars {
  db: DrizzleD1Database<typeof schema>;
  logger: Logger;
}
```

#### **Middleware de Inyección (`apps/api/src/index.ts`)**
```typescript
import { Hono } from "hono";
import { createDb } from "./db";
import { Logger } from "@repo/logger";
import { Env, CustomVars } from "./context";
import apiRouter from "./routers";

const app = new Hono<{ Bindings: Env; Variables: CustomVars }>();

// Inject DB and Logger once per request
app.use("*", async (c, next) => {
  const db = createDb(c.env.DB);
  const logger = new Logger("API:Request");
  
  c.set("db", db);
  c.set("logger", logger);
  
  await next();
});

app.route("/api", apiRouter);

export default app;
```

---

### 6.2. Clase de Excepciones del Negocio (`AppError`)
Creamos una clase base para modelar los errores esperados (validación, autenticación, recursos faltantes) de modo que lleven el código HTTP y el mensaje directamente desde el Action sin forzar strings rígidos.

Ubicación propuesta: `apps/api/src/lib/errors.ts`.

```typescript
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode = 400, code = "BAD_REQUEST", details?: any) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Credenciales incorrectas") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404, "NOT_FOUND");
  }
}
```

---

### 6.3. Manejador Global de Errores Hono (`app.onError`)
Al implementar un interceptor de excepciones centralizado en la API, eliminamos la necesidad de escribir bloques `try-catch` en cada endpoint de módulo.

#### **Configuración en `apps/api/src/index.ts`**
```typescript
import { AppError } from "./lib/errors";

app.onError((error, c) => {
  const logger = c.get("logger") || new Logger("API:GlobalError");
  const logContext = { file: "apps/api/src/index.ts", method: c.req.method, url: c.req.url };

  // 1. Check if it is a known business application error
  if (error instanceof AppError) {
    logger.warn(`Application Error: ${error.message} (Code: ${error.code})`, logContext, error.details);
    return c.json({
      success: false,
      message: error.message,
      error: error.code,
    }, error.statusCode as any);
  }

  // 2. Check for validation errors (e.g. Zod validators)
  if (error.name === "ZodError" || error.message.includes("validation")) {
    logger.warn("Validation error encountered", logContext, error);
    return c.json({
      success: false,
      message: "Los datos provistos son inválidos o no cumplen con el formato requerido.",
      error: "VALIDATION_ERROR",
    }, 400);
  }

  // 3. Fallback for unhandled unexpected server crashes (e.g. database disconnect)
  logger.error("Unhandled server crash during request execution", logContext, error);
  return c.json({
    success: false,
    message: "Tuvimos un pequeño problema en nuestros servidores. Por favor, intenta de nuevo en unos momentos.",
    error: "INTERNAL_SERVER_ERROR",
  }, 500);
});
```

---

### 6.4. Resultado: Módulos y Actions de la API Simplificados

#### **Action Optimizada (`loginUser.action.ts`)**
Las acciones lanzan excepciones de tipo `AppError` en lugar de la clase genérica `Error`, especificando la semántica correcta del fallo.
```typescript
import { AuthenticationError } from "../../lib/errors";
// ...

export const loginUserAction = async (
  db: DrizzleD1Database<typeof schema>,
  input: { email: string; password: string },
  jwtSecret: string
) => {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .get();

  // Custom AppError thrown directly. No need for the caller to parse strings.
  if (!user) {
    throw new AuthenticationError(
      "Lo sentimos, el correo o la contraseña son incorrectos. Por favor, verifica tus datos e inténtalo de nuevo."
    );
  }

  const isValid = await verifyPassword(input.password, user.password);
  if (!isValid) {
    throw new AuthenticationError(
      "Lo sentimos, el correo o la contraseña son incorrectos. Por favor, verifica tus datos e inténtalo de nuevo."
    );
  }

  const token = await signJWT({ sub: user.id.toString(), email: user.email }, jwtSecret);
  return { token, user: { id: user.id, email: user.email } };
};
```

#### **Router Optimizado (`login.ts`)**
El router ya no tiene try-catch ni maneja lógica de formateo JSON en caso de error. Solo describe el éxito y delega el error al middleware central.
```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginUserAction } from "../../actions/auth/loginUser.action";
import { loginSchema } from "./schemas"; // o import local
import { CustomVars, Env } from "../../context";

export const loginRouter = new Hono<{ Bindings: Env; Variables: CustomVars }>().post(
  "/",
  zValidator("json", loginSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db"); // Injected by middleware
    const jwtSecret = c.env.JWT_SECRET || "fallback-secret-key";

    const result = await loginUserAction(db, input, jwtSecret);

    return c.json({
      success: true,
      message: "¡Qué alegría verte de nuevo! Has iniciado sesión correctamente.",
      data: result,
    });
  }
);
```

---

---

## 7. Beneficios Clave
1. **Reducción de Boilerplate (DRY)**: El código duplicado de try/catch, validación de HTTP y deserialización de JSON se reduce de ~30 líneas a 0 por cada nueva Server Action y ruta de API.
2. **Propagación Directa de Mensajes**: Todos los mensajes de éxito/error provienen de una única fuente de verdad (la API de Hono). Ya no habrá discrepancias entre lo que la API decide informar y lo que el Server Action redefine.
3. **Logger con Trazabilidad Compartida y Contextual**: Cualquier aplicativo del monorepo (`apps/api`, `apps/web` o futuros proyectos) puede instanciar el Logger. Soporta un atributo de contexto para rastrear el archivo (`file`) y la línea (`line`), facilitando la depuración en entornos Cloudflare y locales.
4. **Cero Ruido (Logs Silenciosos en Rutas Exitosas)**: El logger no contamina con logs de información rutinaria. Solo se genera actividad en consola/disco cuando un error de red, validación o backend ocurre, optimizando recursos y facilitando la búsqueda de problemas.
5. **Errores de Negocio Autocontenidos**: Cada clase de error encapsula su propio logging al construirse, evitando que el consumidor deba recordar loggear por separado.

---

## 8. Organización de Errores de Negocio por Archivo (`apps/api/src/errors/`)

Cada clase de error personalizado vive en su propio archivo dentro de `apps/api/src/errors/`. Esto facilita la búsqueda, extensión futura y mantiene una separación clara de responsabilidades. Cada error **loggea automáticamente en su constructor** a través de `@repo/logger`, por lo que el `app.onError` no necesita volver a emitir logs para errores de negocio conocidos.

### 8.1. Estructura de la Carpeta
```
apps/api/src/errors/
├── index.ts                  # Barrel de re-exportación
├── app-error.ts              # Clase base AppError (loggea en constructor)
├── authentication-error.ts   # 401 UNAUTHORIZED
└── not-found-error.ts        # 404 NOT_FOUND
```

### 8.2. Clase Base con Auto-Logging (`app-error.ts`)
```typescript
import { Logger } from "@repo/logger";

/**
 * Base class for all application-specific business logic errors.
 * Automatically logs its own instantiation using the shared Logger.
 */
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode = 400, code = "BAD_REQUEST", details?: any) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Automatically log the application error occurrence at the point of creation
    const logger = new Logger(`API:Error:${this.name}`);
    logger.warn(`${code}: ${message}`, { details });
  }
}
```

### 8.3. Error de Autenticación (`authentication-error.ts`)
```typescript
import { AppError } from "./app-error";

/**
 * Thrown when credentials validation fails or user session is unauthorized.
 */
export class AuthenticationError extends AppError {
  constructor(message = "Credenciales incorrectas") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "AuthenticationError";
  }
}
```

### 8.4. Error de Recurso No Encontrado (`not-found-error.ts`)
```typescript
import { AppError } from "./app-error";

/**
 * Thrown when a requested resource is not found.
 */
export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}
```

### 8.5. Barrel de Exportación (`index.ts`)
```typescript
export * from "./app-error";
export * from "./authentication-error";
export * from "./not-found-error";
```

### 8.6. Cómo Agregar un Nuevo Error en el Futuro
Al necesitar un nuevo tipo de error de negocio, simplemente:
1. Crear `apps/api/src/errors/nuevo-error.ts` extendiendo `AppError`.
2. Agregar la re-exportación al `index.ts`.
3. Lanzarlo desde el action correspondiente: `throw new NuevoError("mensaje")`.

No es necesario configurar nada en el `app.onError`, ya que el manejo e incluso el logging ya están cubiertos centralmente.

