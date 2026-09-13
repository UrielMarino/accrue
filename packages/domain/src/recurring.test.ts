import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRecurringMaterializations,
  FIXED_STATE_ORDER,
  type FixedEvent,
  fixedMonthEvents,
  fixedMonthTotals,
  fixedRowState,
  planMonthAmount,
  ruleExpenseTotal,
} from "./recurring.js";
import { mov, plan, resetSeq, rule } from "./test-builders.js";

beforeEach(() => {
  resetSeq();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0)); // 15 de julio de 2026
});

afterEach(() => {
  vi.useRealTimers();
});

// Decisión 1 del acta: Fijos lee el ledger, no el almanaque.
describe("fixedMonthEvents — Fijos lee el ledger (H1)", () => {
  it("un fijo con fecha pasada y sin movimiento da VENCIDO, no 'debitado'", () => {
    // Hoy: 15 de julio. La regla vence el día 5 y el ledger no tiene nada.
    const events = fixedMonthEvents([], [rule({ id: "r1", dayOfMonth: 5 })], [], 2026, 6);
    expect(events).toHaveLength(1);
    expect(events[0].materialized).toBe(false);
    expect(events[0].confirmed).toBe(false);
    expect(events[0].overdue).toBe(true);
  });

  it("un pendiente cuyo día ya pasó está VENCIDO aunque el almanaque diga que 'ya debitó'", () => {
    const movements = [mov({ date: "2026-07-05", status: "PENDING", recurringId: "r1" })];
    const events = fixedMonthEvents(movements, [rule({ id: "r1" })], [], 2026, 6);
    expect(events[0].confirmed).toBe(false);
    expect(events[0].overdue).toBe(true);
  });

  it("sólo CONFIRMED cuenta como debitado, sin importar el día", () => {
    // Día 28 (futuro) pero confirmado: pagado por adelantado, es un hecho.
    const movements = [mov({ date: "2026-07-28", status: "CONFIRMED", recurringId: "r1" })];
    const events = fixedMonthEvents(movements, [rule({ id: "r1", dayOfMonth: 28 })], [], 2026, 6);
    expect(events[0].confirmed).toBe(true);
    expect(events[0].overdue).toBe(false);
    expect(fixedMonthTotals(events).paid).toBe(1000);
  });

  it("el monto sale del movimiento, no de rule.amount (§6: editar la regla no reescribe el pasado)", () => {
    const movements = [
      mov({ date: "2026-07-05", status: "PENDING", amount: 88_000, recurringId: "r1" }),
    ];
    const events = fixedMonthEvents(movements, [rule({ id: "r1", amount: 100_000 })], [], 2026, 6);
    expect(events[0].amount).toBe(88_000);
  });

  it("el monto de la cuota sale del movimiento, no de totalAmount/installmentCount", () => {
    // reparto(100_000, 3) = 33.334 / 33.333 / 33.333 — el redondeo ingenuo daría 33.333
    const movements = [
      mov({ date: "2026-07-01", status: "PENDING", amount: 33_334, installmentId: "p1" }),
    ];
    const events = fixedMonthEvents(
      movements,
      [],
      [plan({ id: "p1", totalAmount: 100_000, installmentCount: 3 })],
      2026,
      6,
    );
    expect(events[0].amount).toBe(33_334);
  });

  it("una parte a cobrar no es un débito fijo aunque arrastre el installmentId", () => {
    const movements = [
      mov({ date: "2026-07-01", status: "PENDING", amount: 30_000, installmentId: "p1" }),
      mov({
        date: "2026-07-01",
        type: "INCOME",
        status: "PENDING",
        amount: 10_000,
        installmentId: "p1",
        splitFrom: "Caro",
      }),
    ];
    const events = fixedMonthEvents(movements, [], [plan({ id: "p1" })], 2026, 6);
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(30_000);
  });

  it("una regla pausada no debe nada este mes", () => {
    const events = fixedMonthEvents([], [rule({ id: "r1", active: false })], [], 2026, 6);
    expect(events).toHaveLength(0);
  });

  it("los totales separan pagado, pendiente y vencido del mismo set", () => {
    const movements = [
      mov({ date: "2026-07-02", status: "CONFIRMED", amount: 50_000, recurringId: "r1" }),
      mov({ date: "2026-07-08", status: "PENDING", amount: 30_000, recurringId: "r2" }), // vencido
      mov({ date: "2026-07-28", status: "PENDING", amount: 20_000, recurringId: "r3" }), // por venir
    ];
    const rules = [rule({ id: "r1" }), rule({ id: "r2" }), rule({ id: "r3" })];
    const totals = fixedMonthTotals(fixedMonthEvents(movements, rules, [], 2026, 6));
    expect(totals.paid).toBe(50_000);
    expect(totals.pending).toBe(50_000);
    expect(totals.overdue).toBe(30_000);
    expect(totals.overdueCount).toBe(1);
    expect(totals.pendingCount).toBe(2);
  });
});

describe("fixedRowState — en qué balde cae cada fijo", () => {
  const ev = (partial: Partial<FixedEvent>): FixedEvent => ({
    source: "rule",
    sourceId: "r1",
    type: "EXPENSE",
    day: 5,
    amount: 1000,
    materialized: true,
    confirmed: false,
    overdue: false,
    ...partial,
  });

  it("lo vencido va primero", () => {
    expect(fixedRowState({ event: ev({ overdue: true }) })).toBe("overdue");
  });

  it("lo pendiente sin vencer, después", () => {
    expect(fixedRowState({ event: ev({}) })).toBe("pending");
  });

  it("lo pagado, después", () => {
    expect(fixedRowState({ event: ev({ confirmed: true }) })).toBe("paid");
  });

  it("sin evento este mes es inactivo: pausado, o aguinaldo fuera de junio", () => {
    expect(fixedRowState({ event: undefined })).toBe("idle");
  });

  it("terminado gana sobre todo, aunque tuviera evento", () => {
    expect(fixedRowState({ event: ev({ overdue: true }), finished: true })).toBe("done");
  });

  it("el orden de los baldes es vencido → pendiente → pagado → inactivo → terminado", () => {
    const ranks = (["overdue", "pending", "paid", "idle", "done"] as const).map(
      (s) => FIXED_STATE_ORDER[s],
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(5);
  });
});

describe("planMonthAmount — un plan sin cuota este mes no debita nada", () => {
  it("un plan terminado no inventa una cuota", () => {
    // 12 cuotas desde julio de 2025: en julio de 2026 ya no queda ninguna.
    const p = plan({ id: "p1", startDate: "2025-07-01", installmentCount: 12, paidCount: 12 });
    const event = fixedMonthEvents([], [], [p], 2026, 6).find((e) => e.sourceId === "p1");
    expect(planMonthAmount(event)).toBeNull();
  });

  it("un plan que todavía no empezó tampoco", () => {
    const p = plan({ id: "p1", startDate: "2026-11-01", installmentCount: 6 });
    const event = fixedMonthEvents([], [], [p], 2026, 6).find((e) => e.sourceId === "p1");
    expect(planMonthAmount(event)).toBeNull();
  });

  it("un plan en curso debita el monto de SU cuota, no el promedio", () => {
    // El reparto pone el resto en las primeras cuotas, así que el promedio no
    // es el monto de ninguna cuota real.
    const movements = [
      mov({ date: "2026-07-05", amount: 33_334, status: "PENDING", installmentId: "p1" }),
    ];
    const p = plan({
      id: "p1",
      startDate: "2026-07-01",
      installmentCount: 3,
      totalAmount: 100_000,
    });
    const event = fixedMonthEvents(movements, [], [p], 2026, 6).find((e) => e.sourceId === "p1");
    expect(planMonthAmount(event)).toBe(33_334);
  });
});

// --- buildRecurringMaterializations (comando puro, §2 + §6) -----------------

describe("buildRecurringMaterializations", () => {
  it("materializa mes actual y siguiente, todo PENDIENTE aunque el día haya pasado", () => {
    const out = buildRecurringMaterializations([], [rule({ id: "r1", dayOfMonth: 5 })]);
    expect(out.map((m) => m.date)).toEqual(["2026-07-05", "2026-08-05"]);
    expect(out.every((m) => m.status === "PENDING")).toBe(true);
    expect(out.every((m) => m.recurringId === "r1")).toBe(true);
  });

  it("no duplica un mes que ya tiene el movimiento de la regla (dedup por id)", () => {
    const existing = [mov({ date: "2026-07-05", status: "CONFIRMED", recurringId: "r1" })];
    const out = buildRecurringMaterializations(existing, [rule({ id: "r1", dayOfMonth: 5 })]);
    expect(out.map((m) => m.date)).toEqual(["2026-08-05"]);
  });

  it("una regla restringida a ciertos meses sólo materializa en ellos", () => {
    // Aguinaldo en junio y diciembre: en julio/agosto no genera nada.
    const out = buildRecurringMaterializations([], [rule({ id: "r1", months: [6, 12] })]);
    expect(out).toHaveLength(0);
  });

  it("los días 29-31 se clampean al último día del mes corto", () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0)); // 15 de enero
    const out = buildRecurringMaterializations([], [rule({ id: "r1", dayOfMonth: 31 })]);
    expect(out.map((m) => m.date)).toEqual(["2026-01-31", "2026-02-28"]);
  });
});

// El pie de la pantalla Fijos: lista reglas, no cuotas, así que su total no
// puede ser el total general del mes.
describe("ruleExpenseTotal — el pie de Fijos suma la columna que muestra", () => {
  it("deja afuera las cuotas: sólo los débitos de reglas", () => {
    const movements = [
      mov({ date: "2026-07-05", status: "CONFIRMED", amount: 100_000, recurringId: "r1" }),
      mov({ date: "2026-07-10", status: "PENDING", amount: 30_000, installmentId: "p1" }),
    ];
    const events = fixedMonthEvents(movements, [rule({ id: "r1" })], [plan({ id: "p1" })], 2026, 6);
    expect(fixedMonthTotals(events).paid + fixedMonthTotals(events).pending).toBe(130_000);
    expect(ruleExpenseTotal(events)).toBe(100_000);
  });

  it("suma pagado + por pagar y deja afuera los ingresos fijos", () => {
    const movements = [
      mov({ date: "2026-07-05", status: "CONFIRMED", amount: 100_000, recurringId: "r1" }),
      mov({ date: "2026-07-20", status: "PENDING", amount: 40_000, recurringId: "r2" }),
      mov({
        date: "2026-07-01",
        status: "CONFIRMED",
        type: "INCOME",
        amount: 900_000,
        recurringId: "r3",
      }),
    ];
    const rules = [
      rule({ id: "r1" }),
      rule({ id: "r2", dayOfMonth: 20 }),
      rule({ id: "r3", type: "INCOME", dayOfMonth: 1 }),
    ];
    expect(ruleExpenseTotal(fixedMonthEvents(movements, rules, [], 2026, 6))).toBe(140_000);
  });

  it("un débito CANCELLED no revive como no materializado con rule.amount (§10)", () => {
    const movements = [
      mov({ date: "2026-07-05", status: "CANCELLED", amount: 100_000, recurringId: "r1" }),
    ];
    const events = fixedMonthEvents(movements, [rule({ id: "r1", amount: 100_000 })], [], 2026, 6);
    expect(events).toHaveLength(0);
    expect(ruleExpenseTotal(events)).toBe(0);
  });
});
