// Tests de integración del alta de cuotas: SQLite real en memoria, sin mocks y
// sin Docker. Lo que se verifica acá no es que la ruta responda 201, sino que
// lo PERSISTIDO cumpla el modelo — que es donde Chirola se rompía.

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "./app.js";
import { createDb, type Db } from "./db/client.js";
import { movements, installmentPlans } from "./db/schema.js";
import { seedSystemCategories } from "./db/seed.js";

let db: Db;
let app: ReturnType<typeof buildApp>;

beforeEach(async () => {
  const created = await createDb(":memory:");
  db = created.db;
  await seedSystemCategories(db);
  app = buildApp(db);
});

const post = (body: unknown) =>
  app.request("/installment-plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const NETFLIX = {
  type: "EXPENSE" as const,
  description: "Netflix anual",
  category: "ocio",
  totalAmount: 74_400_00,
  installmentCount: 12,
  startDate: "2026-09-05",
};

describe("POST /installment-plans", () => {
  it("crea el plan y sus N cuotas, y la suma de las cuotas ES el total", async () => {
    const res = await post(NETFLIX);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.plan.installmentCount).toBe(12);
    expect(body.installments).toHaveLength(12);

    const suma = body.installments.reduce((a: number, i: { amount: number }) => a + i.amount, 0);
    expect(suma).toBe(NETFLIX.totalAmount);
  });

  it("persiste las cuotas ligadas al plan por id", async () => {
    const body = await (await post(NETFLIX)).json();
    const rows = await db.select().from(movements).where(eq(movements.installmentId, body.plan.id));

    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.categoryId === "ocio")).toBe(true);
    expect(rows.every((r) => r.description === "Netflix anual")).toBe(true);
  });

  it("reparte el resto en la PRIMERA cuota, nunca en la última (§1)", async () => {
    // 100.000,00 en 3 no es divisible: 33.333,34 + 33.333,33 + 33.333,33.
    const body = await (
      await post({ ...NETFLIX, totalAmount: 100_000_00, installmentCount: 3 })
    ).json();

    const montos = body.installments.map((i: { amount: number }) => i.amount);
    expect(montos).toEqual([3_333_334, 3_333_333, 3_333_333]);
  });

  it("numera las cuotas por fecha y las genera una por mes", async () => {
    const body = await (await post(NETFLIX)).json();
    const fechas = body.installments.map((i: { date: string }) => i.date);

    expect(fechas[0]).toBe("2026-09-05");
    expect(fechas[1]).toBe("2026-10-05");
    expect(fechas[11]).toBe("2027-08-05");
    expect([...fechas]).toEqual([...fechas].sort());
    expect(body.installments.map((i: { number: number }) => i.number)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
  });

  it("clampea el día 31 al último día de los meses cortos", async () => {
    const body = await (
      await post({ ...NETFLIX, startDate: "2026-01-31", installmentCount: 4 })
    ).json();
    const fechas = body.installments.map((i: { date: string }) => i.date);

    expect(fechas).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("una compra que empezó hace meses nace con las cuotas viejas confirmadas y el resto pendiente (§2)", async () => {
    // startDate muy en el pasado: los meses CERRADOS son hechos registrables.
    const body = await (
      await post({ ...NETFLIX, startDate: "2020-01-10", installmentCount: 6 })
    ).json();

    const estados = body.installments.map((i: { status: string }) => i.status);
    expect(estados.every((s: string) => s === "CONFIRMED")).toBe(true);
  });

  it("las cuotas futuras nacen pendientes aunque el día ya haya pasado", async () => {
    const dentroDeUnAnio = new Date();
    dentroDeUnAnio.setFullYear(dentroDeUnAnio.getFullYear() + 1);
    const iso = dentroDeUnAnio.toISOString().slice(0, 10);

    const body = await (await post({ ...NETFLIX, startDate: iso, installmentCount: 3 })).json();
    const estados = body.installments.map((i: { status: string }) => i.status);
    expect(estados).toEqual(["PENDING", "PENDING", "PENDING"]);
  });

  it("un plan en cuotas de ingresos nace todo pendiente: nada se acredita por almanaque", async () => {
    const body = await (
      await post({ ...NETFLIX, type: "INCOME", startDate: "2020-01-10", installmentCount: 3 })
    ).json();

    const estados = body.installments.map((i: { status: string }) => i.status);
    expect(estados).toEqual(["PENDING", "PENDING", "PENDING"]);
  });
});

describe("POST /installment-plans · rechazos", () => {
  it("rechaza una sola cuota: eso es un movimiento suelto, no un plan", async () => {
    const res = await post({ ...NETFLIX, installmentCount: 1 });
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.errors?.[0]?.path).toBe("installmentCount");
  });

  it("rechaza un monto con decimales: la unidad interna es el centavo entero (§1)", async () => {
    const res = await post({ ...NETFLIX, totalAmount: 1234.56 });
    expect(res.status).toBe(422);
  });

  it("rechaza un total de cero o negativo", async () => {
    expect((await post({ ...NETFLIX, totalAmount: 0 })).status).toBe(422);
    expect((await post({ ...NETFLIX, totalAmount: -5000 })).status).toBe(422);
  });

  it("rechaza una categoría que no existe, con el motivo", async () => {
    const res = await post({ ...NETFLIX, category: "no-existe" });
    expect(res.status).toBe(422);
    expect((await res.json()).title).toContain("no-existe");
  });

  it("rechaza una fecha que no es una fecha contable", async () => {
    expect((await post({ ...NETFLIX, startDate: "2026-13-45" })).status).toBe(422);
    expect((await post({ ...NETFLIX, startDate: "ayer" })).status).toBe(422);
  });

  it("no deja nada a medias cuando rechaza", async () => {
    await post({ ...NETFLIX, category: "no-existe" });
    expect(await db.select().from(installmentPlans)).toHaveLength(0);
    expect(await db.select().from(movements)).toHaveLength(0);
  });

  it("responde en formato problem+json", async () => {
    const res = await post({ ...NETFLIX, installmentCount: 1 });
    expect(res.headers.get("content-type")).toContain("application/problem+json");

    const body = await res.json();
    expect(body.status).toBe(422);
    expect(body.title).toBeTruthy();
  });
});

describe("GET /installment-plans", () => {
  it("lista los planes creados", async () => {
    await post(NETFLIX);
    await post({ ...NETFLIX, description: "Heladera", category: "vivienda", installmentCount: 6 });

    const body = await (await app.request("/installment-plans")).json();
    expect(body).toHaveLength(2);
    expect(body.map((p: { description: string }) => p.description).sort()).toEqual([
      "Heladera",
      "Netflix anual",
    ]);
  });

  it("arranca vacío", async () => {
    expect(await (await app.request("/installment-plans")).json()).toEqual([]);
  });
});
