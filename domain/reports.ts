// Informes y lecturas agregadas multi-feature (MODEL.md §9–§10). Todas las
// exclusiones son las mismas en todos los agregados: pockets (otra moneda),
// cancelaciones (§8: caja pura), partes a cobrar (créditos, no ingresos) — y
// todo gasto compartido se netea a `ownShare`. Si dos pantallas pueden
// contradecirse sobre una cifra, el dato está duplicado y ESO es el bug (§0.2).

import {
  isInMonth,
  isSettlement,
  type Movement,
  othersShareByGroup,
  ownShare,
  parseLocalDate,
} from "./ledger.js";
import type { RecurringRule } from "./recurring.js";

/** Un mes concreto del calendario. `month` es 0-based, como en `Date`. */
export interface YearMonth {
  year: number;
  month: number;
}

// "Julio" — nombre completo del mes, capitalizado.
export function monthName(year: number, month: number): string {
  const raw = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(new Date(year, month, 1));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** "Marzo de 2026" — un mes puntual, sin ambigüedad de año. */
export function monthYearLabel({ year, month }: YearMonth): string {
  return `${monthName(year, month)} de ${year}`;
}

// "Jul" — o "Jul 25" cuando la ventana cruza más de un año, donde el nombre
// pelado es ambiguo.
function monthLabel(d: Date, withYear = false) {
  const raw = new Intl.DateTimeFormat("es-AR", { month: "short" }).format(d).replace(".", "");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  return withYear ? `${name} ${String(d.getFullYear()).slice(2)}` : name;
}

// Las claves (year, month) que cubre una ventana de `count` meses terminando en
// el actual. Compartida por la serie, el desglose por categoría y el drill-down
// para que TODOS describan el mismo período.
export function monthWindowKeys(count: number, now: Date = new Date()): Set<string> {
  const keys = new Set<string>();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    keys.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  return keys;
}

/**
 * ¿El movimiento cae dentro de una ventana de meses ya calculada? Es el MISMO
 * predicado que usan expensesByCategory y monthlySeries: lo que hace que la
 * lista a la que llegás sume exactamente la cifra desde la que hiciste click.
 */
export function isInMonthWindow(m: Movement, window: Set<string>): boolean {
  const d = parseLocalDate(m.date);
  return window.has(`${d.getFullYear()}-${d.getMonth()}`);
}

export interface CashflowSeries {
  labels: string[];
  income: number[];
  expense: number[];
  /**
   * A qué mes corresponde cada posición, para que quien dibuje la serie pueda
   * decir de qué mes es la barra que tocaste. `labels` no alcanza: son "Jul" o
   * "Jul 25" — pensados para leerse, no para identificar un mes.
   */
  months: YearMonth[];
}

// Buckets de ingreso/gasto por mes para los últimos `count` meses (el más
// viejo primero, el actual último).
export function monthlySeries(
  movements: Movement[],
  count: number,
  now: Date = new Date(),
): CashflowSeries {
  const months: { key: string; label: string; ym: YearMonth }[] = [];
  const withYear = count > 12;
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: monthLabel(d, withYear),
      ym: { year: d.getFullYear(), month: d.getMonth() },
    });
  }
  const index = new Map(months.map((m, i) => [m.key, i]));

  const income = new Array(count).fill(0);
  const expense = new Array(count).fill(0);
  const others = othersShareByGroup(movements);
  for (const m of movements) {
    if (m.pocketId) continue;
    if (isSettlement(m)) continue; // cancelar deuda es caja pura, no gasto (§8)
    if (m.splitFrom) continue; // una devolución es un crédito, no un ingreso
    const d = parseLocalDate(m.date);
    const idx = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (idx === undefined || m.status !== "CONFIRMED") continue;
    if (m.type === "INCOME") income[idx] += m.amount;
    if (m.type === "EXPENSE") expense[idx] += ownShare(m, others);
  }

  return {
    labels: months.map((m) => m.label),
    income,
    expense,
    months: months.map((m) => m.ym),
  };
}

// --- Resumen del mes ---------------------------------------------------------

export interface MonthSummary {
  received: number; // INCOME CONFIRMED, devoluciones excluidas
  spent: number; // EXPENSE CONFIRMED, neteado de lo que te deben
  pendingExpense: number; // EXPENSE PENDING
  pendingIncome: number; // INCOME PENDING, devoluciones excluidas
  receivable: number; // partes de repartos todavía por cobrar
}

/**
 * Totales de cualquier set de movimientos, confirmado y pendiente aparte.
 * `others` se pasa desde afuera para que un set FILTRADO siga neteando cada
 * reparto contra el grupo COMPLETO: si el filtro dejó el gasto pero sacó una
 * parte, calcular las partes del set filtrado inflaría tu parte en silencio.
 */
export function summarize(movements: Movement[], others: Map<string, number>): MonthSummary {
  const summary: MonthSummary = {
    received: 0,
    spent: 0,
    pendingExpense: 0,
    pendingIncome: 0,
    receivable: 0,
  };
  for (const m of movements) {
    if (m.pocketId) continue;
    // Una cancelación de deuda no es gasto de ningún mes (§8): el consumo que
    // pagó ya está contado en su propia fecha.
    if (isSettlement(m)) continue;
    if (m.status !== "CONFIRMED" && m.status !== "PENDING") continue;
    // Las devoluciones son créditos, no ingresos: se netean del gasto que las
    // originó (othersShareByGroup) y sólo se siguen como receivable.
    if (m.splitFrom) {
      if (m.status === "PENDING") summary.receivable += m.amount;
      continue;
    }
    if (m.type === "INCOME" && m.status === "CONFIRMED") summary.received += m.amount;
    if (m.type === "EXPENSE" && m.status === "CONFIRMED") summary.spent += ownShare(m, others);
    if (m.type === "INCOME" && m.status === "PENDING") summary.pendingIncome += m.amount;
    if (m.type === "EXPENSE" && m.status === "PENDING")
      summary.pendingExpense += ownShare(m, others);
  }
  return summary;
}

// Totales de un (year, month) arbitrario — month 0-based.
export function monthSummary(movements: Movement[], year: number, month: number): MonthSummary {
  return summarize(
    movements.filter((m) => isInMonth(m.date, year, month)),
    othersShareByGroup(movements),
  );
}

// Movimientos de un (year, month), fecha más nueva primero — month 0-based.
export function movementsInMonth(movements: Movement[], year: number, month: number): Movement[] {
  return movements
    .filter((m) => isInMonth(m.date, year, month))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Meses (0-based) del año dado que tienen al menos un movimiento.
export function monthsWithMovements(movements: Movement[], year: number): Set<number> {
  const set = new Set<number>();
  for (const m of movements) {
    const d = parseLocalDate(m.date);
    if (d.getFullYear() === year) set.add(d.getMonth());
  }
  return set;
}

// --- Pendientes accionables hoy ----------------------------------------------

export interface PendingAsOfToday {
  toPay: number; // EXPENSE PENDING, sólo tu parte
  toCollect: number; // pendingIncome + partes a cobrar, cifra bruta
  items: Movement[]; // todo pendiente contado arriba, más viejos primero
}

/**
 * Todo lo pendiente accionable hoy: PENDING con fecha no posterior al fin del
 * mes calendario EN CURSO — lo posterior es compromiso futuro, no tarea. Este
 * bloque no sigue al mes navegado. Dos cortes distintos a propósito:
 *  - Tus propios pendientes: fin del mes en curso — una factura del 28 es
 *    tarea de este mes.
 *  - Partes que te deben (splitFrom): fecha ≤ HOY. La deuda nace con el
 *    consumo (§7): la parte de una cuota futura no es cobrable todavía, y es
 *    el mismo corte que usa Espacios (spaceBalancesFrom).
 */
export function pendingAsOfToday(movements: Movement[], from: Date = new Date()): PendingAsOfToday {
  const others = othersShareByGroup(movements);
  const nextMonth = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const endOfToday = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59);
  const items = movements
    .filter((m) => {
      if (m.status !== "PENDING" || m.pocketId) return false;
      const d = parseLocalDate(m.date);
      // Una fecha no parseable no puede probarse futura: el pendiente queda
      // visible antes que caerse en silencio.
      if (Number.isNaN(d.getTime())) return true;
      return m.splitFrom ? d <= endOfToday : d < nextMonth;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  let toPay = 0;
  let toCollect = 0;
  for (const m of items) {
    if (m.splitFrom) {
      toCollect += m.amount; // una parte que te deben
    } else if (m.type === "EXPENSE") {
      toPay += ownShare(m, others);
    } else {
      toCollect += m.amount; // un ingreso registrado que aún no llegó
    }
  }
  return { toPay, toCollect, items };
}

// --- Categorías ---------------------------------------------------------------

// Gasto confirmado por id de categoría, el mayor primero. Sólo tu parte:
// sin netear, una factura repartida entre 4 parece 4 veces la plata que salió
// de tu bolsillo.
export function expensesByCategory(
  movements: Movement[],
  monthCount?: number,
  now: Date = new Date(),
): [string, number][] {
  const byCategory: Record<string, number> = {};
  const others = othersShareByGroup(movements);
  const window = monthCount ? monthWindowKeys(monthCount, now) : null;
  for (const m of movements) {
    if (m.pocketId || isSettlement(m)) continue;
    if (m.type !== "EXPENSE" || m.status !== "CONFIRMED") continue;
    if (window && !isInMonthWindow(m, window)) continue;
    byCategory[m.category] = (byCategory[m.category] || 0) + ownShare(m, others);
  }
  return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
}

/**
 * Cuántos movimientos usan cada categoría dentro de la ventana. Responde
 * "¿este cajón sirve para algo?", no "cuánto pesó". **Cuenta filas del
 * Historial, no actos de categorización**: no excluye nada — ni partes a
 * cobrar, ni ahorros, ni cancelados — porque el Historial los muestra a todos.
 * Si acá se filtrara algo, tocarías "12" y aparecerían 14.
 */
export function movementCountByCategory(
  movements: Movement[],
  monthCount: number,
  now: Date = new Date(),
): Map<string, number> {
  const window = monthWindowKeys(monthCount, now);
  const counts = new Map<string, number>();
  for (const m of movements) {
    if (!isInMonthWindow(m, window)) continue;
    counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  }
  return counts;
}

/** Meses distintos dentro de la ventana con al menos un gasto confirmado. */
export function spendingHistoryMonths(
  movements: Movement[],
  monthCount: number,
  now: Date = new Date(),
): number {
  const window = monthWindowKeys(monthCount, now);
  const months = new Set<string>();
  for (const m of movements) {
    if (m.pocketId || isSettlement(m)) continue;
    if (m.type !== "EXPENSE" || m.status !== "CONFIRMED") continue;
    const d = parseLocalDate(m.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (window.has(key)) months.add(key);
  }
  return months.size;
}

export interface CategoryDelta {
  categoryId: string;
  current: number; // gasto confirmado del mes en curso, sólo tu parte
  average: number; // promedio mensual sobre los meses previos CON datos
  delta: number; // current − average
  deltaPct: number | null; // null cuando no hay promedio previo contra qué comparar
}

/**
 * "Lo que cambió": gasto confirmado por categoría del mes en curso vs el
 * promedio de los meses previos **dentro de la ventana elegida**, mayor cambio
 * absoluto primero. El promedio alcanza `monthCount − 1` meses hacia atrás y
 * divide sólo por los meses que TIENEN datos: en el mes dos de uso, dividir
 * por la ventana entera convertía cualquier gasto común en un pico de tres
 * dígitos.
 */
export function categoryDeltaVsAverage(
  movements: Movement[],
  monthCount: number,
  now: Date = new Date(),
): CategoryDelta[] {
  const previousMonths = Math.max(1, monthCount - 1);
  const others = othersShareByGroup(movements);
  const expenseByCategory = (y: number, m: number) => {
    const acc = new Map<string, number>();
    for (const mov of movements) {
      if (mov.pocketId || isSettlement(mov)) continue;
      if (mov.type !== "EXPENSE" || mov.status !== "CONFIRMED") continue;
      if (!isInMonth(mov.date, y, m)) continue;
      acc.set(mov.category, (acc.get(mov.category) ?? 0) + ownShare(mov, others));
    }
    return acc;
  };

  const current = expenseByCategory(now.getFullYear(), now.getMonth());
  // Por categoría: total gastado y en cuántos meses previos apareció.
  const history = new Map<string, { total: number; months: number }>();
  for (let i = 1; i <= previousMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    for (const [categoryId, amount] of expenseByCategory(d.getFullYear(), d.getMonth())) {
      const entry = history.get(categoryId) ?? { total: 0, months: 0 };
      entry.total += amount;
      entry.months += 1;
      history.set(categoryId, entry);
    }
  }

  const categoryIds = new Set([...current.keys(), ...history.keys()]);
  const result: CategoryDelta[] = [];
  for (const categoryId of categoryIds) {
    const cur = current.get(categoryId) ?? 0;
    const past = history.get(categoryId);
    const average = past && past.months > 0 ? past.total / past.months : 0;
    const delta = cur - average;
    result.push({
      categoryId,
      current: cur,
      average,
      delta,
      deltaPct: average === 0 ? null : (delta / average) * 100,
    });
  }
  return result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// --- Compromisos futuros (§9) -------------------------------------------------

export interface MonthCommitment {
  year: number;
  month: number; // 0-based
  label: string; // "Julio"
  recorded: number; // gastos pendientes ya sentados en el ledger
  projected: number; // reglas activas que aún no materializaron ese mes
  total: number;
  installments: number; // la parte de `recorded` que viene de planes de cuotas
}

/**
 * Lo que cada uno de los próximos `count` meses ya debe, el actual primero.
 * La dificultad entera es no contar dos veces: una regla que YA generó su
 * movimiento en un mes no se suma encima — `projected` sólo cubre meses que la
 * regla no alcanzó, el mismo dedup que usa la materialización. Matching por id
 * únicamente (§6).
 */
export function commitmentsByMonth(
  movements: Movement[],
  rules: RecurringRule[],
  count: number,
  from: Date = new Date(),
): MonthCommitment[] {
  const others = othersShareByGroup(movements);
  const result: MonthCommitment[] = [];

  for (let i = 0; i < count; i++) {
    const target = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const y = target.getFullYear();
    const m = target.getMonth();

    let recorded = 0;
    let installments = 0;
    for (const mov of movements) {
      if (mov.pocketId || mov.splitFrom) continue;
      if (mov.type !== "EXPENSE" || mov.status !== "PENDING") continue;
      if (!isInMonth(mov.date, y, m)) continue;
      const own = ownShare(mov, others);
      recorded += own;
      if (mov.installmentId) installments += own;
    }

    let projected = 0;
    for (const rule of rules) {
      if (!rule.active || rule.type !== "EXPENSE") continue;
      // Una regla limitada a ciertos meses (aguinaldo, patente) sólo te
      // compromete en esos meses.
      if (rule.months && !rule.months.includes(m + 1)) continue;
      const materialized = movements.some(
        (mov) => mov.recurringId === rule.id && isInMonth(mov.date, y, m),
      );
      if (!materialized) projected += rule.amount;
    }

    result.push({
      year: y,
      month: m,
      label: monthName(y, m),
      recorded,
      projected,
      total: recorded + projected,
      installments,
    });
  }

  return result;
}
