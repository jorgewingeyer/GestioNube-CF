import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { registerUserAction } from "../../actions/auth/registerUser.action";
import { Env, CustomVars } from "../../context";

export const registerRouter = new Hono<{
  Bindings: Env;
  Variables: CustomVars;
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
    const db = c.get("db");
    
    const result = await registerUserAction(db, input);

    return c.json({
      success: true,
      message:
        "¡Bienvenido/a a bordo! Tu cuenta ha sido creada exitosamente. Estamos felices de tenerte aquí.",
      data: result,
    });
  },
);
