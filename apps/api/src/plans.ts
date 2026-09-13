import { type Movement, syncPlanFromMovements } from "@accrue/domain";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client.js";
import { installmentPlans, movements } from "./db/schema.js";

/**
 * Recalcula `paidCount` y el estado de un plan a partir de sus cuotas reales.
 *
 * La decisión de cuánto vale el contador es del dominio; acá sólo se leen las
 * filas, se le pasan y se guarda lo que devuelva. Si devuelve null no hay nada
 * que cambiar y no se escribe.
 */
export async function resyncPlan(db: Db, planId: string): Promise<void> {
  const [plan] = await db
    .select()
    .from(installmentPlans)
    .where(eq(installmentPlans.id, planId))
    .limit(1);
  if (!plan) return;

  const rows = await db.select().from(movements).where(eq(movements.installmentId, planId));
  const asMovements = rows.map(
    (m): Movement => ({
      id: m.id,
      type: m.type,
      amount: m.amount,
      description: m.description,
      category: m.categoryId,
      status: m.status,
      date: m.date,
      createdAt: m.createdAt,
      ...(m.installmentId ? { installmentId: m.installmentId } : {}),
      ...(m.splitFrom ? { splitFrom: m.splitFrom } : {}),
    }),
  );

  const corregido = syncPlanFromMovements(asMovements, {
    id: plan.id,
    description: plan.description,
    totalAmount: plan.totalAmount,
    installmentCount: plan.installmentCount,
    paidCount: plan.paidCount,
    startDate: plan.startDate,
    status: plan.status,
  });
  if (!corregido) return;

  await db
    .update(installmentPlans)
    .set({ paidCount: corregido.paidCount, status: corregido.status })
    .where(eq(installmentPlans.id, planId));
}
