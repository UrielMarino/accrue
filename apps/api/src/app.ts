import { Hono } from "hono";
import type { Db } from "./db/client.js";
import { categoryRoutes } from "./routes/categories.js";
import { installmentRoutes } from "./routes/installments.js";
import { movementRoutes } from "./routes/movements.js";

export function buildApp(db: Db) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/categories", categoryRoutes(db));
  app.route("/movements", movementRoutes(db));
  app.route("/installment-plans", installmentRoutes(db));

  return app;
}
