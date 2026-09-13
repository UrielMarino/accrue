// Contrato wire de los fijos (MODEL.md §6): una REGLA describe un débito que
// se repite; el movimiento de cada mes lo materializa el server, ligado por id
// de regla — nunca por descripción.
//
// Lo que NO viaja acá: el estado del mes. Eso se lee del ledger (§10) y llega
// en `fixedMonthSchema`, no de la regla — «editar la regla no reescribe el
// pasado», así que `amount` es lo que se va a materializar de acá en más, no
// lo que se debitó.

import { z } from "zod";
import {
  amountSchema,
  idSchema,
  isoDateSchema,
  movementTypeSchema,
  positiveAmountSchema,
} from "./shared.js";

/** 29, 30 y 31 se clampean al último día del mes que toque (febrero incluido). */
export const dayOfMonthSchema = z.int().min(1).max(31);

/** Meses en los que aplica, 1-12. Ausente = todos (lo normal). El aguinaldo es
 *  [6, 12]: por eso existe. */
export const monthsSchema = z.array(z.int().min(1).max(12)).min(1).max(12).optional();

export const recurringRuleSchema = z.object({
  id: idSchema,
  description: z.string(),
  category: idSchema,
  amount: amountSchema,
  type: movementTypeSchema,
  dayOfMonth: dayOfMonthSchema,
  active: z.boolean(),
  months: monthsSchema,
});

export type RecurringRuleDto = z.infer<typeof recurringRuleSchema>;

export const createRecurringRuleSchema = z.object({
  description: z.string().trim().min(1).max(200),
  category: idSchema,
  amount: positiveAmountSchema,
  type: movementTypeSchema,
  dayOfMonth: dayOfMonthSchema,
  months: monthsSchema,
});

export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>;

/** Pausar es `active: false`: la regla deja de materializar sin perder historia. */
export const updateRecurringRuleSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    category: idSchema,
    amount: positiveAmountSchema,
    dayOfMonth: dayOfMonthSchema,
    active: z.boolean(),
    months: monthsSchema,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "nada para actualizar");

export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>;

export const recurringRuleListSchema = z.array(recurringRuleSchema);

// --- La pantalla Fijos ------------------------------------------------------

/** Una fila de Fijos: la regla + lo que el LEDGER dice de ella este mes.
 *  `materialized: false` = la regla debía un débito y el movimiento no está;
 *  se muestra igual, con el monto de la regla como única cifra disponible. */
export const fixedEventSchema = z.object({
  /** «rule» = recurrente; «plan» = cuota de una compra (llega con F2-cuotas) */
  source: z.enum(["rule", "plan"]),
  sourceId: idSchema,
  /** los agrega el server para pintar la fila sin un segundo request */
  description: z.string(),
  category: idSchema,
  type: movementTypeSchema,
  /** día de débito ya clampeado al mes consultado */
  day: z.int().min(1).max(31),
  date: isoDateSchema,
  /** del MOVIMIENTO cuando existe; de la regla cuando no (§0.3: leer, no recalcular) */
  amount: amountSchema,
  materialized: z.boolean(),
  confirmed: z.boolean(),
  overdue: z.boolean(),
  movementId: idSchema.optional(),
});

export type FixedEventDto = z.infer<typeof fixedEventSchema>;

/** El mes de Fijos, con los totales del dominio tal cual (`fixedMonthTotals`).
 *  `pending` es SOLO lo fijo que falta pagar (§9): por definición ≤ el «falta
 *  pagar» de Inicio, que además suma sueltos y pasivo. Son preguntas distintas
 *  y DEBEN dar números distintos — cada pantalla rotula qué incluye. */
export const fixedMonthSchema = z.object({
  year: z.int(),
  month: z.int().min(0).max(11), // 0-based, como el dominio
  events: z.array(fixedEventSchema),
  paid: amountSchema,
  pending: amountSchema,
  overdue: amountSchema,
  overdueCount: z.int().nonnegative(),
  pendingCount: z.int().nonnegative(),
  /** Sólo los gastos de REGLAS del mes (pagados + por pagar), sin cuotas: es
   *  la cifra al pie de la lista de Fijos, que lista reglas y no cuotas. Los
   *  totales de arriba incluyen las dos fuentes — son preguntas distintas y
   *  por eso son números distintos (§9: cada cifra rotula qué incluye). */
  rulesExpense: amountSchema,
});

export type FixedMonthDto = z.infer<typeof fixedMonthSchema>;
