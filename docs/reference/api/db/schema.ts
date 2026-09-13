// Schema F1: movements + settlement_allocations + categories. Las tablas de
// planes/recurrentes/espacios/pockets llegan con su fase, vía migraciones.
// Decisiones de mapeo (PLAN.md #9 y hallazgo del juicio de F0):
// - Montos en BIGINT: centavos ARS superan int4 con precios argentinos.
// - `date` (tipo date, string YYYY-MM-DD en el driver): fecha contable, nunca
//   timestamptz. `created_at` sí es timestamptz: es un instante, no un día.
// - settlement.appliedTo normalizado en su propia tabla (FIFO §8): "contra qué"
//   es dato consultable, no un blob.
// - split_from / settled_to son NOMBRES de persona (texto), no FKs: así lo
//   modela el dominio (§7).

import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
});

// Reglas de fijos (§6). La regla NO es un movimiento: describe uno que se
// repite. El vínculo con lo materializado es `movements.recurring_id` — por id,
// nunca por descripción. Sin FK a propósito: borrar la regla no puede borrar el
// historial de lo que ya se debitó.
export const recurringRules = pgTable("recurring_rules", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  amount: bigint("amount", { mode: "number" }).notNull(),
  type: text("type", { enum: ["INCOME", "EXPENSE"] }).notNull(),
  dayOfMonth: integer("day_of_month").notNull(),
  active: boolean("active").notNull().default(true),
  // null = todos los meses. [6,12] = aguinaldo.
  months: integer("months").array(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const movements = pgTable(
  "movements",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["INCOME", "EXPENSE"] }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    description: text("description").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    status: text("status", { enum: ["CONFIRMED", "PENDING", "CANCELLED"] }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    recurringId: text("recurring_id"),
    installmentId: text("installment_id"),
    splitGroupId: text("split_group_id"),
    splitFrom: text("split_from"),
    spaceId: text("space_id"),
    spaceExpenseId: text("space_expense_id"),
    settledTo: text("settled_to"),
    isSettlement: boolean("is_settlement").notNull().default(false),
    needsReview: boolean("needs_review"),
    pocketId: text("pocket_id"),
  },
  (t) => [
    index("movements_date_idx").on(t.date),
    index("movements_status_idx").on(t.status),
    index("movements_split_group_idx").on(t.splitGroupId),
  ],
);

// Imputaciones FIFO de una cancelación de deuda (§8): a qué gastos de espacio
// se aplicó y por cuánto.
export const settlementAllocations = pgTable(
  "settlement_allocations",
  {
    id: text("id").primaryKey(),
    movementId: text("movement_id")
      .notNull()
      .references(() => movements.id, { onDelete: "cascade" }),
    spaceExpenseId: text("space_expense_id").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
  },
  (t) => [index("settlement_allocations_movement_idx").on(t.movementId)],
);
