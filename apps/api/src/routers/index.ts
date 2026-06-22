import { Hono } from "hono";
import { authRouter } from "../modules/auth/auth.router";
import { usersRouter } from "../modules/users/users.router";

const app = new Hono().route("/auth", authRouter).route("/users", usersRouter);

export type AppType = typeof app;
export default app;
