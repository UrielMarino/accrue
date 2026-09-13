// Seed idempotente del catálogo de sistema: corre en cada `migrate`.

import type { Db } from "./client.js";
import { categories } from "./schema.js";
import { SYSTEM_CATEGORIES } from "./seed-categories.js";

export async function seedSystemCategories(db: Db): Promise<void> {
  await db
    .insert(categories)
    .values(SYSTEM_CATEGORIES.map((c) => ({ ...c, isSystem: true })))
    .onConflictDoNothing({ target: categories.id });
}
