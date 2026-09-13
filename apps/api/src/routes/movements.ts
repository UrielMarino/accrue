import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/client.js";
import { movements } from "../db/schema.js";
import { resyncPlan } from "../plans.js";
import { problem } from "../problem.js";

/**
 * El ledger. Es la pantalla principal de la app y la única verdad sobre lo que
 * pasó (§0.1).
 *
 * El rango `desde`/`hasta` es el ÁTOMO: "septiembre" no existe acá, es un
 * preset que el cliente traduce a dos fechas. Sin rango, devuelve todo — lo que
 * sirve mientras la base es chica y deja de servir en cuanto haya años de
 * historia, momento en el que esto pagina por keyset.
 */
export function movementRoutes(db: Db) {
  const app = new Hono();

  app.get("/", async (c) => {
    const desde = c.req.query("desde");
    const hasta = c.req.query("hasta");
    const ISO = /^\d{4}-\d{2}-\d{2}$/;

    if ((desde && !ISO.test(desde)) || (hasta && !ISO.test(hasta))) {
      return problem(c, 422, "El rango debe ser YYYY-MM-DD");
    }

    const filtros = [
      ...(desde ? [gte(movements.date, desde)] : []),
      ...(hasta ? [lte(movements.date, hasta)] : []),
    ];

    const rows = await db
      .select()
      .from(movements)
      .where(filtros.length ? and(...filtros) : undefined)
      .orderBy(desc(movements.date), desc(movements.createdAt));

    return c.json(
      rows.map((m) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        description: m.description,
        category: m.categoryId,
        status: m.status,
        date: m.date,
        installmentId: m.installmentId ?? undefined,
      })),
    );
  });

  /**
   * Confirmar un movimiento: afirmar que ocurrió. Es la única forma de que algo
   * pase a CONFIRMED — el paso del tiempo no confirma nada (§2).
   */
  app.post("/:id/confirm", async (c) => {
    const id = c.req.param("id");
    const [m] = await db.select().from(movements).where(eq(movements.id, id)).limit(1);
    if (!m) return problem(c, 404, "Ese movimiento no existe");
    if (m.status === "CANCELLED") {
      return problem(c, 409, "Un movimiento cancelado no se confirma: está fuera de todo total");
    }
    if (m.status === "CONFIRMED") return c.json({ id, status: "CONFIRMED" });

    await db.update(movements).set({ status: "CONFIRMED" }).where(eq(movements.id, id));

    // Si era una cuota, el contador del plan se RECALCULA desde el ledger. En
    // Chirola `paidCount` y los estados de las cuotas eran dos verdades
    // independientes y se desincronizaban; acá el ledger manda siempre (§0.2).
    if (m.installmentId) await resyncPlan(db, m.installmentId);

    return c.json({ id, status: "CONFIRMED" });
  });

  return app;
}
