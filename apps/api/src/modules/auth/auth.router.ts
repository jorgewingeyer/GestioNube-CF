import { Hono } from "hono";
import { registerRouter } from "./register";
import { loginRouter } from "./login";

export const authRouter = new Hono()
  .route("/login", loginRouter)
  .route("/register", registerRouter);
