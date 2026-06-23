import { Hono } from "hono";
import { listUsersAction } from "../../actions/users/listUsers.action";
import { createDb } from "../../db";

export const listRouter = new Hono<{
  Bindings: { DB: D1Database };
}>().get("/", async (c) => {
  const db = createDb(c.env.DB);
  try {
    const result = await listUsersAction(db);
    return c.json({
      success: true,
      message: "Hemos recuperado la lista de usuarios correctamente.",
      data: result,
    });
  } catch (e) {
    return c.json(
      {
        success: false,
        message:
          "No pudimos recuperar la lista de usuarios en este momento. Por favor, intenta recargar la página.",
        error: e instanceof Error ? e.message : "Error desconocido",
      },
      500,
    );
  }
});
