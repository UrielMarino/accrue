import { buildInstallmentPurchase } from "@accrue/domain";
import { createInstallmentPlanSchema, type InstallmentPlanCreatedDto } from "@accrue/contracts";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/client.js";
import { categories, installmentPlans, movements } from "../db/schema.js";
import { newId } from "../id.js";
import { problem } from "../problem.js";
import { todayInBuenosAires } from "../time.js";

export function installmentRoutes(db: Db) {
  const app = new Hono();

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createInstallmentPlanSchema.safeParse(body);
    if (!parsed.success) {
      return problem(c, 422, "El alta del plan es inválida", parsed.error.issues);
    }
    const input = parsed.data;

    // La categoría tiene que existir: la FK lo impediría igual, pero un 422 con
    // el motivo es mejor que un error de constraint en la cara del cliente.
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, input.category))
      .limit(1);
    if (!category) {
      return problem(c, 422, `La categoría "${input.category}" no existe`);
    }

    // El reparto y los estados de nacimiento salen del dominio (§1, §2, §5).
    // Esta ruta no calcula plata: arma el input, persiste lo que devuelve el
    // comando y lo lee de vuelta.
    const purchase = buildInstallmentPurchase(
      {
        type: input.type,
        description: input.description,
        category: input.category,
        totalAmount: input.totalAmount,
        installmentCount: input.installmentCount,
        startDate: input.startDate,
      },
      todayInBuenosAires(),
    );

    const planId = newId();
    const createdAt = new Date().toISOString();

    // Todo en una transacción: un plan sin sus cuotas es una mentira sobre
    // cuánto se debe, y la mitad de las cuotas es peor que ninguna.
    const rows = await db.transaction(async (tx) => {
      await tx
        .insert(installmentPlans)
        .values({
          id: planId,
          description: purchase.plan.description,
          totalAmount: purchase.plan.totalAmount,
          installmentCount: purchase.plan.installmentCount,
          paidCount: purchase.plan.paidCount,
          startDate: purchase.plan.startDate,
          status: purchase.plan.status,
          createdAt,
        });

      const toInsert = purchase.movements.map((m) => ({
        id: newId(),
        type: m.type,
        amount: m.amount,
        description: m.description,
        categoryId: input.category,
        status: m.status,
        date: m.date,
        createdAt,
        installmentId: planId,
      }));
      await tx.insert(movements).values(toInsert);
      return toInsert;
    });

    // Las cuotas se numeran por fecha, que es la misma numeración que los
    // rótulos "Cuota i/N" muestran en pantalla. Numerar por orden de inserción
    // daría lo mismo hoy y dejaría de darlo el día que se reordene algo.
    const installments = rows
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((m, i) => ({
        id: m.id,
        number: i + 1,
        amount: m.amount,
        date: m.date,
        status: m.status,
      }));

    const payload: InstallmentPlanCreatedDto = {
      plan: {
        id: planId,
        description: purchase.plan.description,
        totalAmount: purchase.plan.totalAmount,
        installmentCount: purchase.plan.installmentCount,
        paidCount: purchase.plan.paidCount,
        startDate: purchase.plan.startDate,
        status: purchase.plan.status,
      },
      installments,
    };

    return c.json(payload, 201);
  });

  app.get("/", async (c) => {
    const plans = await db.select().from(installmentPlans);
    return c.json(
      plans.map((p) => ({
        id: p.id,
        description: p.description,
        totalAmount: p.totalAmount,
        installmentCount: p.installmentCount,
        paidCount: p.paidCount,
        startDate: p.startDate,
        status: p.status,
      })),
    );
  });

  return app;
}
