import { describe, expect, it } from "vitest";
import { reparto } from "./reparto.js";

// --- reparto (MODEL.md §1) --------------------------------------------------

describe("reparto", () => {
  it("$ 100.000,00 / 3: el resto va a las primeras partes, de a 1 centavo", () => {
    expect(reparto(10_000_000, 3)).toEqual([3_333_334, 3_333_333, 3_333_333]);
  });

  it("$ 19.444.333 / 4 cierra exacto, sin resto", () => {
    expect(reparto(1_944_433_300, 4)).toEqual([486_108_325, 486_108_325, 486_108_325, 486_108_325]);
  });

  it("$ 0,01 / 7: un centavo para la primera parte, cero para el resto", () => {
    expect(reparto(1, 7)).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });

  it("invariante: sum(reparto(total, n)) === total y las partes difieren en <= 1", () => {
    for (const total of [0, 1, 99, 100, 101, 12_345_678, 1_000_000_001]) {
      for (const n of [1, 2, 3, 7, 12, 60]) {
        const partes = reparto(total, n);
        expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...partes) - Math.min(...partes)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("rechaza totales no enteros en vez de redondear en silencio", () => {
    expect(() => reparto(100.5, 3)).toThrow();
  });
});
