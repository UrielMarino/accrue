import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { carriedPending, isOverdue, matchesQuery } from "./ledger.js";
import { mov, resetSeq } from "./test-builders.js";

beforeEach(() => {
  resetSeq();
  vi.useFakeTimers();
  // Mitad de mes, para que la lógica de días tenga aire de los dos lados.
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0)); // 15 de julio de 2026
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Vencidos y arrastres -------------------------------------------------

describe("isOverdue / carriedPending", () => {
  it("una parte a cobrar nunca vence: nadie pactó esa fecha", () => {
    const share = mov({
      date: "2026-05-01",
      type: "INCOME",
      status: "PENDING",
      splitFrom: "Ana",
      splitGroupId: "g1",
    });
    expect(isOverdue(share)).toBe(false);
  });

  it("un gasto pendiente con fecha pasada sí vence", () => {
    expect(isOverdue(mov({ date: "2026-07-01", status: "PENDING" }))).toBe(true);
    expect(isOverdue(mov({ date: "2026-07-30", status: "PENDING" }))).toBe(false);
  });

  it("arrastra sólo los pendientes de meses anteriores", () => {
    const movements = [
      mov({ date: "2026-05-10", status: "PENDING", description: "Viejo" }),
      mov({ date: "2026-07-02", status: "PENDING", description: "De este mes" }),
      mov({ date: "2026-05-11", status: "CONFIRMED", description: "Ya pagado" }),
      mov({ date: "2026-04-01", status: "CANCELLED", description: "Cancelado" }),
    ];
    const carried = carriedPending(movements);
    expect(carried.map((m) => m.description)).toEqual(["Viejo"]);
  });
});

// --- matchesQuery -----------------------------------------------------------

describe("matchesQuery", () => {
  const cafe = mov({ date: "2026-07-10", description: "Café de la esquina" });

  it("una búsqueda vacía no filtra nada", () => {
    expect(matchesQuery(cafe, "")).toBe(true);
    expect(matchesQuery(cafe, "   ")).toBe(true);
  });

  it("ignora mayúsculas y acentos en ambas direcciones", () => {
    expect(matchesQuery(cafe, "cafe")).toBe(true);
    expect(matchesQuery(cafe, "CAFÉ")).toBe(true);
    expect(matchesQuery(cafe, "esquina")).toBe(true);
  });

  it("no trae lo que no coincide", () => {
    expect(matchesQuery(cafe, "alquiler")).toBe(false);
  });

  it("busca también en el nombre de la categoría vía el resolver", () => {
    const name = (id?: string) => (id === "otros" ? "Supermercado" : "");
    expect(matchesQuery(cafe, "supermercado", name)).toBe(true);
  });
});
