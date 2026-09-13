import { Hono } from "hono";
import type { Db } from "./db/client.js";
import { installmentRoutes } from "./routes/installments.js";

export function buildApp(db: Db) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/installment-plans", installmentRoutes(db));

  return app;
}
