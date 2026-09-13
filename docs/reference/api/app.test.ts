// Tests de integración por FLUJO (PLAN.md #7): Postgres real vía Testcontainers,
// sin mocks. Un contenedor para toda la suite; requiere Docker corriendo.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { isoDate, parseLocalDate } from "@chirola/domain";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createDb, type Db } from "./db/client.js";
import { seedSystemCategories } from "./db/seed.js";
import { todayInBuenosAires } from "./time.js";

let container: StartedPostgreSqlContainer;
let db: Db;
let pool: { end: () => Promise<void> };
let app: Awaited<ReturnType<typeof buildApp>>;

const HOY = isoDate(todayInBuenosAires());
const AYER = isoDate(new Date(parseLocalDate(HOY).getTime() - 86400000));
const PASADO_MANANA = isoDate(new Date(parseLocalDate(HOY).getTime() + 2 * 86400000));

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  ({ db, pool } = createDb(container.getConnectionUri()));
  const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
  await migrate(db, { migrationsFolder });
  await seedSystemCategories(db);
  app = await buildApp(db);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await container?.stop();
});

async function crear(body: Record<string, unknown>) {
  const res = await app.inject({ method: "POST", url: "/movements", payload: body });
  return { status: res.statusCode, body: res.json() };
}

describe("regla de nacimiento (§2)", () => {
  it("fecha de hoy o pasada nace CONFIRMED; futura nace PENDING", async () => {
    const hoy = await crear({
      type: "EXPENSE",
      amount: 150_000,
      description: "Café",
      category: "comida",
      date: HOY,
    });
    expect(hoy.status).toBe(201);
    expect(hoy.body.status).toBe("CONFIRMED");

    const futuro = await crear({
      type: "EXPENSE",
      amount: 990_000,
      description: "Factura de luz",
      category: "servicios",
      date: PASADO_MANANA,
    });
    expect(futuro.body.status).toBe("PENDING");
  });

  it("un status colado en el body no viaja: el server decide", async () => {
    const res = await crear({
      type: "INCOME",
      amount: 100,
      description: "x",
      category: "otros",
      date: PASADO_MANANA,
      status: "CONFIRMED",
    });
    expect(res.body.status).toBe("PENDING");
  });
});

describe("edición no retroactiva (§2)", () => {
  it("rechaza mover un CONFIRMADO a fecha futura, con problem+json", async () => {
    const creado = await crear({
      type: "EXPENSE",
      amount: 5000,
      description: "Almuerzo",
      category: "comida",
      date: AYER,
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/movements/${creado.body.id}`,
      payload: { date: PASADO_MANANA },
    });
    expect(res.statusCode).toBe(422);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });
});

describe("confirmar / revertir en lote (undo)", () => {
  it("confirma solo los PENDING y revertir los vuelve a PENDING", async () => {
    const a = await crear({
      type: "EXPENSE",
      amount: 1000,
      description: "Pendiente A",
      category: "otros",
      date: PASADO_MANANA,
    });
    const b = await crear({
      type: "EXPENSE",
      amount: 2000,
      description: "Ya confirmado",
      category: "otros",
      date: AYER,
    });
    const confirm = await app.inject({
      method: "POST",
      url: "/movements/confirm",
      payload: { ids: [a.body.id, b.body.id] },
    });
    expect(confirm.json().changed).toBe(1); // b ya estaba CONFIRMED

    const revert = await app.inject({
      method: "POST",
      url: "/movements/revert",
      payload: { ids: [a.body.id] },
    });
    expect(revert.json().changed).toBe(1);
  });

  it("deshacer un alta = DELETE; repetirlo da 404", async () => {
    const creado = await crear({
      type: "EXPENSE",
      amount: 700,
      description: "Borrable",
      category: "otros",
      date: HOY,
    });
    const del = await app.inject({ method: "DELETE", url: `/movements/${creado.body.id}` });
    expect(del.statusCode).toBe(204);
    const again = await app.inject({ method: "DELETE", url: `/movements/${creado.body.id}` });
    expect(again.statusCode).toBe(404);
  });
});

describe("listado con filtros server-side", () => {
  it("filtra por mes, estado y búsqueda accent-insensitive", async () => {
    await crear({
      type: "EXPENSE",
      amount: 3000,
      description: "Café especial",
      category: "comida",
      date: HOY,
    });
    const [y, m] = [Number(HOY.slice(0, 4)), Number(HOY.slice(5, 7)) - 1];
    const res = await app.inject({
      method: "GET",
      url: `/movements?year=${y}&month=${m}&q=cafe&status=CONFIRMED`,
    });
    const list = res.json() as { description: string; status: string }[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((mv) => mv.status === "CONFIRMED")).toBe(true);
    expect(list.some((mv) => mv.description.includes("Café"))).toBe(true);
  });
});

describe("reports", () => {
  it("/reports/inicio compone libre = received − spent − toPay", async () => {
    const res = await app.inject({ method: "GET", url: "/reports/inicio" });
    const inicio = res.json();
    expect(inicio.libre).toBe(inicio.received - inicio.spent - inicio.toPay);
  });

  it("/reports/month devuelve el resumen del mes", async () => {
    const [y, m] = [Number(HOY.slice(0, 4)), Number(HOY.slice(5, 7)) - 1];
    const res = await app.inject({ method: "GET", url: `/reports/month?year=${y}&month=${m}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().spent).toBeGreaterThan(0);
  });
});

describe("categorías", () => {
  it("las de sistema existen y no se borran", async () => {
    const list = await app.inject({ method: "GET", url: "/categories" });
    const cats = list.json() as { id: string; isSystem: boolean }[];
    expect(cats.some((c) => c.id === "otros" && c.isSystem)).toBe(true);
    const del = await app.inject({ method: "DELETE", url: "/categories/otros" });
    expect(del.statusCode).toBe(422);
  });

  it("borrar una propia reasigna sus movimientos a otros", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/categories",
      payload: { name: "Mascotas" },
    });
    const catId = created.json().id as string;
    const m = await crear({
      type: "EXPENSE",
      amount: 4000,
      description: "Alimento gato",
      category: catId,
      date: HOY,
    });
    const del = await app.inject({ method: "DELETE", url: `/categories/${catId}` });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({ method: "GET", url: `/movements?q=alimento` });
    const row = (after.json() as { id: string; category: string }[]).find(
      (x) => x.id === m.body.id,
    );
    expect(row?.category).toBe("otros");
  });
});

describe("salud y docs", () => {
  it("healthz, readyz, metrics y docs responden", async () => {
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/readyz" })).statusCode).toBe(200);
    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    expect(metrics.body).toContain("process_cpu");
    expect((await app.inject({ method: "GET", url: "/docs" })).statusCode).toBeLessThan(400);
  });
});
