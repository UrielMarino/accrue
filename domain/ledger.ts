// Ledger (MODEL.md §2–§4): el movimiento es la única verdad sobre lo que pasó.
// Todo monto es un ENTERO en la unidad menor de su moneda (centavos ARS, §1).
// Las fechas son strings `YYYY-MM-DD`; el "hoy" siempre puede inyectarse para
// que el server lo compute en America/Argentina/Buenos_Aires.

export type MovementType = "INCOME" | "EXPENSE";
export type MovementStatus = "CONFIRMED" | "PENDING" | "CANCELLED";

// Una cancelación de deuda es caja pura (§8): NO es un gasto, no tiene
// categoría y queda fuera del resultado del mes, de Informes y de todo desglose
// por categoría. `appliedTo` registra contra qué gastos del espacio se imputó
// (más viejos primero): "contra qué" es dato, no adivinanza.
export interface SettlementInfo {
  appliedTo: { spaceExpenseId: string; amount: number }[];
}

export interface Movement {
  id: string;
  type: MovementType;
  amount: number; // entero en unidad menor (§1)
  description: string;
  category: string;
  status: MovementStatus;
  date: string; // YYYY-MM-DD
  createdAt: string;
  recurringId?: string; // generado por una regla recurrente
  installmentId?: string; // una cuota de un plan
  splitGroupId?: string; // comparte grupo un gasto repartido y sus partes a cobrar
  splitFrom?: string; // en partes a cobrar: quién debe la plata
  spaceId?: string; // espeja un gasto de espacio
  spaceExpenseId?: string; // el gasto de espacio que lo generó
  settledTo?: string; // en un pago de deuda: a quién se le pagó
  // Presente ⇒ cancelación de deuda (§8), excluida de todo total de gasto.
  settlement?: SettlementInfo;
  // Un settle que la importación no pudo rastrear (§11.1): SIGUE contando como
  // gasto, rotulado "Sin revisar", hasta que el usuario decida qué fue.
  needsReview?: boolean;
  pocketId?: string; // depósito (EXPENSE) o retiro (INCOME) de un ahorro
}

// True cuando el movimiento es una cancelación de deuda (§8) — caja, no gasto.
export function isSettlement(m: Movement): boolean {
  return !!m.settlement;
}

// --- Fechas ----------------------------------------------------------------

// Mediodía local: inmune a saltos de DST al comparar días.
export function parseLocalDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Días enteros desde hoy hasta la fecha ISO (negativo = ya pasó).
export function daysUntil(iso: string, today: Date = new Date()): number {
  const from = startOfDay(today);
  const d = startOfDay(parseLocalDate(iso));
  return Math.round((d.getTime() - from.getTime()) / 86400000);
}

// True si la fecha ISO cae dentro del mes dado (month 0-based, como Date).
export function isInMonth(iso: string, year: number, month: number): boolean {
  const d = parseLocalDate(iso);
  return d.getFullYear() === year && d.getMonth() === month;
}

// --- Estados ----------------------------------------------------------------

export function isPending(m: Movement): boolean {
  return m.status === "PENDING";
}

export function isOverdue(m: Movement, today: Date = new Date()): boolean {
  if (!isPending(m)) return false;
  // Una parte a cobrar hereda la fecha del gasto que la originó — es cuándo
  // salió la plata, no una fecha que alguien pactó para devolverla. Envejecerla
  // a "Vencido" inventa un plazo que nunca existió.
  if (m.splitFrom) return false;
  return startOfDay(parseLocalDate(m.date)) < startOfDay(today);
}

// Rótulo del estado; null cuando no hay nada que mostrar (lo normal no se
// rotula). ÚNICO criterio de texto para toda pantalla (§2).
export function statusLabel(m: Movement, today: Date = new Date()): string | null {
  if (m.status === "CANCELLED") return "Cancelado";
  if (m.status === "PENDING") return isOverdue(m, today) ? "Vencido" : "Pendiente";
  return null;
}

// --- Repartos: neteo de partes ajenas ---------------------------------------

// Lo que deben los demás participantes de cada reparto, por splitGroupId.
// La plata que te deben no es ingreso ni gasto: es un crédito. Netearla contra
// el gasto hace que "cuánto gasté" sea TU parte, sin importar cuándo te paguen.
export function othersShareByGroup(movements: Movement[]): Map<string, number> {
  const byGroup = new Map<string, number>();
  for (const m of movements) {
    if (!m.splitFrom || !m.splitGroupId || m.status === "CANCELLED") continue;
    byGroup.set(m.splitGroupId, (byGroup.get(m.splitGroupId) ?? 0) + m.amount);
  }
  return byGroup;
}

// La parte de un gasto que es efectivamente tuya.
export function ownShare(m: Movement, othersByGroup: Map<string, number>): number {
  if (m.type !== "EXPENSE" || !m.splitGroupId) return m.amount;
  return Math.max(0, m.amount - (othersByGroup.get(m.splitGroupId) ?? 0));
}

// --- Pendientes arrastrados --------------------------------------------------

// Pendientes con fecha anterior al mes calendario en curso, más viejos primero.
export function carriedPending(movements: Movement[], today: Date = new Date()): Movement[] {
  const y = today.getFullYear();
  const mo = today.getMonth();
  return movements
    .filter((m) => {
      if (m.status === "CANCELLED" || !isPending(m)) return false;
      const d = parseLocalDate(m.date);
      return d.getFullYear() < y || (d.getFullYear() === y && d.getMonth() < mo);
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// --- Búsqueda y períodos ------------------------------------------------------

// Match de texto libre sobre un movimiento: descripción y nombre de categoría,
// sin distinguir mayúsculas ni acentos. `categoryName` resuelve id → nombre
// (el catálogo de categorías vive fuera del dominio).
export function matchesQuery(
  m: Movement,
  query: string,
  categoryName: (id?: string) => string = () => "",
): boolean {
  // Una búsqueda de espacios no es una búsqueda: los espacios al final del
  // input no pueden vaciar la lista.
  const needle = normalize(query.trim());
  if (!needle) return true;
  return normalize(`${m.description} ${categoryName(m.category)}`).includes(needle);
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); // acentos combinables que deja NFD
}

export type MovementPeriod = "MONTH" | "WEEK" | "YEAR" | "ALL";

// Filtro de ventana temporal del historial: mes en curso, últimos 7 días
// (incluido hoy), año en curso, o todo.
export function isInPeriod(m: Movement, period: MovementPeriod, now: Date = new Date()): boolean {
  if (period === "ALL") return true;
  if (period === "MONTH") return isInMonth(m.date, now.getFullYear(), now.getMonth());
  if (period === "YEAR") return parseLocalDate(m.date).getFullYear() === now.getFullYear();
  // WEEK: últimos 7 días incluido hoy
  const today = startOfDay(now);
  const d = startOfDay(parseLocalDate(m.date));
  const diff = (today.getTime() - d.getTime()) / 86400000;
  return diff >= 0 && diff < 7;
}
