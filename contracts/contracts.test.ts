import type { MovementStatus, MovementType } from "@chirola/domain";
import { describe, expect, it } from "vitest";
import {
  createMovementSchema,
  listMovementsQuerySchema,
  movementSchema,
  updateMovementSchema,
} from "./movements.js";
import type { MOVEMENT_STATUSES, MOVEMENT_TYPES } from "./shared.js";

// Guard anti-fuga (PLAN.md #6): igualdad de tipos en AMBAS direcciones.
// Si el dominio agrega, borra o renombra un estado, este archivo deja de tipar.
type WireStatus = (typeof MOVEMENT_STATUSES)[number];
type WireType = (typeof MOVEMENT_TYPES)[number];
type MutuallyAssignable<A extends B, B> = [B] extends [A] ? true : never;
const statusesMatch: MutuallyAssignable<WireStatus, MovementStatus> = true;
const typesMatch: MutuallyAssignable<WireType, MovementType> = true;

describe("contracts ↔ domain: los enums no pueden divergir", () => {
  it("la igualdad se verifica a nivel de tipos (ver guard arriba)", () => {
    expect(statusesMatch).toBe(true);
    expect(typesMatch).toBe(true);
  });
});

describe("createMovementSchema", () => {
  const valid = {
    type: "EXPENSE",
    amount: 150000,
    description: "Café",
    category: "otros",
    date: "2026-08-27",
  };

  it("acepta un alta válida", () => {
    expect(createMovementSchema.parse(valid)).toMatchObject(valid);
  });

  it("rechaza montos con decimales (centavos son enteros, §1)", () => {
    expect(createMovementSchema.safeParse({ ...valid, amount: 100.5 }).success).toBe(false);
  });

  it("rechaza monto cero y negativo (el signo lo da `type`)", () => {
    expect(createMovementSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(createMovementSchema.safeParse({ ...valid, amount: -100 }).success).toBe(false);
  });

  it("rechaza fechas mal formateadas Y fechas imposibles", () => {
    expect(createMovementSchema.safeParse({ ...valid, date: "27/08/2026" }).success).toBe(false);
    expect(createMovementSchema.safeParse({ ...valid, date: "2026-08-27T10:00:00Z" }).success).toBe(
      false,
    );
    expect(createMovementSchema.safeParse({ ...valid, date: "2026-13-05" }).success).toBe(false);
    expect(createMovementSchema.safeParse({ ...valid, date: "2026-02-31" }).success).toBe(false);
  });

  it("el estado NO viaja en el alta: lo decide la regla de nacimiento (§2)", () => {
    const parsed = createMovementSchema.parse({ ...valid, status: "CONFIRMED" });
    expect("status" in parsed).toBe(false);
  });

  it("recorta espacios de la descripción y rechaza descripciones vacías", () => {
    expect(createMovementSchema.parse({ ...valid, description: "  Café  " }).description).toBe(
      "Café",
    );
    expect(createMovementSchema.safeParse({ ...valid, description: "   " }).success).toBe(false);
  });
});

describe("updateMovementSchema", () => {
  it("acepta un patch parcial", () => {
    expect(updateMovementSchema.safeParse({ amount: 5000 }).success).toBe(true);
  });

  it("rechaza el patch vacío: {} no es una actualización", () => {
    expect(updateMovementSchema.safeParse({}).success).toBe(false);
  });
});

describe("listMovementsQuerySchema", () => {
  it("coerciona year/month desde query strings y respeta 0-based", () => {
    const q = listMovementsQuerySchema.parse({ year: "2026", month: "0" });
    expect(q).toMatchObject({ year: 2026, month: 0 });
  });

  it("rechaza month fuera de rango", () => {
    expect(listMovementsQuerySchema.safeParse({ month: "12" }).success).toBe(false);
  });

  it('"" significa "sin filtro", nunca un valor (select sin elegir)', () => {
    const q = listMovementsQuerySchema.parse({ year: "", month: "", status: "", type: "" });
    expect(q.year).toBeUndefined();
    expect(q.month).toBeUndefined();
    expect(q.status).toBeUndefined();
    expect(q.type).toBeUndefined();
  });
});

describe("movementSchema", () => {
  it("acepta un movimiento completo del ledger", () => {
    const m = {
      id: "m1",
      type: "INCOME",
      amount: 500000,
      description: "Sueldo",
      category: "ingresos",
      status: "PENDING",
      date: "2026-09-01",
      createdAt: "2026-08-27T12:00:00.000Z",
    };
    expect(movementSchema.parse(m)).toMatchObject(m);
  });

  it("rechaza un createdAt que no sea timestamp ISO", () => {
    const m = {
      id: "m1",
      type: "EXPENSE",
      amount: 1000,
      description: "x",
      category: "otros",
      status: "CONFIRMED",
      date: "2026-08-27",
      createdAt: "ayer",
    };
    expect(movementSchema.safeParse(m).success).toBe(false);
  });
});
