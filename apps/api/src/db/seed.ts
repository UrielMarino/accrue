// Las categorías de sistema son las ocho del diseño, con su color fijo: el
// mismo en la lista, en la barra apilada y en el desglose. El color vive acá
// porque es dato de la categoría, no decisión de una pantalla.
import type { Db } from "./client.js";
import { categories } from "./schema.js";

export const SYSTEM_CATEGORIES = [
  { id: "alimentos", name: "Alimentos", icon: "alimentos", color: "#E0803F" },
  { id: "vivienda", name: "Vivienda", icon: "vivienda", color: "#6B5CE0" },
  { id: "transporte", name: "Transporte", icon: "transporte", color: "#1F9E92" },
  { id: "salud", name: "Salud", icon: "salud", color: "#D4568A" },
  { id: "ocio", name: "Entretenimiento", icon: "ocio", color: "#C0553D" },
  { id: "servicios", name: "Servicios", icon: "servicios", color: "#7E9A2B" },
  { id: "ahorro", name: "Ahorro", icon: "ahorro", color: "#0F9D63" },
  { id: "otros", name: "Otros", icon: "otros", color: "#7A8797" },
] as const;

export async function seedSystemCategories(db: Db): Promise<void> {
  await db
    .insert(categories)
    .values(SYSTEM_CATEGORIES.map((c) => ({ ...c, isSystem: true })))
    .onConflictDoNothing();
}
