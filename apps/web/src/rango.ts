// El átomo del tiempo es un RANGO, no el mes. "Septiembre" es un preset que se
// traduce a dos fechas, no una unidad que la app entienda: por eso el estado de
// Movimientos es {desde, hasta} y nunca {año, mes}.
//
// Chirola usó el mes como átomo y ese fue el refactor caro que nunca se hizo.

export interface Rango {
  desde: string;
  hasta: string;
  etiqueta: string;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function mes(offset = 0, hoy = new Date()): Rango {
  const primero = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
  const ultimo = new Date(primero.getFullYear(), primero.getMonth() + 1, 0);
  const nombre = MESES[primero.getMonth()] ?? "";
  return {
    desde: iso(primero),
    hasta: iso(ultimo),
    etiqueta:
      primero.getFullYear() === hoy.getFullYear()
        ? nombre.charAt(0).toUpperCase() + nombre.slice(1)
        : `${nombre.charAt(0).toUpperCase() + nombre.slice(1)} ${primero.getFullYear()}`,
  };
}

export function ultimosDias(n: number, hoy = new Date()): Rango {
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - n);
  return { desde: iso(desde), hasta: iso(hoy), etiqueta: `Últimos ${n} días` };
}

export function trimestre(hoy = new Date()): Rango {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  return { desde: iso(desde), hasta: iso(hasta), etiqueta: "Trimestre" };
}

export function todo(): Rango {
  return { desde: "", hasta: "", etiqueta: "Todo" };
}

export function presets(hoy = new Date()): Rango[] {
  return [mes(0, hoy), mes(-1, hoy), ultimosDias(30, hoy), trimestre(hoy), todo()];
}
