// Contrato wire de movimientos: DTOs que viajan por HTTP. Espeja Movement del
// dominio a propósito (la serialización zod recorta claves no declaradas, y un
// DTO recortado ocultaría datos que import-cauri trae en F3).

import { z } from "zod";
import {
  amountSchema,
  idSchema,
  isoDateSchema,
  movementStatusSchema,
  movementTypeSchema,
  positiveAmountSchema,
} from "./shared.js";

/** Tope de la descripción. No es un límite técnico: es el ancho de la columna
 *  de Movimientos. En los datos reales el promedio es 12 caracteres y el más
 *  largo 28, así que 60 no molesta nunca y garantiza que la tabla no se rompa. */
export const DESCRIPTION_MAX = 60;

export const movementSchema = z.object({
  id: idSchema,
  type: movementTypeSchema,
  amount: amountSchema,
  description: z.string(),
  category: idSchema,
  status: movementStatusSchema,
  date: isoDateSchema,
  createdAt: z.iso.datetime(),
  recurringId: idSchema.optional(),
  installmentId: idSchema.optional(),
  splitGroupId: idSchema.optional(),
  splitFrom: z.string().optional(), // nombre de persona, no id
  spaceId: idSchema.optional(),
  spaceExpenseId: idSchema.optional(),
  settledTo: z.string().optional(), // nombre de persona, no id
  settlement: z
    .object({ appliedTo: z.array(z.object({ spaceExpenseId: idSchema, amount: amountSchema })) })
    .optional(),
  needsReview: z.boolean().optional(),
  pocketId: idSchema.optional(),
});

export type MovementDto = z.infer<typeof movementSchema>;

// Alta de un movimiento suelto. El estado NO viaja: lo decide la regla de
// nacimiento (§2) en el server — fecha ≤ hoy nace CONFIRMED, futura PENDING.
export const createMovementSchema = z.object({
  type: movementTypeSchema,
  amount: positiveAmountSchema,
  description: z.string().trim().min(1).max(DESCRIPTION_MAX),
  category: idSchema,
  date: isoDateSchema,
});

export type CreateMovementInput = z.infer<typeof createMovementSchema>;

// Edición de campos sueltos; el estado se cambia con confirmar/revertir, nunca
// editando. Regla que la ruta debe aplicar (§2, necesita el estado actual):
// rechazar `date` futura sobre un movimiento CONFIRMADO.
export const updateMovementSchema = z
  .object({
    amount: positiveAmountSchema,
    description: z.string().trim().min(1).max(DESCRIPTION_MAX),
    category: idSchema,
    date: isoDateSchema,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "nada para actualizar");

export type UpdateMovementInput = z.infer<typeof updateMovementSchema>;

// Confirmación en lote: ignora los ya confirmados/cancelados.
export const confirmMovementsSchema = z.object({
  ids: z.array(idSchema).min(1).max(500),
});

// Deshacer (contrato del undo-toast, decisión 24 del PLAN):
// - deshacer un alta = DELETE /movements/:id (sin body);
// - deshacer una confirmación = revertir esos ids a PENDING.
// Ambos batch comparten la respuesta {changed}.
export const revertMovementsSchema = z.object({
  ids: z.array(idSchema).min(1).max(500),
});

export const changedCountSchema = z.object({
  changed: z.int().nonnegative(),
});

export const movementListSchema = z.array(movementSchema);

// Listado de Actividad (F1): el filtrado es SERVER-SIDE — web importa solo
// contracts (grafo del PLAN), así que no puede reusar los predicados del
// dominio para filtrar en memoria.
// "" (select sin elegir en un form GET) significa "sin filtro", nunca un valor:
// sin esto, ?month= coercionaba a 0 y filtraba por enero en silencio.
const emptyAsUndefined = (v: unknown) => (v === "" ? undefined : v);

export const listMovementsQuerySchema = z.object({
  year: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(2000).max(2100).optional()),
  month: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(0).max(11).optional()), // 0-based
  status: z.preprocess(emptyAsUndefined, movementStatusSchema.optional()),
  type: z.preprocess(emptyAsUndefined, movementTypeSchema.optional()),
  q: z.string().trim().max(100).optional(),
  // Todas las cuotas de un plan, sin importar el mes: el desglose «te faltan N,
  // terminás en marzo» se lee de los movimientos del plan (§5, «leer, no
  // recalcular»), no de una tabla de planes.
  installmentId: z.preprocess(emptyAsUndefined, idSchema.optional()),
});

export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
