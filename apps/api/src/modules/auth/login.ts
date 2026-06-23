import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { loginUserAction } from "../../actions/auth/loginUser.action";
import { createDb } from "../../db";

export const loginRouter = new Hono<{
  Bindings: { DB: D1Database; JWT_SECRET?: string };
}>().post(
  "/",
  zValidator(
    "json",
    z.object({ email: z.string().email(), password: z.string() }),
  ),
  async (c) => {
    const input = c.req.valid("json");
    const db = createDb(c.env.DB);
    try {
      const jwtSecret = c.env.JWT_SECRET || "super-secret-jwt-key-change-this";
      const result = await loginUserAction(db, input, jwtSecret);

      return c.json({
        success: true,
        message:
          "¡Qué alegría verte de nuevo! Has iniciado sesión correctamente.",
        data: result,
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          message:
            "No pudimos acceder a tu cuenta. Por favor, verifica que tu correo y contraseña sean correctos e inténtalo de nuevo.",
          error: e instanceof Error ? e.message : "Error desconocido",
        },
        401,
      );
    }
  },
);
