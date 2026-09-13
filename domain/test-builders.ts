// Builders compartidos por los tests de cada feature. No forma parte de la API
// pública del paquete.

import type { InstallmentPlan } from "./installments.js";
import type { Movement, MovementStatus, MovementType } from "./ledger.js";
import type { RecurringRule } from "./recurring.js";

let seq = 0;

export function resetSeq(): void {
  seq = 0;
}

export function mov(partial: Partial<Movement> & { date: string }): Movement {
  seq += 1;
  return {
    id: `m${seq}`,
    type: "EXPENSE" as MovementType,
    amount: 1000,
    description: "Movimiento",
    category: "otros",
    status: "CONFIRMED" as MovementStatus,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

// Un gasto compartido: el total más una parte a cobrar por cada otra persona.
export function split(
  date: string,
  total: number,
  shares: number[],
  category = "otros",
): Movement[] {
  const groupId = `g${date}-${total}`;
  const expense = mov({ date, amount: total, category, splitGroupId: groupId });
  return [
    expense,
    ...shares.map((amount, i) =>
      mov({
        date,
        amount,
        type: "INCOME",
        status: "PENDING",
        category,
        splitGroupId: groupId,
        splitFrom: `Persona ${i + 1}`,
      }),
    ),
  ];
}

export function rule(partial: Partial<RecurringRule> & { id: string }): RecurringRule {
  return {
    description: "Alquiler",
    category: "otros",
    amount: 100_000,
    type: "EXPENSE" as MovementType,
    dayOfMonth: 5,
    active: true,
    ...partial,
  } as RecurringRule;
}

export function plan(partial: Partial<InstallmentPlan> & { id: string }): InstallmentPlan {
  return {
    description: "Heladera",
    totalAmount: 300_000,
    installmentCount: 3,
    paidCount: 0,
    startDate: "2026-07-01",
    status: "ACTIVE",
    ...partial,
  } as InstallmentPlan;
}
