// Schema SQLite. Las tablas de espacios, pockets y settlements llegan con su
// fase, vía migración — acá sólo vive lo que ya tiene un endpoint.
//
// Decisiones de mapeo, heredadas del modelo (§1, §5) y adaptadas a SQLite:
// - Montos en INTEGER. SQLite guarda enteros de 64 bits, así que los centavos
//   ARS entran sin el problema de int4 que obligaba a BIGINT en Postgres.
// - `date` es TEXT 'YYYY-MM-DD': fecha CONTABLE, nunca un timestamp. Ordena
//   y compara lexicográficamente igual que cronológicamente, que es lo único
//   que le pedimos.
// - `created_at` sí es un instante, y va como TEXT ISO-8601 en UTC.
// - `installment_id` no tiene FK al plan a propósito: borrar un plan no puede
//   borrar el historial de lo que ya se debitó.

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
});

// Un plan NO es un movimiento: describe N débitos que se generan de una vez y
// quedan ligados por id. `paid_count` es caché derivada de las cuotas reales
// (§0.2, §5): se recalcula desde el ledger, nunca se incrementa a mano.
export const installmentPlans = sqliteTable("installment_plans", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  totalAmount: integer("total_amount").notNull(),
  installmentCount: integer("installment_count").notNull(),
  paidCount: integer("paid_count").notNull().default(0),
  startDate: text("start_date").notNull(),
  status: text("status", { enum: ["ACTIVE", "COMPLETED", "CANCELLED"] })
    .notNull()
    .default("ACTIVE"),
  createdAt: text("created_at").notNull(),
});

export const movements = sqliteTable(
  "movements",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["INCOME", "EXPENSE"] }).notNull(),
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    status: text("status", { enum: ["CONFIRMED", "PENDING", "CANCELLED"] }).notNull(),
    date: text("date").notNull(),
    createdAt: text("created_at").notNull(),
    recurringId: text("recurring_id"),
    installmentId: text("installment_id"),
    splitGroupId: text("split_group_id"),
    splitFrom: text("split_from"),
  },
  (t) => [
    index("movements_date_idx").on(t.date),
    index("movements_status_idx").on(t.status),
    index("movements_installment_idx").on(t.installmentId),
  ],
);

export type MovementRow = typeof movements.$inferSelect;
export type InstallmentPlanRow = typeof installmentPlans.$inferSelect;
