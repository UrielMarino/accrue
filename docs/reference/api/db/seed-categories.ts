// Catálogo de sistema, sembrado idempotentemente al migrar. Ids estables (los
// movimientos los referencian; import-cauri F3 mapea contra ellos). Íconos =
// nombres Lucide kebab-case del set curado del front; colores = paleta de 12
// de categoría (tokens --color-cat-* en el front).

export const SYSTEM_OTHERS_ID = "otros";

export const SYSTEM_CATEGORIES = [
  { id: "hogar", name: "Hogar", icon: "house", color: "ladrillo" },
  { id: "supermercado", name: "Supermercado", icon: "shopping-cart", color: "oliva" },
  { id: "comida", name: "Comida afuera", icon: "utensils", color: "naranja" },
  { id: "transporte", name: "Transporte", icon: "bus", color: "celeste" },
  { id: "servicios", name: "Servicios", icon: "receipt", color: "mostaza" },
  { id: "salud", name: "Salud", icon: "heart-pulse", color: "rosa" },
  { id: "entretenimiento", name: "Entretenimiento", icon: "gamepad-2", color: "orquidea" },
  { id: "ropa", name: "Ropa", icon: "shirt", color: "naranja" },
  { id: "educacion", name: "Educación", icon: "graduation-cap", color: "cian" },
  { id: "suscripciones", name: "Suscripciones", icon: "repeat", color: "indigo" },
  { id: "ingresos", name: "Ingresos", icon: "banknote", color: "menta" },
  { id: SYSTEM_OTHERS_ID, name: "Otros", icon: "tag", color: "piedra" },
] as const;
