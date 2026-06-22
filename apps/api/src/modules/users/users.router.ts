import { Hono } from "hono";
import { listRouter } from "./list";

export const usersRouter = new Hono()
  .route("/list", listRouter);
