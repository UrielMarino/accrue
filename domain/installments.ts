// Cuotas (MODEL.md §5): un plan genera N débitos, uno por mes, ligados por id.
// La suma de las cuotas ES el total del plan — invariante, no aspiración: todo
// deriva de las cuotas reales del ledger, nunca de `total/N × restantes`.

import {
  isoDate,
  type Movement,
  type MovementStatus,
  type MovementType,
  parseLocalDate,
} from "./ledger.js";
import { reparto } from "./reparto.js";

export interface InstallmentPlan {
  id: string;
  description: string;
  totalAmount: number;
  installmentCount: number;
  paidCount: number;
  startDate: string; // YYYY-MM-DD de la primera cuota
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
}

// Las cuotas de un plan. Las compras compartidas copian `installmentId` en cada
// parte a cobrar, así que un filtro ingenuo cuenta deudas ajenas como cuotas.
export function planInstallments(movements: Movement[], planId: string): Movement[] {
  return movements.filter((m) => m.installmentId === planId && !m.splitFrom);
}

/**
 * Si una fecha cae en un mes **ya cerrado**.
 *
 * Es la única licencia que el almanaque tiene para dar algo por hecho, y existe
 * para una sola cosa: cargar una compra en cuotas que empezó hace meses. Ahí
 * marcar como pagadas las cuotas viejas es registrar el pasado, no adivinarlo.
 * **El mes en curso nunca cuenta**, aunque el día ya haya pasado (§2).
 */
export function isMonthClosed(iso: string, today: Date = new Date()): boolean {
  const d = parseLocalDate(iso);
  const y = d.getFullYear();
  const m = d.getMonth();
  return y < today.getFullYear() || (y === today.getFullYear() && m < today.getMonth());
}

/** Lo que aún se debe de un plan. */
export function installmentsOutstanding(plan: InstallmentPlan): number {
  return Math.round(
    (plan.installmentCount - plan.paidCount) * (plan.totalAmount / plan.installmentCount),
  );
}

/**
 * El mes en que se paga la última cuota de todos los planes, o null si no hay
 * ninguno abierto. Lo decide el plan que termina MÁS TARDE: "cuándo me libero"
 * es la fecha en que no queda ninguno. Un plan ya pagado no cuenta aunque
 * `status` siga en ACTIVE — `paidCount` alcanzando `installmentCount` lo cierra
 * de hecho.
 */
export function installmentsFreeFrom(
  plans: InstallmentPlan[],
): { year: number; month: number } | null {
  let latest: Date | null = null;
  for (const plan of plans) {
    if (plan.status === "CANCELLED") continue;
    if (plan.status === "COMPLETED" || plan.paidCount >= plan.installmentCount) continue;
    const d = parseLocalDate(plan.startDate);
    d.setMonth(d.getMonth() + plan.installmentCount - 1);
    if (!latest || d > latest) latest = d;
  }
  return latest ? { year: latest.getFullYear(), month: latest.getMonth() } : null;
}

/**
 * De qué lado cae un plan: te sale o te entra. Las reglas lo declaran en
 * `type`; un plan no guarda ninguno, así que el dato sale del ledger — de las
 * cuotas, no de sus partes a cobrar (una cuota compartida genera partes INCOME
 * con `splitFrom`: contarlas mandaría un gasto en cuotas a "Te entra").
 */
export function installmentPlanType(movements: Movement[], planId: string): MovementType {
  for (const m of movements) {
    if (m.installmentId !== planId || m.splitFrom) continue;
    return m.type;
  }
  return "EXPENSE";
}

/**
 * La cuota más vieja no confirmada del plan, con su número REAL (posición por
 * fecha, la misma numeración que los rótulos "Cuota i/N"). El rótulo del botón
 * y la acción no pueden nombrar cuotas distintas: ambos llaman acá.
 */
export function nextInstallmentToConfirm(
  movements: Movement[],
  plan: InstallmentPlan,
): { movement: Movement; number: number; count: number } | null {
  const ordered = planInstallments(movements, plan.id).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const index = ordered.findIndex((m) => m.status !== "CONFIRMED" && m.status !== "CANCELLED");
  if (index === -1) return null;
  return { movement: ordered[index], number: index + 1, count: plan.installmentCount };
}

// Fecha de la próxima cuota impaga; null cuando el plan está completo.
// Prefiere la fecha REAL de la cuota impaga más vieja: proyectar
// startDate + paidCount meses falla apenas se confirma fuera de orden.
export function nextInstallmentDate(movements: Movement[], plan: InstallmentPlan): string | null {
  if (plan.paidCount >= plan.installmentCount) return null;
  const pending = planInstallments(movements, plan.id)
    .filter((m) => m.status !== "CONFIRMED" && m.status !== "CANCELLED")
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (pending) return pending.date;
  const d = parseLocalDate(plan.startDate);
  d.setMonth(d.getMonth() + plan.paidCount);
  return isoDate(d);
}

// Rótulo "Cuota X/Y" por id de movimiento, para los que pertenecen a un plan.
// Movimientos cuyo plan ya no existe reciben "Cuota" a secas.
export function installmentLabels(
  movements: Movement[],
  plans: InstallmentPlan[],
): Map<string, string> {
  const byPlan = new Map<string, Movement[]>();
  for (const m of movements) {
    if (!m.installmentId || m.splitFrom) continue;
    const list = byPlan.get(m.installmentId) ?? [];
    list.push(m);
    byPlan.set(m.installmentId, list);
  }
  const labels = new Map<string, string>();
  for (const [planId, list] of byPlan) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) {
      for (const m of list) labels.set(m.id, "Cuota");
      continue;
    }
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    list.forEach((m, i) => {
      labels.set(m.id, `Cuota ${i + 1}/${plan.installmentCount}`);
    });
  }
  return labels;
}

// Preview del monto de la cuota típica (sin resto), en centavos: la última del
// reparto. La primera puede llevar hasta `count − 1` centavos extra (§1).
export function installmentAmountPreview(totalAmount: number, count: number): number {
  return reparto(totalAmount, count)[count - 1];
}

/**
 * `paidCount` y los estados de las cuotas eran dos verdades independientes que
 * se desincronizaban. El contador se deriva SIEMPRE de los movimientos (§0.3):
 * este comando devuelve el plan corregido, o null si no hay nada que cambiar.
 * Un plan sin movimientos propios conserva el contador que trae.
 */
export function syncPlanFromMovements(
  movements: Movement[],
  plan: InstallmentPlan,
): InstallmentPlan | null {
  const own = planInstallments(movements, plan.id);
  if (own.length === 0 || plan.status === "CANCELLED") return null;
  const paidCount = Math.min(
    plan.installmentCount,
    own.filter((m) => m.status === "CONFIRMED").length,
  );
  const status: InstallmentPlan["status"] =
    paidCount >= plan.installmentCount ? "COMPLETED" : "ACTIVE";
  if (plan.paidCount === paidCount && plan.status === status) return null;
  return { ...plan, paidCount, status };
}

export interface InstallmentPurchaseInput {
  type: MovementType;
  description: string;
  category: string;
  totalAmount: number;
  installmentCount: number;
  startDate: string; // YYYY-MM-DD de la primera cuota
}

export interface InstallmentPurchase {
  plan: Omit<InstallmentPlan, "id">;
  // Cuotas a persistir, sin id ni createdAt (los pone la capa de persistencia)
  // y sin installmentId (se liga al id que reciba el plan).
  movements: Omit<Movement, "id" | "createdAt" | "installmentId">[];
}

/**
 * Comando puro: el plan y sus N cuotas a partir del input. Para gastos, las
 * cuotas de meses CERRADOS nacen CONFIRMED (registrar el pasado es legítimo);
 * la del mes en curso y las futuras nacen PENDING (§2). Para ingresos en cuotas
 * todas nacen PENDING. Los días 29–31 se clampean al último día de los meses
 * cortos. La suma de las cuotas ES el total (§5, vía reparto §1).
 */
export function buildInstallmentPurchase(
  input: InstallmentPurchaseInput,
  today: Date = new Date(),
): InstallmentPurchase {
  const count = Math.max(2, input.installmentCount);
  const amounts = reparto(input.totalAmount, count);
  const start = parseLocalDate(input.startDate);
  const startDay = start.getDate();

  const movements: InstallmentPurchase["movements"] = [];
  let paidCount = 0;
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    d.setDate(Math.min(startDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    const settled = isMonthClosed(isoDate(d), today);
    const isIncome = input.type === "INCOME";
    const status: MovementStatus = isIncome ? "PENDING" : settled ? "CONFIRMED" : "PENDING";
    if (!isIncome && settled) paidCount++;
    movements.push({
      type: input.type,
      amount: amounts[i],
      description: input.description,
      category: input.category,
      status,
      date: isoDate(d),
    });
  }

  return {
    plan: {
      description: input.description,
      totalAmount: input.totalAmount,
      installmentCount: count,
      paidCount,
      startDate: input.startDate,
      status: paidCount >= count ? "COMPLETED" : "ACTIVE",
    },
    movements,
  };
}
