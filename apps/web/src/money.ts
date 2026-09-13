// Formato de plata, una sola vez para toda la app (§1 del modelo): pesos
// enteros, punto de miles, signo ANTES del símbolo, y el menos tipográfico
// U+2212 en vez de un guion — alinea con los dígitos.
//
// La unidad interna es el centavo. Nada de esto aparece en pantalla: se divide
// acá y en ningún otro lado.

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function formatCentavos(centavos: number, opts: { sign?: boolean } = {}): string {
  const pesos = Math.round(Math.abs(centavos) / 100);
  const sign = opts.sign ? (centavos < 0 ? "−" : "+") : centavos < 0 ? "−" : "";
  return `${sign}$ ${nf.format(pesos)}`;
}

/** Lo tipeado en un campo de importe → centavos enteros. Acepta "12.400" y
 *  "12400"; devuelve null si no hay un número usable, para que el formulario
 *  distinga "vacío" de "cero". */
export function parsePesos(raw: string): number | null {
  const clean = raw.replace(/[^\d]/g, "");
  if (!clean) return null;
  return Number(clean) * 100;
}

export function formatPesosInput(centavos: number): string {
  return nf.format(Math.round(centavos / 100));
}

const LARGO = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" });

/** "2026-09-12" → "12 sep". Parsea a mano: `new Date(iso)` lo leería como UTC
 *  y en Argentina mostraría el día anterior. */
export function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return LARGO.format(new Date(y, m - 1, d)).replace(".", "");
}

export function formatMesAnio(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, d),
  );
}

/** El único lugar donde los centavos SE MUESTRAN: cuando el resto de un reparto
 *  es más chico que un peso, decir "$ 0" sería mentir sobre por qué las cuotas
 *  no son todas iguales. */
export function formatCentavosExactos(centavos: number): string {
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100);
  const cent = abs % 100;
  const cuerpo = pesos > 0 ? `${nf.format(pesos)},${String(cent).padStart(2, "0")}` : `0,${String(cent).padStart(2, "0")}`;
  return `${centavos < 0 ? "−" : ""}$ ${cuerpo}`;
}

/** "2026-09-12" → "Hoy · viernes 12" o "Viernes 12 de septiembre". El día
 *  relativo gana cuando aplica: nadie piensa la fecha de hoy en formato largo. */
export function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const fecha = new Date(y, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((fecha.getTime() - hoy.getTime()) / 86_400_000);
  const dia = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric" }).format(fecha);
  const cap = dia.charAt(0).toUpperCase() + dia.slice(1);
  if (dias === 0) return `Hoy · ${dia}`;
  if (dias === -1) return `Ayer · ${dia}`;
  if (dias === 1) return `Mañana · ${dia}`;
  const mes = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(fecha);
  return `${cap} de ${mes}`;
}
