import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, "..", "..", "migrations");

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Abre la base, la migra y la deja lista.
 *
 * Va sobre libSQL, que es SQLite con binarios precompilados: `pnpm install` no
 * compila nada y no quedamos atados a que alguien publique un binario nuevo por
 * cada versión de Node. (`better-sqlite3` no tiene prebuild para Node 25 y
 * compilarlo falla; `node:sqlite` todavía no tiene driver publicado en Drizzle.)
 *
 * `path` es el archivo; `":memory:"` da una base efímera, que es lo que usan los
 * tests — por eso no necesitan Docker ni limpieza entre corridas.
 *
 * `foreign_keys` está APAGADO por defecto en SQLite: sin encenderlo, las FK del
 * schema serían decorativas.
 */
export async function createDb(path = ":memory:") {
  const url = path === ":memory:" ? ":memory:" : `file:${path}`;
  const client = createClient({ url });
  await client.execute("PRAGMA foreign_keys = ON");

  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });

  return { db, close: () => client.close() };
}
