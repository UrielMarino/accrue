// El "hoy" contable es el de Buenos Aires, no el del reloj del server: si el
// server corre en UTC, entre las 21 y la medianoche argentina daría mañana, y
// una cuota cargada a esa hora nacería en el mes equivocado.
const AR = "America/Argentina/Buenos_Aires";

export function todayInBuenosAires(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}
