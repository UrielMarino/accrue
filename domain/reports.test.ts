import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Movement } from "./ledger.js";
import { othersShareByGroup } from "./ledger.js";
import {
  categoryDeltaVsAverage,
  commitmentsByMonth,
  expensesByCategory,
  monthlySeries,
  monthSummary,
  movementCountByCategory,
  pendingAsOfToday,
  spendingHistoryMonths,
  summarize,
} from "./reports.js";
import { mov, resetSeq, rule, split } from "./test-builders.js";

beforeEach(() => {
  resetSeq();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0)); // 15 de julio de 2026
});

afterEach(() => {
  vi.useRealTimers();
});

// --- monthSummary ---------------------------------------------------------

describe("monthSummary", () => {
  it("mes vacío devuelve todo en cero", () => {
    const s = monthSummary([], 2026, 6);
    expect(s).toEqual({
      received: 0,
      spent: 0,
      pendingExpense: 0,
      pendingIncome: 0,
      receivable: 0,
    });
  });

  it("separa confirmado de pendiente en ambos signos", () => {
    const movements = [
      mov({ date: "2026-07-02", type: "INCOME", amount: 500000 }),
      mov({ date: "2026-07-03", amount: 120000 }),
      mov({ date: "2026-07-20", amount: 80000, status: "PENDING" }),
      mov({ date: "2026-07-28", type: "INCOME", amount: 300000, status: "PENDING" }),
    ];
    const s = monthSummary(movements, 2026, 6);
    expect(s.received).toBe(500000);
    expect(s.spent).toBe(120000);
    expect(s.pendingExpense).toBe(80000);
    expect(s.pendingIncome).toBe(300000);
  });

  it("ignora CANCELLED y los movimientos de ahorro (pocketId)", () => {
    const movements = [
      mov({ date: "2026-07-02", amount: 90000, status: "CANCELLED" }),
      mov({ date: "2026-07-04", amount: 200000, pocketId: "p1" }),
      mov({ date: "2026-07-05", amount: 10000 }),
    ];
    const s = monthSummary(movements, 2026, 6);
    expect(s.spent).toBe(10000);
  });

  it("un gasto compartido cuenta solo tu parte, y el resto como a cobrar", () => {
    // $40.000 entre 4: tu parte son $10.000, te deben $30.000.
    const s = monthSummary(split("2026-07-10", 40000, [10000, 10000, 10000]), 2026, 6);
    expect(s.spent).toBe(10000);
    expect(s.receivable).toBe(30000);
    expect(s.received).toBe(0); // una devolución nunca es ingreso
  });

  it("no cuenta el mes vecino", () => {
    const movements = [
      mov({ date: "2026-06-30", amount: 5000 }),
      mov({ date: "2026-08-01", amount: 7000 }),
    ];
    expect(monthSummary(movements, 2026, 6).spent).toBe(0);
  });
});

// --- summarize --------------------------------------------------------------

describe("summarize", () => {
  it("netea contra el grupo completo aunque el filtro haya dejado partes afuera", () => {
    const all = split("2026-07-10", 40000, [10000, 10000, 10000]);
    const others = othersShareByGroup(all);
    // El filtro dejó sólo el gasto, sin las partes a cobrar.
    const soloGasto = all.filter((m) => !m.splitFrom);
    expect(summarize(soloGasto, others).spent).toBe(10000);
    // Calculado sobre el set filtrado, tu parte se infla al total.
    expect(summarize(soloGasto, othersShareByGroup(soloGasto)).spent).toBe(40000);
  });
});

// --- expensesByCategory / categoryDeltaVsAverage --------------------------

describe("expensesByCategory", () => {
  it("netea la parte ajena de un gasto compartido", () => {
    const movements = split("2026-07-10", 40000, [10000, 10000, 10000], "hogar");
    expect(expensesByCategory(movements, 6)).toEqual([["hogar", 10000]]);
  });

  it("respeta la ventana de meses", () => {
    const movements = [
      mov({ date: "2026-07-01", amount: 1000, category: "hogar" }),
      mov({ date: "2024-01-01", amount: 999999, category: "hogar" }),
    ];
    expect(expensesByCategory(movements, 6)).toEqual([["hogar", 1000]]);
  });
});

/**
 * El número de la pestaña Categorías. Su contrato es que sea EXACTAMENTE la
 * cantidad de filas que muestra el Historial al hacer click: mismo predicado
 * de ventana, misma categoría, sin exclusiones propias.
 */
describe("movementCountByCategory", () => {
  it("cuenta las filas del Historial, partes de reparto incluidas", () => {
    // Un gasto compartido entre 4 son CUATRO filas en el Historial: el gasto y
    // las tres partes a cobrar.
    const movements = split("2026-07-10", 40000, [10000, 10000, 10000], "hogar");
    expect(movementCountByCategory(movements, 6).get("hogar")).toBe(4);
  });

  it("no excluye ahorros ni cancelados, que el Historial sí muestra", () => {
    const movements = [
      mov({ date: "2026-07-01", category: "hogar", pocketId: "p1" }),
      mov({ date: "2026-07-02", category: "hogar", status: "CANCELLED" }),
      mov({ date: "2026-07-03", category: "hogar" }),
    ];
    expect(movementCountByCategory(movements, 6).get("hogar")).toBe(3);
  });

  it("respeta la ventana", () => {
    const movements = [
      mov({ date: "2026-07-01", category: "hogar" }),
      mov({ date: "2024-01-01", category: "hogar" }),
    ];
    expect(movementCountByCategory(movements, 6).get("hogar")).toBe(1);
  });

  it("una categoría sin movimientos en la ventana no aparece", () => {
    const movements = [mov({ date: "2024-01-01", category: "hogar" })];
    expect(movementCountByCategory(movements, 6).get("hogar")).toBeUndefined();
  });
});

describe("categoryDeltaVsAverage", () => {
  it("netea la parte ajena igual que el desglose por categoría", () => {
    // Sin netear, este gasto compartido reportaba $40.000 en una pantalla
    // y $10.000 en la otra, para la misma categoría y el mismo mes.
    const movements = split("2026-07-10", 40000, [10000, 10000, 10000], "hogar");
    const hogar = categoryDeltaVsAverage(movements, 6).find((c) => c.categoryId === "hogar");
    expect(hogar?.current).toBe(10000);
  });

  it("promedia solo los meses previos con datos, no los meses vacíos", () => {
    // Primer gasto en junio: el promedio previo es el de junio, no junio/5.
    const movements = [
      mov({ date: "2026-06-10", amount: 50000, category: "hogar" }),
      mov({ date: "2026-07-10", amount: 60000, category: "hogar" }),
    ];
    const hogar = categoryDeltaVsAverage(movements, 6).find((c) => c.categoryId === "hogar");
    expect(hogar?.average).toBe(50000);
    expect(hogar?.delta).toBe(10000);
  });

  it("sin historial previo no inventa un promedio", () => {
    const movements = [mov({ date: "2026-07-10", amount: 60000, category: "hogar" })];
    const hogar = categoryDeltaVsAverage(movements, 6).find((c) => c.categoryId === "hogar");
    expect(hogar?.average).toBe(0);
    expect(hogar?.deltaPct).toBeNull();
  });

  /**
   * H3 de INFORMES.md: el promedio alcanza hasta donde llega el período
   * elegido, no siempre 5 meses hacia atrás.
   */
  it("el promedio alcanza hasta donde llega el período elegido", () => {
    // Hoy: 15 de julio. Abril está adentro de una ventana de 6 y afuera de una
    // de 3, y su monto es el que hace distintos los dos promedios.
    const movements = [
      mov({ date: "2026-07-10", amount: 100_000, category: "hogar" }),
      mov({ date: "2026-06-10", amount: 100_000, category: "hogar" }),
      mov({ date: "2026-05-10", amount: 100_000, category: "hogar" }),
      mov({ date: "2026-04-10", amount: 400_000, category: "hogar" }),
    ];

    // Ventana de 3: julio contra junio y mayo. Abril no entra.
    const enTres = categoryDeltaVsAverage(movements, 3).find((c) => c.categoryId === "hogar");
    expect(enTres?.average).toBe(100_000);
    expect(enTres?.delta).toBe(0);

    // Ventana de 6: julio contra junio, mayo y abril — los tres meses con
    // datos de los cinco previos.
    const enSeis = categoryDeltaVsAverage(movements, 6).find((c) => c.categoryId === "hogar");
    expect(enSeis?.average).toBe(200_000);
    expect(enSeis?.delta).toBe(-100_000);
  });
});

// --- spendingHistoryMonths ------------------------------------------------

describe("spendingHistoryMonths", () => {
  it("cuenta los meses distintos con gasto confirmado dentro de la ventana", () => {
    const movements = [
      mov({ date: "2026-07-01", amount: 100 }),
      mov({ date: "2026-07-20", amount: 100 }),
      mov({ date: "2026-06-05", amount: 100 }),
    ];
    expect(spendingHistoryMonths(movements, 6)).toBe(2);
  });

  it("no cuenta meses que solo tienen pendientes o ahorros", () => {
    const movements = [
      mov({ date: "2026-07-01", amount: 100 }),
      mov({ date: "2026-06-05", amount: 100, status: "PENDING" }),
      mov({ date: "2026-05-05", amount: 100, pocketId: "p1" }),
    ];
    expect(spendingHistoryMonths(movements, 6)).toBe(1);
  });

  it("vault vacío devuelve cero", () => {
    expect(spendingHistoryMonths([], 6)).toBe(0);
  });
});

// --- monthlySeries --------------------------------------------------------

describe("monthlySeries", () => {
  it("devuelve una etiqueta y un bucket por mes, el actual último", () => {
    const s = monthlySeries([mov({ date: "2026-07-05", amount: 3000 })], 6);
    expect(s.labels).toHaveLength(6);
    expect(s.expense).toHaveLength(6);
    expect(s.expense[5]).toBe(3000);
    expect(s.expense.slice(0, 5).every((v) => v === 0)).toBe(true);
  });

  it("desambigua el mes con el año cuando la ventana cruza años", () => {
    const corta = monthlySeries([], 6);
    const larga = monthlySeries([], 24);
    expect(corta.labels[0]).not.toMatch(/\d{2}$/);
    expect(larga.labels[0]).toMatch(/\d{2}$/); // "Ago 24"
  });

  /**
   * De esta alineación depende que el drill-down del gráfico caiga en el mes
   * correcto: click en una barra → el Historial filtra por `months[i]`.
   */
  it("cada posición dice de qué mes es, alineado con su bucket", () => {
    // Hoy: 15 de julio de 2026. Seis meses son febrero a julio.
    const s = monthlySeries([mov({ date: "2026-05-05", amount: 3000 })], 6);
    expect(s.months).toHaveLength(6);
    expect(s.months[0]).toEqual({ year: 2026, month: 1 }); // febrero
    expect(s.months[5]).toEqual({ year: 2026, month: 6 }); // julio, el actual
    // El bucket con plata y el mes que lo nombra son el mismo índice.
    const i = s.expense.findIndex((v) => v > 0);
    expect(s.months[i]).toEqual({ year: 2026, month: 4 }); // mayo
  });

  it("la ventana que cruza años numera bien el año de cada mes", () => {
    const s = monthlySeries([], 8); // dic 2025 … jul 2026
    expect(s.months[0]).toEqual({ year: 2025, month: 11 });
    expect(s.months[1]).toEqual({ year: 2026, month: 0 });
  });
});

// --- Compromisos futuros --------------------------------------------------

describe("commitmentsByMonth", () => {
  it("sin datos devuelve un mes por período, todos en cero", () => {
    const months = commitmentsByMonth([], [], 3);
    expect(months).toHaveLength(3);
    expect(months.every((m) => m.total === 0)).toBe(true);
    expect(months[0].month).toBe(6); // julio, el mes en curso
    expect(months[2].month).toBe(8); // septiembre
  });

  it("cuenta los gastos pendientes ya cargados, incluidas las cuotas", () => {
    const movements = [
      mov({ date: "2026-08-10", amount: 50000, status: "PENDING", installmentId: "p1" }),
      mov({ date: "2026-08-20", amount: 20000, status: "PENDING" }),
      mov({ date: "2026-08-02", amount: 99000, status: "CONFIRMED" }), // ya pagado
    ];
    const agosto = commitmentsByMonth(movements, [], 3)[1];
    expect(agosto.recorded).toBe(70000);
    expect(agosto.installments).toBe(50000);
    expect(agosto.total).toBe(70000);
  });

  it("no cuenta dos veces una regla que ya generó su movimiento", () => {
    // La materialización genera mes actual y siguiente: esos meses tienen el
    // movimiento, y los posteriores todavía no.
    const movements = [
      mov({ date: "2026-07-05", amount: 300000, status: "PENDING", recurringId: "r1" }),
      mov({ date: "2026-08-05", amount: 300000, status: "PENDING", recurringId: "r1" }),
    ];
    const [julio, agosto, septiembre] = commitmentsByMonth(
      movements,
      [rule({ id: "r1", amount: 300000, category: "hogar" })],
      3,
    );
    expect(julio.recorded).toBe(300000);
    expect(julio.projected).toBe(0);
    expect(agosto.total).toBe(300000);
    expect(septiembre.recorded).toBe(0);
    expect(septiembre.projected).toBe(300000); // todavía no materializado
    expect(septiembre.total).toBe(300000);
  });

  it("una regla desactivada deja de comprometer plata", () => {
    const meses = commitmentsByMonth([], [rule({ id: "r1", active: false })], 3);
    expect(meses.every((m) => m.total === 0)).toBe(true);
  });

  it("una regla limitada a ciertos meses sólo compromete esos meses", () => {
    // Patente en septiembre (mes 9).
    const meses = commitmentsByMonth([], [rule({ id: "r1", months: [9], amount: 80000 })], 3);
    expect(meses.map((m) => m.total)).toEqual([0, 0, 80000]);
  });

  it("las reglas de ingreso no son un compromiso", () => {
    const meses = commitmentsByMonth([], [rule({ id: "r1", type: "INCOME" })], 3);
    expect(meses.every((m) => m.total === 0)).toBe(true);
  });

  it("de un gasto compartido pendiente sólo compromete tu parte", () => {
    const movements = split("2026-08-10", 40000, [10000, 10000, 10000]);
    movements[0].status = "PENDING";
    const agosto = commitmentsByMonth(movements, [], 3)[1];
    expect(agosto.recorded).toBe(10000);
  });
});

// --- pendingAsOfToday -------------------------------------------------------

describe("pendingAsOfToday", () => {
  it("excluye lo pendiente con fecha posterior al fin del mes en curso", () => {
    const movements = [
      mov({ date: "2026-07-20", status: "PENDING", amount: 5000 }), // este mes
      mov({ date: "2026-06-10", status: "PENDING", amount: 3000 }), // arrastrado
      mov({ date: "2026-08-01", status: "PENDING", amount: 9000 }), // futuro
    ];
    const p = pendingAsOfToday(movements);
    expect(p.toPay).toBe(8000);
    expect(p.items.map((m) => m.date)).toEqual(["2026-06-10", "2026-07-20"]);
  });

  it("netea tu parte de un gasto compartido y suma las partes a cobrar en bruto", () => {
    const [expense, ...shares] = split("2026-07-05", 40000, [10000, 10000, 10000]);
    expense.status = "PENDING";
    const p = pendingAsOfToday([expense, ...shares]);
    expect(p.toPay).toBe(10000); // tu parte, no los $40.000
    expect(p.toCollect).toBe(30000); // las tres partes, brutas
  });

  it("un ingreso pendiente suma a cobrar; confirmados y pockets no entran", () => {
    const movements = [
      mov({ date: "2026-07-10", type: "INCOME", status: "PENDING", amount: 7000 }),
      mov({ date: "2026-07-11", type: "INCOME", status: "CONFIRMED", amount: 999 }),
      mov({ date: "2026-07-12", status: "PENDING", amount: 555, pocketId: "usd" }),
    ];
    const p = pendingAsOfToday(movements);
    expect(p.toCollect).toBe(7000);
    expect(p.toPay).toBe(0);
    expect(p.items).toHaveLength(1);
  });

  it("una fecha no parseable no puede probarse futura: el pendiente queda visible", () => {
    const p = pendingAsOfToday([mov({ date: "", status: "PENDING", amount: 1000 })]);
    expect(p.toPay).toBe(1000);
  });

  it("incluye el último día del mes en curso y excluye el primero del siguiente", () => {
    // Hoy fijado: 15 de julio de 2026 (beforeEach).
    const movements = [
      mov({ date: "2026-07-31", status: "PENDING", amount: 100 }), // último día de julio
      mov({ date: "2026-08-01", status: "PENDING", amount: 200 }), // primero de agosto
    ];
    const p = pendingAsOfToday(movements);
    expect(p.toPay).toBe(100);
    expect(p.items.map((m) => m.date)).toEqual(["2026-07-31"]);
  });

  it("usa el hoy real: no recibe ni mira ningún mes navegado", () => {
    const movements = [mov({ date: "2026-03-05", status: "PENDING", amount: 300 })];
    const p = pendingAsOfToday(movements);
    expect(p.toPay).toBe(300); // marzo es pasado respecto del hoy real (julio)
  });

  it("una parte de una cuota futura no es cobrable todavía (§7)", () => {
    // Hoy: 15 de julio. La cuota del 20/7 aún no corrió.
    const movements = [
      mov({
        date: "2026-07-10",
        type: "INCOME",
        status: "PENDING",
        amount: 5000,
        splitFrom: "Caro",
        splitGroupId: "g1",
      }),
      mov({
        date: "2026-07-20",
        type: "INCOME",
        status: "PENDING",
        amount: 5000,
        splitFrom: "Caro",
        splitGroupId: "g2",
      }),
      mov({
        date: "2026-08-10",
        type: "INCOME",
        status: "PENDING",
        amount: 5000,
        splitFrom: "Caro",
        splitGroupId: "g3",
      }),
    ];
    const p = pendingAsOfToday(movements);
    expect(p.toCollect).toBe(5000); // solo la del 10/7
    expect(p.items).toHaveLength(1);
  });

  it("mis propios pendientes conservan el corte a fin de mes", () => {
    const movements = [
      mov({ date: "2026-07-28", status: "PENDING", amount: 3000 }), // tarea del mes
      mov({ date: "2026-08-02", status: "PENDING", amount: 9000 }), // futuro
    ];
    const p = pendingAsOfToday(movements);
    expect(p.toPay).toBe(3000);
  });
});

// --- Cancelaciones fuera de todo total de gasto (§8) -------------------------

describe("cancelaciones (settlement) en los agregados", () => {
  const settlement = (partial: Partial<Movement> & { date: string }) =>
    mov({ ...partial, settledTo: "Caro", settlement: { appliedTo: [] } });

  it("summarize no las cuenta como gasto ni como pendiente", () => {
    const s = summarize(
      [
        mov({ date: "2026-07-03", amount: 120000 }),
        settlement({ date: "2026-07-05", amount: 999999 }),
      ],
      new Map(),
    );
    expect(s.spent).toBe(120000);
    expect(s.pendingExpense).toBe(0);
  });

  it("un settle sin revisar (needsReview) SIGUE contando como gasto (decisión 4)", () => {
    const s = summarize(
      [mov({ date: "2026-07-05", amount: 7000, settledTo: "Caro", needsReview: true })],
      new Map(),
    );
    expect(s.spent).toBe(7000);
  });

  it("la serie mensual y las categorías también las excluyen", () => {
    const movements = [
      mov({ date: "2026-07-03", amount: 120000, category: "otros" }),
      settlement({ date: "2026-07-05", amount: 999999 }),
    ];
    const series = monthlySeries(movements, 1);
    expect(series.expense[0]).toBe(120000);
    const cats = expensesByCategory(movements);
    expect(cats.reduce((acc, [, v]) => acc + v, 0)).toBe(120000);
  });
});
