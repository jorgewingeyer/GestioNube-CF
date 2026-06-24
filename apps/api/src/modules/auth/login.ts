import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { loginUserAction } from "../../actions/auth/loginUser.action";
import { Env, CustomVars } from "../../context";

export const loginRouter = new Hono<{
  Bindings: Env;
  Variables: CustomVars;
}>().post(
  "/",
  zValidator(
    "json",
    z.object({ email: z.string().email(), password: z.string() }),
  ),
  async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const jwtSecret = c.env.JWT_SECRET || "super-secret-jwt-key-change-this";
    
    const result = await loginUserAction(db, input, jwtSecret);

    return c.json({
      success: true,
      message: "¡Qué alegría verte de nuevo! Has iniciado sesión correctamente.",
      data: result,
    });
  },
);
