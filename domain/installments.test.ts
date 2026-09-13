import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInstallmentPurchase,
  type InstallmentPlan,
  installmentPlanType,
  installmentsFreeFrom,
  installmentsOutstanding,
  isMonthClosed,
  nextInstallmentToConfirm,
} from "./installments.js";
import { mov, plan, resetSeq } from "./test-builders.js";

beforeEach(() => {
  resetSeq();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0)); // 15 de julio de 2026
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Cuotas ---------------------------------------------------------------

describe("installmentsOutstanding", () => {
  const p = (paidCount: number): InstallmentPlan => ({
    id: "p1",
    description: "Heladera",
    totalAmount: 120000,
    installmentCount: 12,
    paidCount,
    startDate: "2026-01-10",
    status: paidCount >= 12 ? "COMPLETED" : "ACTIVE",
  });

  it("plan sin pagar debe el total", () => {
    expect(installmentsOutstanding(p(0))).toBe(120000);
  });

  it("plan a mitad debe la mitad", () => {
    expect(installmentsOutstanding(p(6))).toBe(60000);
  });

  it("plan terminado no debe nada", () => {
    expect(installmentsOutstanding(p(12))).toBe(0);
  });
});

describe("installmentsFreeFrom", () => {
  it("lo decide el plan que termina más tarde, no el más nuevo", () => {
    const plans = [
      // Creado después, pero termina antes: 3 cuotas desde julio → septiembre.
      plan({ id: "nuevo", startDate: "2026-07-01", installmentCount: 3 }),
      // Creado antes, termina mucho después: 12 desde marzo → febrero de 2027.
      plan({ id: "viejo", startDate: "2026-03-01", installmentCount: 12 }),
    ];
    expect(installmentsFreeFrom(plans)).toEqual({ year: 2027, month: 1 });
  });

  it("un plan ya pagado no te retiene aunque siga en ACTIVE", () => {
    const plans = [
      plan({ id: "p1", startDate: "2026-03-01", installmentCount: 12, paidCount: 12 }),
      plan({ id: "p2", startDate: "2026-07-01", installmentCount: 2 }),
    ];
    expect(installmentsFreeFrom(plans)).toEqual({ year: 2026, month: 7 }); // agosto
  });

  it("sin planes abiertos no hay fecha", () => {
    expect(installmentsFreeFrom([])).toBeNull();
    expect(installmentsFreeFrom([plan({ id: "x", status: "CANCELLED" })])).toBeNull();
  });
});

/**
 * Qué cuotas nacen confirmadas al cargar una compra retroactiva. La línea es
 * el MES, no el día: registrar el pasado es legítimo, pero el mes en curso
 * todavía está en juego (§2: el almanaque no confirma nada de lo que todavía
 * estás viviendo).
 */
describe("isMonthClosed — el almanaque sólo puede dar por hecho lo cerrado", () => {
  it("un mes anterior está cerrado", () => {
    expect(isMonthClosed("2026-06-30")).toBe(true);
    expect(isMonthClosed("2025-12-01")).toBe(true);
  });

  it("el mes en curso NO, aunque el día ya haya pasado", () => {
    // Hoy es el 15 de julio: el 1 de julio ya pasó y aun así no está cerrado.
    expect(isMonthClosed("2026-07-01")).toBe(false);
    expect(isMonthClosed("2026-07-15")).toBe(false);
  });

  it("el futuro tampoco", () => {
    expect(isMonthClosed("2026-07-31")).toBe(false);
    expect(isMonthClosed("2026-08-01")).toBe(false);
  });
});

// E1: hay que saber de qué lado cae cada plan. Las reglas lo dicen en `type`;
// los planes no guardan ninguno — se lee del ledger (§0.3).
describe("installmentPlanType — de qué lado cae un plan de cuotas (E1)", () => {
  it("lee el tipo de las cuotas del plan", () => {
    const movements = [
      mov({ date: "2026-07-01", type: "INCOME", amount: 50_000, installmentId: "p1" }),
      mov({ date: "2026-08-01", type: "INCOME", amount: 50_000, installmentId: "p1" }),
    ];
    expect(installmentPlanType(movements, "p1")).toBe("INCOME");
  });

  it("un plan de gasto es gasto", () => {
    const movements = [mov({ date: "2026-07-01", amount: 50_000, installmentId: "p1" })];
    expect(installmentPlanType(movements, "p1")).toBe("EXPENSE");
  });

  it("ignora las partes a cobrar del reparto", () => {
    // Un gasto en cuotas compartido genera partes con type INCOME y
    // `splitFrom`. Tomarlas como cuotas del plan lo mandaría a "Te entra".
    const movements = [
      mov({ date: "2026-07-01", amount: 50_000, installmentId: "p1", splitGroupId: "g1" }),
      mov({
        date: "2026-07-01",
        type: "INCOME",
        amount: 25_000,
        installmentId: "p1",
        splitGroupId: "g1",
        splitFrom: "Ana",
      }),
    ];
    expect(installmentPlanType(movements, "p1")).toBe("EXPENSE");
  });

  it("un plan sin movimientos cuenta como gasto", () => {
    expect(installmentPlanType([], "p1")).toBe("EXPENSE");
  });
});

// Decisión 4 del acta: el rótulo nombra la cuota que se confirma de verdad.
describe("nextInstallmentToConfirm — rótulo y acción coinciden (H2)", () => {
  const p1 = plan({ id: "p1", installmentCount: 12 });

  it("con las cuotas en orden, la próxima es la siguiente", () => {
    const movements = [
      mov({ id: "c1", date: "2026-01-01", status: "CONFIRMED", installmentId: "p1" }),
      mov({ id: "c2", date: "2026-02-01", status: "CONFIRMED", installmentId: "p1" }),
      mov({ id: "c3", date: "2026-03-01", status: "PENDING", installmentId: "p1" }),
    ];
    const next = nextInstallmentToConfirm(movements, p1);
    expect(next?.movement.id).toBe("c3");
    expect(next?.number).toBe(3);
  });

  it("confirmando fuera de orden, nombra la que realmente va a confirmar", () => {
    // La 3 quedó pendiente y la 4 se confirmó desde Informes. paidCount valdría
    // 3 y el rótulo viejo decía "cuota 4" mientras confirmaba la 3.
    const movements = [
      mov({ id: "c1", date: "2026-01-01", status: "CONFIRMED", installmentId: "p1" }),
      mov({ id: "c2", date: "2026-02-01", status: "CONFIRMED", installmentId: "p1" }),
      mov({ id: "c3", date: "2026-03-01", status: "PENDING", installmentId: "p1" }),
      mov({ id: "c4", date: "2026-04-01", status: "CONFIRMED", installmentId: "p1" }),
    ];
    const next = nextInstallmentToConfirm(movements, p1);
    expect(next?.movement.id).toBe("c3");
    expect(next?.number).toBe(3); // no 4
  });

  it("un plan sin movimientos propios no ofrece cuota (antes el botón no hacía nada)", () => {
    expect(nextInstallmentToConfirm([], p1)).toBeNull();
  });

  it("no confunde una parte a cobrar con una cuota", () => {
    const movements = [
      mov({ id: "c1", date: "2026-01-01", status: "CONFIRMED", installmentId: "p1" }),
      mov({
        id: "s1",
        date: "2026-01-01",
        type: "INCOME",
        status: "PENDING",
        installmentId: "p1",
        splitFrom: "Caro",
      }),
    ];
    expect(nextInstallmentToConfirm(movements, p1)).toBeNull();
  });
});

// --- buildInstallmentPurchase (comando puro, §2 + §5) -----------------------

describe("buildInstallmentPurchase", () => {
  it("la suma de las cuotas ES el total, con el resto en las primeras (§1, §5)", () => {
    const { plan: p, movements } = buildInstallmentPurchase({
      type: "EXPENSE",
      description: "Heladera",
      category: "hogar",
      totalAmount: 100_000,
      installmentCount: 3,
      startDate: "2026-07-01",
    });
    expect(movements.map((m) => m.amount)).toEqual([33_334, 33_333, 33_333]);
    expect(movements.reduce((acc, m) => acc + m.amount, 0)).toBe(p.totalAmount);
  });

  it("cargada retroactiva: los meses CERRADOS nacen confirmados; el mes en curso no", () => {
    // Hoy: 15 de julio. Plan de 4 cuotas desde mayo: mayo y junio cerrados,
    // julio en curso, agosto futuro.
    const { plan: p, movements } = buildInstallmentPurchase({
      type: "EXPENSE",
      description: "Compra",
      category: "otros",
      totalAmount: 400_000,
      installmentCount: 4,
      startDate: "2026-05-10",
    });
    expect(movements.map((m) => m.status)).toEqual([
      "CONFIRMED",
      "CONFIRMED",
      "PENDING",
      "PENDING",
    ]);
    expect(p.paidCount).toBe(2);
    expect(p.status).toBe("ACTIVE");
  });

  it("un ingreso en cuotas nace todo PENDING: cada cobro se confirma al llegar", () => {
    const { plan: p, movements } = buildInstallmentPurchase({
      type: "INCOME",
      description: "Venta",
      category: "otros",
      totalAmount: 200_000,
      installmentCount: 2,
      startDate: "2026-05-01",
    });
    expect(movements.every((m) => m.status === "PENDING")).toBe(true);
    expect(p.paidCount).toBe(0);
  });

  it("los días 29-31 se clampean al último día de los meses cortos", () => {
    const { movements } = buildInstallmentPurchase({
      type: "EXPENSE",
      description: "Compra",
      category: "otros",
      totalAmount: 300_000,
      installmentCount: 3,
      startDate: "2026-01-31",
    });
    expect(movements.map((m) => m.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
});
