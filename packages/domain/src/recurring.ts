// Recurrentes y Fijos (MODEL.md §6 y §10): una regla describe un débito que se
// repite y materializa un movimiento por mes, ligado POR ID — nunca por
// descripción. El paso del tiempo no confirma nada; editar la regla no
// reescribe el pasado.

import type { InstallmentPlan } from "./installments.js";
import {
  isInMonth,
  isOverdue,
  type Movement,
  type MovementType,
  parseLocalDate,
} from "./ledger.js";

export interface RecurringRule {
  id: string;
  description: string;
  category: string;
  amount: number;
  type: MovementType;
  dayOfMonth: number;
  active: boolean;
  months?: number[]; // 1-12; si está, sólo materializa en esos meses (aguinaldo: [6, 12])
}

export interface CommittedMonthly {
  income: number;
  expense: number;
}

/**
 * Compromiso mensual de las reglas, por tipo. Sólo reglas activas; las
 * restringidas a ciertos meses (aguinaldo) no son compromisos mensuales.
 */
export function committedMonthly(rules: RecurringRule[]): CommittedMonthly {
  const totals: CommittedMonthly = { income: 0, expense: 0 };
  for (const rule of rules) {
    if (!rule.active || rule.months) continue;
    if (rule.type === "INCOME") totals.income += rule.amount;
    else totals.expense += rule.amount;
  }
  return totals;
}

/**
 * Comando puro: los movimientos que las reglas activas deben materializar para
 * el mes en curso Y el siguiente (el siguiente siempre pendiente, para que la
 * proyección tenga datos). Deduplica por id de regla + mes — la misma regla que
 * usa commitmentsByMonth. Los días 29–31 se clampean al último día del mes.
 * Todo lo generado por proyección nace PENDIENTE (§2): que el día ya haya
 * pasado no es un hecho, es el almanaque.
 */
export function buildRecurringMaterializations(
  movements: Movement[],
  rules: RecurringRule[],
  now: Date = new Date(),
): Omit<Movement, "id" | "createdAt">[] {
  const out: Omit<Movement, "id" | "createdAt">[] = [];
  for (const offset of [0, 1]) {
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = target.getFullYear();
    const mo = target.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();

    for (const rule of rules) {
      if (!rule.active) continue;
      if (rule.months && !rule.months.includes(mo + 1)) continue;
      const exists = movements.some((m) => m.recurringId === rule.id && isInMonth(m.date, y, mo));
      if (exists) continue;
      const day = Math.min(rule.dayOfMonth, daysInMonth);
      out.push({
        type: rule.type,
        amount: rule.amount,
        description: rule.description,
        category: rule.category,
        status: "PENDING",
        date: `${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        recurringId: rule.id,
      });
    }
  }
  return out;
}

// --- Fijos: qué pasó de verdad este mes, leído del ledger --------------------

export interface FixedEvent {
  source: "rule" | "plan";
  sourceId: string; // id de la regla o del plan
  type: MovementType;
  day: number; // día de débito dentro del mes
  amount: number;
  /** false cuando la regla/plan debía un débito este mes y el ledger no lo tiene */
  materialized: boolean;
  confirmed: boolean;
  overdue: boolean; // pendiente y su fecha ya pasó
  movementId?: string;
}

/**
 * Los débitos fijos de un mes, **leídos del ledger** (§10). "Ya se debitó"
 * significa "el movimiento está CONFIRMED" y nada más: el almanaque no confirma
 * nada. El monto sale del movimiento, no de `rule.amount` ni de `total/N`
 * (§0.3 "leer, no recalcular"; §6 "editar la regla no reescribe el pasado").
 *
 * Caso sin movimiento: una regla activa que debía un débito este mes y no lo
 * tiene igual se muestra, con `materialized: false` y el monto de la regla como
 * lo único disponible. Si su día ya pasó, cuenta como VENCIDO — no tener el
 * movimiento no vuelve pagada la deuda.
 */
export function fixedMonthEvents(
  movements: Movement[],
  rules: RecurringRule[],
  plans: InstallmentPlan[],
  year: number,
  month: number,
  today: Date = new Date(),
): FixedEvent[] {
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const events: FixedEvent[] = [];
  const seenRules = new Set<string>();
  const seenPlans = new Set<string>();

  for (const m of movements) {
    // Una parte a cobrar no es un débito fijo: viaja con `installmentId` del
    // gasto madre y contarla acá duplicaría.
    if (m.splitFrom) continue;
    if (!isInMonth(m.date, year, month)) continue;
    const source: "rule" | "plan" | null = m.recurringId ? "rule" : m.installmentId ? "plan" : null;
    if (!source) continue;
    const sourceId = (m.recurringId ?? m.installmentId) as string;
    if (source === "rule") seenRules.add(sourceId);
    else seenPlans.add(sourceId);
    // Cancelado no es un evento del mes, pero el débito EXISTE: marcarlo como
    // visto antes de saltearlo evita que la regla se cuele después como «no
    // materializada» y meta `rule.amount` en el total, que es justo lo que §10
    // prohíbe.
    if (m.status === "CANCELLED") continue;
    events.push({
      source,
      sourceId,
      type: m.type,
      day: parseLocalDate(m.date).getDate(),
      amount: m.amount,
      materialized: true,
      confirmed: m.status === "CONFIRMED",
      overdue: isOverdue(m, today),
      movementId: m.id,
    });
  }

  const dueDay = (day: number) => Math.min(day, daysInMonth);
  const isPast = (day: number) => new Date(year, month, day) < startOfDay;

  for (const rule of rules) {
    if (!rule.active || seenRules.has(rule.id)) continue;
    if (rule.months && !rule.months.includes(month + 1)) continue;
    const day = dueDay(rule.dayOfMonth);
    events.push({
      source: "rule",
      sourceId: rule.id,
      type: rule.type,
      day,
      amount: rule.amount,
      materialized: false,
      confirmed: false,
      overdue: isPast(day),
    });
  }

  for (const plan of plans) {
    if (plan.status === "CANCELLED" || plan.status === "COMPLETED") continue;
    if (seenPlans.has(plan.id)) continue;
    const next = nextPlanDateInMonth(plan, year, month);
    if (next === null) continue;
    const day = dueDay(next);
    events.push({
      source: "plan",
      sourceId: plan.id,
      type: "EXPENSE",
      day,
      amount: Math.round(plan.totalAmount / plan.installmentCount),
      materialized: false,
      confirmed: false,
      overdue: isPast(day),
    });
  }

  return events.sort((a, b) => a.day - b.day);
}

// El día del mes en que cae una cuota del plan, o null si el plan no toca ese
// mes. Sólo se usa para planes sin movimientos (los normales los tienen).
function nextPlanDateInMonth(plan: InstallmentPlan, year: number, month: number): number | null {
  const start = parseLocalDate(plan.startDate);
  const offset = (year - start.getFullYear()) * 12 + (month - start.getMonth());
  if (offset < 0 || offset >= plan.installmentCount) return null;
  return start.getDate();
}

/**
 * En qué balde cae un fijo este mes. Los cinco baldes, en orden: vencido (lo
 * único que reclama algo hoy) → pendiente → pagado → inactivo (pausado o
 * aguinaldo fuera de sus meses) → terminado (archivo). `done` gana sobre todo:
 * un plan terminado no tiene nada pendiente por definición.
 */
export type FixedRowState = "overdue" | "pending" | "paid" | "idle" | "done";

export const FIXED_STATE_ORDER: Record<FixedRowState, number> = {
  overdue: 0,
  pending: 1,
  paid: 2,
  idle: 3,
  done: 4,
};

export function fixedRowState({
  event,
  finished = false,
}: {
  event: FixedEvent | undefined;
  /** Sólo los planes de cuotas terminan; una regla se pausa, no termina */
  finished?: boolean;
}): FixedRowState {
  if (finished) return "done";
  if (!event) return "idle";
  if (event.overdue) return "overdue";
  if (event.confirmed) return "paid";
  return "pending";
}

/**
 * Lo que un plan debita **este mes**, o `null` si no debita nada (terminó,
 * no empezó, o está cancelado). Existe para que nadie vuelva a poner un `??`
 * con el promedio detrás: `total/N` no es el monto de ninguna cuota real —
 * el reparto pone el resto en las primeras (§1, §5).
 */
export function planMonthAmount(event: FixedEvent | undefined): number | null {
  return event ? event.amount : null;
}

export interface FixedMonthTotals {
  paid: number; // débitos confirmados (salidas)
  pending: number; // pendientes, vencidos incluidos
  overdue: number;
  overdueCount: number;
  pendingCount: number;
}

/**
 * Lo que sale por lo que se repite **todos los meses**: sólo los eventos de
 * REGLAS de tipo gasto, pagados + por pagar. Vive acá y no en la pantalla
 * (§0.2) porque es la cifra al pie de la lista de Fijos, que lista reglas y
 * NO cuotas: sumar ahí los eventos `plan` daría un total que no es la suma de
 * la columna que se está mirando, y el drill-down a Movimientos (`?origen=FIJO`,
 * que también excluye cuotas) aterrizaría en otro número.
 */
export function ruleExpenseTotal(events: FixedEvent[]): number {
  const t = fixedMonthTotals(events.filter((e) => e.source === "rule"));
  return t.paid + t.pending;
}

/** Los totales de la franja de Fijos, todos del mismo set de eventos. */
export function fixedMonthTotals(events: FixedEvent[]): FixedMonthTotals {
  const totals: FixedMonthTotals = {
    paid: 0,
    pending: 0,
    overdue: 0,
    overdueCount: 0,
    pendingCount: 0,
  };
  for (const e of events) {
    if (e.type !== "EXPENSE") continue;
    if (e.confirmed) {
      totals.paid += e.amount;
      continue;
    }
    totals.pending += e.amount;
    totals.pendingCount++;
    if (e.overdue) {
      totals.overdue += e.amount;
      totals.overdueCount++;
    }
  }
  return totals;
}
