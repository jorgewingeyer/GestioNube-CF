import { Hono } from "hono";
import { listUsersAction } from "../../actions/users/listUsers.action";
import { Env, CustomVars } from "../../context";

export const listRouter = new Hono<{
  Bindings: Env;
  Variables: CustomVars;
}>().get("/", async (c) => {
  const db = c.get("db");
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
