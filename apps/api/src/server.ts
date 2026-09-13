import { serve } from "@hono/node-server";
import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { seedSystemCategories } from "./db/seed.js";

const file = process.env.ACCRUE_DB ?? "accrue.db";
const port = Number(process.env.PORT ?? 3000);

const { db } = await createDb(file);
await seedSystemCategories(db);

serve({ fetch: buildApp(db).fetch, port }, (info) => {
  console.log(`accrue api · http://localhost:${info.port} · db: ${file}`);
});
