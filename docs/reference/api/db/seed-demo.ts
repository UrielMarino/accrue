// Datos ficticios para mirar la UI con volumen real (PLAN.md, próximo paso 4:
// «seed de datos de prueba como script»). NO corre en `migrate`: es un
// subcomando aparte y DESTRUCTIVO — borra todos los movimientos antes.
//
// Genera 4 meses alrededor de hoy con la densidad de un mes de verdad
// (~70 movimientos en el mes en curso): sueldo, suscripciones, expensas y
// servicios, super, comida afuera, transporte, cuotas de un plan de 12,
// partes a cobrar (§7), un pago de deuda (§8), pendientes, vencidos y un
// cancelado. Determinista: mismo seed → mismo dataset.

import { randomUUID } from "node:crypto";
import type { Db } from "./client.js";
import { movements, recurringRules, settlementAllocations } from "./schema.js";

type Status = "CONFIRMED" | "PENDING" | "CANCELLED";

interface DemoMovement {
  type: "INCOME" | "EXPENSE";
  amount: number; // centavos
  description: string;
  categoryId: string;
  date: string;
  status?: Status; // por defecto lo decide la regla de nacimiento (§2)
  installmentId?: string;
  recurringId?: string;
  splitGroupId?: string;
  splitFrom?: string;
  isSettlement?: boolean;
}

/** PRNG determinista: el dataset no cambia entre corridas. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
/** Redondea a la centena de pesos: los montos ficticios se leen como reales. */
const pesos = (n: number) => Math.round(n / 100) * 100 * 100;

export function buildDemoMovements(today: string): DemoMovement[] {
  const rnd = mulberry32(0xc41c01a);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const between = (lo: number, hi: number) => pesos(lo + rnd() * (hi - lo));
  const day = (max: number, lo = 1) => Math.min(max, lo + Math.floor(rnd() * (max - lo + 1)));

  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;
  // Dos meses atrás, el actual y el siguiente: alcanza para navegar con ← →.
  const months = [-2, -1, 0, 1].map((off) => {
    const d = new Date(ty, tm + off, 1);
    return { y: d.getFullYear(), m: d.getMonth(), off };
  });

  const out: DemoMovement[] = [];
  const add = (mv: DemoMovement) => out.push(mv);

  const SUPER = ["Coto", "Carrefour", "Dia", "Jumbo", "el chino", "Vea"];
  const COMIDA = [
    "Almuerzo oficina",
    "Café con Mica",
    "Pizza con Fede",
    "Delivery sushi",
    "Empanadas",
    "Cena con los chicos",
    "Desayuno en Havanna",
    "Milanesas del bodegón",
  ];
  const TRANSPORTE = ["Carga SUBE", "Nafta", "Uber", "Peaje", "Estacionamiento", "Cabify"];
  const VARIOS: [string, string][] = [
    ["Regalo cumple Sofi", "otros"],
    ["Corte de pelo", "otros"],
    ["Zapatillas", "ropa"],
    ["Remera", "ropa"],
    ["Farmacia", "salud"],
    ["Dentista", "salud"],
    ["Libro de Kubernetes", "educacion"],
    ["Cine", "entretenimiento"],
    ["Recital", "entretenimiento"],
    ["Ferretería", "hogar"],
    ["Veterinario", "salud"],
    ["Cargador USB-C", "otros"],
  ];

  // Plan de 12 cuotas de una notebook, arrancado 4 meses antes de hoy.
  const planStart = new Date(ty, tm - 4, 20);

  for (const { y, m, off } of months) {
    const last = daysInMonth(y, m);
    const isFuture = off > 0;

    // — Ingresos —
    add({
      type: "INCOME",
      amount: pesos(1_850_000),
      description: "Sueldo Yoizen",
      categoryId: "ingresos",
      date: iso(y, m, 1),
      recurringId: "rec-sueldo",
    });
    if (rnd() > 0.35) {
      add({
        type: "INCOME",
        amount: between(90_000, 260_000),
        description: pick(["Freelance · sitio Mica", "Freelance · landing", "Venta Marketplace"]),
        categoryId: "ingresos",
        date: iso(y, m, day(26, 10)),
      });
    }

    // — Fijos del mes (día estable, como en la vida real) —
    const fijos: [string, string, number, number][] = [
      ["Alquiler", "hogar", 5, 420_000],
      ["Expensas", "hogar", 10, 65_000],
      ["Luz (Edesur)", "servicios", 14, 32_000],
      ["Gas", "servicios", 17, 21_000],
      ["Internet Fibertel", "servicios", 8, 38_000],
      ["Celular Personal", "servicios", 12, 19_500],
      ["Prepaga OSDE", "salud", 3, 145_000],
    ];
    for (const [description, categoryId, d, base] of fijos) {
      add({
        type: "EXPENSE",
        amount: between(base * 0.94, base * 1.08),
        description,
        categoryId,
        date: iso(y, m, Math.min(d, last)),
        recurringId: `rec-${categoryId}-${d}`,
      });
    }

    // — Suscripciones —
    const subs: [string, number, number][] = [
      ["Netflix", 20, 9_500],
      ["Spotify", 22, 6_900],
      ["Gimnasio", 6, 34_000],
      ["iCloud", 25, 2_400],
      ["ChatGPT Plus", 18, 27_000],
    ];
    for (const [description, d, base] of subs) {
      add({
        type: "EXPENSE",
        amount: pesos(base),
        description,
        categoryId: "suscripciones",
        date: iso(y, m, Math.min(d, last)),
        recurringId: `rec-sub-${description}`,
      });
    }

    // — Cuota del plan —
    const nCuota = (y - planStart.getFullYear()) * 12 + (m - planStart.getMonth()) + 1;
    if (nCuota >= 1 && nCuota <= 12) {
      add({
        type: "EXPENSE",
        amount: pesos(48_500),
        description: `Cuota ${nCuota}/12 · Notebook`,
        categoryId: "otros",
        date: iso(y, m, Math.min(20, last)),
        installmentId: "plan-notebook",
      });
    }

    // — Variable: super, comida, transporte, varios —
    for (let i = 0; i < 5 + Math.floor(rnd() * 3); i++) {
      add({
        type: "EXPENSE",
        amount: between(38_000, 145_000),
        description: `Supermercado ${pick(SUPER)}`,
        categoryId: "supermercado",
        date: iso(y, m, day(last)),
      });
    }
    for (let i = 0; i < 8 + Math.floor(rnd() * 6); i++) {
      add({
        type: "EXPENSE",
        amount: between(6_500, 34_000),
        description: pick(COMIDA),
        categoryId: "comida",
        date: iso(y, m, day(last)),
      });
    }
    for (let i = 0; i < 6 + Math.floor(rnd() * 5); i++) {
      add({
        type: "EXPENSE",
        amount: between(3_000, 28_000),
        description: pick(TRANSPORTE),
        categoryId: "transporte",
        date: iso(y, m, day(last)),
      });
    }
    for (let i = 0; i < 4 + Math.floor(rnd() * 4); i++) {
      const [description, categoryId] = pick(VARIOS);
      add({
        type: "EXPENSE",
        amount: between(12_000, 190_000),
        description,
        categoryId,
        date: iso(y, m, day(last)),
      });
    }

    // — Una parte a cobrar (§7): la cena que pagó él y le deben —
    if (!isFuture && rnd() > 0.4) {
      const groupId = `split-${y}-${m}`;
      const d = iso(y, m, day(last - 2, 4));
      add({
        type: "EXPENSE",
        amount: between(45_000, 90_000),
        description: "Cena compartida · Don Julio",
        categoryId: "comida",
        date: d,
        splitGroupId: groupId,
      });
      add({
        type: "INCOME",
        amount: between(20_000, 40_000),
        description: "Cena compartida · Don Julio",
        categoryId: "comida",
        date: d,
        splitGroupId: groupId,
        splitFrom: "Fede",
        status: "PENDING",
      });
    }
  }

  // — Vencidos del mes en curso: cargados a fecha pasada y sin confirmar —
  const cur = months[2] as { y: number; m: number };
  const hoyD = Number(today.slice(8, 10));
  const back = (n: number) => iso(cur.y, cur.m, Math.max(1, hoyD - n));
  add({
    type: "EXPENSE",
    amount: pesos(74_000),
    description: "Patente del auto · 4° cuota",
    categoryId: "servicios",
    date: back(6),
    status: "PENDING",
  });
  add({
    type: "EXPENSE",
    amount: pesos(23_500),
    description: "ABL",
    categoryId: "hogar",
    date: back(3),
    status: "PENDING",
  });

  // — Un cancelado y un pago de deuda, para ver esas dos filas —
  add({
    type: "EXPENSE",
    amount: pesos(58_000),
    description: "Vuelo a Córdoba (se canceló)",
    categoryId: "otros",
    date: back(9),
    status: "CANCELLED",
  });
  add({
    type: "EXPENSE",
    amount: pesos(62_000),
    description: "Le pagué a Mica",
    categoryId: "otros",
    date: back(2),
    isSettlement: true,
  });

  return out;
}

/** Regla de nacimiento §2: fecha ≤ hoy nace CONFIRMED, futura PENDING. */
function birthStatus(mv: DemoMovement, today: string): Status {
  return mv.status ?? (mv.date <= today ? "CONFIRMED" : "PENDING");
}

/** Las reglas de fijos que respaldan los `recurringId` de arriba. Sin esto los
 *  movimientos apuntarían a reglas inexistentes y la pantalla Fijos mostraría
 *  débitos huérfanos, sin saber de qué regla vienen. Los ids DEBEN coincidir
 *  con los que usa `buildDemoMovements`. */
const DEMO_RULES = [
  {
    id: "rec-sueldo",
    description: "Sueldo Yoizen",
    categoryId: "ingresos",
    amount: pesos(1_850_000),
    type: "INCOME" as const,
    dayOfMonth: 1,
  },
  {
    id: "rec-hogar-5",
    description: "Alquiler",
    categoryId: "hogar",
    amount: pesos(420_000),
    type: "EXPENSE" as const,
    dayOfMonth: 5,
  },
  {
    id: "rec-hogar-10",
    description: "Expensas",
    categoryId: "hogar",
    amount: pesos(65_000),
    type: "EXPENSE" as const,
    dayOfMonth: 10,
  },
  {
    id: "rec-servicios-14",
    description: "Luz (Edesur)",
    categoryId: "servicios",
    amount: pesos(32_000),
    type: "EXPENSE" as const,
    dayOfMonth: 14,
  },
  {
    id: "rec-servicios-17",
    description: "Gas",
    categoryId: "servicios",
    amount: pesos(21_000),
    type: "EXPENSE" as const,
    dayOfMonth: 17,
  },
  {
    id: "rec-servicios-8",
    description: "Internet Fibertel",
    categoryId: "servicios",
    amount: pesos(38_000),
    type: "EXPENSE" as const,
    dayOfMonth: 8,
  },
  {
    id: "rec-servicios-12",
    description: "Celular Personal",
    categoryId: "servicios",
    amount: pesos(19_500),
    type: "EXPENSE" as const,
    dayOfMonth: 12,
  },
  {
    id: "rec-salud-3",
    description: "Prepaga OSDE",
    categoryId: "salud",
    amount: pesos(145_000),
    type: "EXPENSE" as const,
    dayOfMonth: 3,
  },
  {
    id: "rec-sub-Netflix",
    description: "Netflix",
    categoryId: "suscripciones",
    amount: pesos(9_500),
    type: "EXPENSE" as const,
    dayOfMonth: 20,
  },
  {
    id: "rec-sub-Spotify",
    description: "Spotify",
    categoryId: "suscripciones",
    amount: pesos(6_900),
    type: "EXPENSE" as const,
    dayOfMonth: 22,
  },
  {
    id: "rec-sub-Gimnasio",
    description: "Gimnasio",
    categoryId: "suscripciones",
    amount: pesos(34_000),
    type: "EXPENSE" as const,
    dayOfMonth: 6,
  },
  {
    id: "rec-sub-iCloud",
    description: "iCloud",
    categoryId: "suscripciones",
    amount: pesos(2_400),
    type: "EXPENSE" as const,
    dayOfMonth: 25,
  },
  {
    id: "rec-sub-ChatGPT Plus",
    description: "ChatGPT Plus",
    categoryId: "suscripciones",
    amount: pesos(27_000),
    type: "EXPENSE" as const,
    dayOfMonth: 18,
  },
  // Un fijo pausado y un aguinaldo, para ver esos dos casos en la pantalla.
  {
    id: "rec-cochera",
    description: "Cochera",
    categoryId: "transporte",
    amount: pesos(55_000),
    type: "EXPENSE" as const,
    dayOfMonth: 5,
    active: false,
  },
  {
    id: "rec-aguinaldo",
    description: "Aguinaldo",
    categoryId: "ingresos",
    amount: pesos(925_000),
    type: "INCOME" as const,
    dayOfMonth: 20,
    months: [6, 12],
  },
];

/** DESTRUCTIVO: vacía movements (y sus imputaciones) y siembra el dataset. */
export async function seedDemo(db: Db): Promise<number> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const list = buildDemoMovements(today);
  await db.delete(settlementAllocations);
  await db.delete(movements);
  await db.delete(recurringRules);
  await db.insert(recurringRules).values(
    DEMO_RULES.map((r) => ({
      ...r,
      active: r.active ?? true,
      months: r.months ?? null,
    })),
  );
  await db.insert(movements).values(
    list.map((mv) => ({
      id: randomUUID(),
      type: mv.type,
      amount: mv.amount,
      description: mv.description,
      categoryId: mv.categoryId,
      status: birthStatus(mv, today),
      date: mv.date,
      recurringId: mv.recurringId,
      installmentId: mv.installmentId,
      splitGroupId: mv.splitGroupId,
      splitFrom: mv.splitFrom,
      isSettlement: !!mv.isSettlement,
    })),
  );
  return list.length;
}
