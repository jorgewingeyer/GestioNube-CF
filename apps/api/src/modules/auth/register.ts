import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { registerUserAction } from "../../actions/auth/registerUser.action";
import { createDb } from "../../db";

export const registerRouter = new Hono<{
  Bindings: { DB: D1Database };
}>().post(
  "/",
  zValidator(
    "json",
    z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
    }),
  ),
  async (c) => {
    const input = c.req.valid("json");
    const db = createDb(c.env.DB);
    try {
      const result = await registerUserAction(db, input);

      return c.json({
        success: true,
        message:
          "¡Bienvenido/a a bordo! Tu cuenta ha sido creada exitosamente. Estamos felices de tenerte aquí.",
        data: result,
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          message:
            e instanceof Error && e.message === "Este correo electrónico ya se encuentra registrado en nuestro sistema."
              ? "Vaya, parece que este correo electrónico ya está registrado. ¿Quizás quisiste iniciar sesión?"
              : "Tuvimos un pequeño problema al crear tu cuenta. Por favor, inténtalo de nuevo en unos momentos.",
          error: e instanceof Error ? e.message : "Error desconocido",
        },
        400,
      );
    }
  },
);
