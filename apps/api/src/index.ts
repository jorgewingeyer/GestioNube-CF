import { Hono } from "hono";
import apiRouter from "./routers";
import { Env } from "./context";

const app = new Hono<{ Bindings: Env }>();

// Mount the API router
app.route("/api", apiRouter);

export default app;
