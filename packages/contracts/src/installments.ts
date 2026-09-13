// Contrato wire de las cuotas (MODEL.md §5). Un plan genera N débitos, uno por
// mes, ligados por `installmentId`. La suma de las cuotas ES el total: el
// reparto (§1) lo garantiza y el server nunca manda `total/N` redondeado.
//
// Lo que NO viaja en el alta: los montos de cada cuota, ni el estado de
// ninguna. Los decide el server — el reparto vive en el dominio, y el estado
// de nacimiento sale de la regla del §2. Si el cliente pudiera mandarlos,
// habría dos verdades sobre la misma plata.

import { z } from "zod";
import { DESCRIPTION_MAX } from "./movements.js";
import { amountSchema, idSchema, isoDateSchema, movementTypeSchema } from "./shared.js";

/** Un plan de una sola cuota no es un plan: es un movimiento suelto, y el alta
 *  de movimientos ya lo cubre. El techo son 10 años de cuotas mensuales, que
 *  es más de lo que cualquier financiación real ofrece. */
export const installmentCountSchema = z.int().min(2).max(120);

export const installmentPlanStatusSchema = z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]);

export const installmentPlanSchema = z.object({
  id: idSchema,
  description: z.string(),
  totalAmount: amountSchema,
  installmentCount: installmentCountSchema,
  /** Derivado de las cuotas reales del ledger, nunca un contador propio (§0.2). */
  paidCount: z.int().nonnegative(),
  startDate: isoDateSchema,
  status: installmentPlanStatusSchema,
});

export type InstallmentPlanDto = z.infer<typeof installmentPlanSchema>;

/**
 * Alta de una compra en cuotas.
 *
 * `startDate` es la fecha de la PRIMERA cuota, y puede ser pasada: cargar una
 * compra que empezó hace meses es registrar el pasado, no adivinarlo. Las
 * cuotas que caigan en meses ya cerrados nacen confirmadas; la del mes en curso
 * y las futuras nacen pendientes, aunque el día ya haya pasado (§2).
 */
export const createInstallmentPlanSchema = z.object({
  type: movementTypeSchema,
  description: z.string().trim().min(1).max(DESCRIPTION_MAX),
  category: idSchema,
  /** El total de la compra, en centavos. El signo lo da `type`. */
  totalAmount: z.int().positive(),
  installmentCount: installmentCountSchema,
  startDate: isoDateSchema,
});

export type CreateInstallmentPlanInput = z.infer<typeof createInstallmentPlanSchema>;

/** La respuesta del alta trae el plan y sus cuotas ya repartidas, para que el
 *  cliente muestre lo que quedó sin volver a preguntar. */
export const installmentPlanCreatedSchema = z.object({
  plan: installmentPlanSchema,
  installments: z.array(
    z.object({
      id: idSchema,
      number: z.int().positive(),
      amount: amountSchema,
      date: isoDateSchema,
      status: z.enum(["CONFIRMED", "PENDING", "CANCELLED"]),
    }),
  ),
});

export type InstallmentPlanCreatedDto = z.infer<typeof installmentPlanCreatedSchema>;
