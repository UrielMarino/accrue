// Contrato wire de los reportes (§9–§10). El front NUNCA recalcula dominio
// ("leer, no recalcular", §0.3): estas respuestas son cifras ya derivadas.
// Decisión: el compuesto "Libre en {mes}" (§10) también lo COMPONE el server —
// su schema llega con el endpoint de Inicio en F1, para que dos pantallas no
// puedan componerlo distinto (§0.2). La serie mensual (informes) llega en F4
// con la forma que pida la pantalla real.

import { z } from "zod";
import { movementSchema } from "./movements.js";

export const monthSummarySchema = z.object({
  received: z.int(),
  spent: z.int(),
  pendingExpense: z.int(),
  pendingIncome: z.int(),
  receivable: z.int(),
});

export type MonthSummaryDto = z.infer<typeof monthSummarySchema>;

export const pendingAsOfTodaySchema = z.object({
  toPay: z.int(),
  toCollect: z.int(),
  items: z.array(movementSchema),
});

export type PendingAsOfTodayDto = z.infer<typeof pendingAsOfTodaySchema>;

// El ancla de Inicio (§10), COMPUESTA por el server (§0.2: dos pantallas no
// pueden componerla distinto): libre = received − spent − toPay. Los términos
// viajan igual porque el ancla se despliega rotulada (§9).
export const inicioSchema = z.object({
  year: z.int(),
  month: z.int(), // 0-based
  libre: z.int(),
  received: z.int(),
  spent: z.int(),
  toPay: z.int(),
  toCollect: z.int(),
  pending: z.array(movementSchema), // accionables hoy, más viejos primero
});

export type InicioDto = z.infer<typeof inicioSchema>;
