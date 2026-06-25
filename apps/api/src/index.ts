import { Hono } from "hono";
import apiRouter from "./routers";
import { Env, CustomVars } from "./context";
import { createDb } from "./db";
import { Logger } from "@repo/logger";
import { AppError } from "./errors";

const app = new Hono<{ Bindings: Env; Variables: CustomVars }>();

// Global middleware to inject DB and Logger context on every request
app.use("*", async (c, next) => {
  const connectionString = c.env.HYPERDRIVE?.connectionString;

  if (!connectionString) {
    throw new Error(
      "Hyperdrive connection string is missing. Check your wrangler.toml or Cloudflare dashboard configuration.",
    );
  }

  const db = createDb(connectionString);
  const logger = new Logger("API:Request");

  c.set("db", db);
  c.set("logger", logger);

  await next();
});

// Global Error Handler for Hono Router
app.onError((error, c) => {
  const logger = c.get("logger") || new Logger("API:GlobalError");
  const logContext = { file: "apps/api/src/index.ts", method: c.req.method, url: c.req.url };

  // 1. Handle known business application errors (already logged by their constructor)
  if (error instanceof AppError) {
    return c.json(
      {
        success: false,
        message: error.message,
        error: error.code,
      },
      error.statusCode as any
    );
  }

  // 2. Handle request schema validation errors
  if (error.name === "ZodError" || error.message.includes("validation")) {
    logger.warn("Validation error encountered", logContext, error);
    return c.json(
      {
        success: false,
        message: "Los datos provistos son inválidos o no cumplen con el formato requerido.",
        error: "VALIDATION_ERROR",
      },
      400
    );
  }

  // 3. Fallback for unhandled unexpected runtime crashes
  logger.error("Unhandled server crash during request execution", logContext, error);
  return c.json(
    {
      success: false,
      message: "Tuvimos un pequeño problema en nuestros servidores. Por favor, intenta de nuevo en unos momentos.",
      error: "INTERNAL_SERVER_ERROR",
    },
    500
  );
});

// Mount the API router
app.route("/api", apiRouter);

export default app;
