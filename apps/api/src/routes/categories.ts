import { Hono } from "hono";
import type { Db } from "../db/client.js";
import { categories } from "../db/schema.js";

// Las categorías —con su color fijo— son dato del server, no una lista copiada
// en el front. Ese color tiene que ser el mismo en la lista, en el desglose y
// en el gráfico, y eso sólo se garantiza si sale de un solo lugar.
export function categoryRoutes(db: Db) {
  const app = new Hono();
  app.get("/", async (c) => c.json(await db.select().from(categories)));
  return app;
}
