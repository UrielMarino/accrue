import { reparto } from "@accrue/domain";
import { useEffect, useMemo, useState } from "react";
import {
  formatCentavos,
  formatCentavosExactos,
  formatFecha,
  formatMesAnio,
  parsePesos,
} from "./money.js";

// Las ocho categorías del sistema, con su color fijo. Vienen de la API en
// cuanto exista el endpoint; hoy es la misma lista que siembra el server.
const CATEGORIAS = [
  { id: "alimentos", nombre: "Alimentos", v: "--c-alimentos" },
  { id: "vivienda", nombre: "Vivienda", v: "--c-vivienda" },
  { id: "transporte", nombre: "Transporte", v: "--c-transporte" },
  { id: "salud", nombre: "Salud", v: "--c-salud" },
  { id: "ocio", nombre: "Entretenimiento", v: "--c-ocio" },
  { id: "servicios", nombre: "Servicios", v: "--c-servicios" },
  { id: "ahorro", nombre: "Ahorro", v: "--c-ahorro" },
  { id: "otros", nombre: "Otros", v: "--c-otros" },
] as const;

const colorDe = (id: string) => CATEGORIAS.find((c) => c.id === id)?.v ?? "--c-otros";

interface Plan {
  id: string;
  description: string;
  totalAmount: number;
  installmentCount: number;
  paidCount: number;
  startDate: string;
  status: string;
  category: string | null;
}
interface Cuota {
  id: string;
  number: number;
  amount: number;
  date: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
}

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function App() {
  const [descripcion, setDescripcion] = useState("Heladera Samsung");
  const [categoria, setCategoria] = useState<string>("vivienda");
  const [tipo, setTipo] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [importe, setImporte] = useState("890.000");
  const [cuotas, setCuotas] = useState("12");
  const [desde, setDesde] = useState(hoyISO());

  const [planes, setPlanes] = useState<Plan[]>([]);
  const [cuotasDe, setCuotasDe] = useState<Record<string, Cuota[]>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const total = parsePesos(importe);
  const n = Number(cuotas);
  const nValido = Number.isInteger(n) && n >= 2 && n <= 120;

  // La previsualización usa LA función de reparto del dominio: exactamente la
  // misma que corre el server. Si acá mostráramos total/n redondeado, el número
  // del formulario no coincidiría con el que queda guardado.
  const partes = useMemo(
    () => (total && total > 0 && nValido ? reparto(total, n) : null),
    [total, n, nValido],
  );
  const primera = partes?.[0] ?? null;
  const resto = partes && partes.length > 1 ? partes[partes.length - 1] ?? null : null;
  const hayResto = primera !== null && resto !== null && primera !== resto;
  const diferencia = hayResto && primera !== null && resto !== null ? primera - resto : 0;
  // ¿La diferencia del reparto se nota en pesos enteros, que es como se muestra?
  const visibleEnPesos =
    hayResto && primera !== null && resto !== null
      ? Math.round(primera / 100) !== Math.round(resto / 100)
      : false;

  async function cargar() {
    const res = await fetch("/api/installment-plans");
    if (res.ok) setPlanes(await res.json());
  }

  /** Las cuotas se piden recién al abrir el plan: la lista no las necesita y
   *  pedirlas todas de entrada sería traer cientos de filas para mostrar una. */
  async function traerCuotas(planId: string) {
    if (cuotasDe[planId]) return;
    const res = await fetch(`/api/installment-plans/${planId}/installments`);
    if (!res.ok) return;
    const lista: Cuota[] = await res.json();
    setCuotasDe((prev) => ({ ...prev, [planId]: lista }));
  }
  useEffect(() => {
    void cargar();
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!total || !nValido) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/installment-plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: tipo,
          description: descripcion,
          category: categoria,
          totalAmount: total,
          installmentCount: n,
          startDate: desde,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.errors?.[0]?.message ? `${body.title}: ${body.errors[0].message}` : body.title);
        return;
      }
      setCuotasDe((prev) => ({ ...prev, [body.plan.id]: body.installments }));
      setAbierto(body.plan.id);
      setAviso(`${body.plan.description} · ${body.plan.installmentCount} cuotas`);
      setTimeout(() => setAviso(null), 3200);
      await cargar();
    } catch {
      setError("No se pudo hablar con el servidor. ¿Está corriendo la API?");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="mark">A</div>
        <h1>Accrue</h1>
        <span className="where">Compras en cuotas</span>
      </header>

      <main className="main">
        <div className="page">
          <section>
            <div className="head">
              <h2>Nueva compra en cuotas</h2>
              <p>
                El reparto lo hace el dominio, no esta pantalla: lo que ves abajo es exactamente lo
                que se va a guardar.
              </p>
            </div>

            <div className="card card-pad">
              <form className="form" onSubmit={crear}>
                <div className="field">
                  <label htmlFor="f-tipo">Tipo</label>
                  <div className="seg" id="f-tipo">
                    <button
                      type="button"
                      aria-pressed={tipo === "EXPENSE"}
                      onClick={() => setTipo("EXPENSE")}
                    >
                      Gasto
                    </button>
                    <button
                      type="button"
                      aria-pressed={tipo === "INCOME"}
                      onClick={() => setTipo("INCOME")}
                    >
                      Ingreso
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="f-desc">Descripción</label>
                  <input
                    id="f-desc"
                    className="input"
                    value={descripcion}
                    maxLength={60}
                    onChange={(e) => setDescripcion(e.target.value)}
                  />
                  <span className="hint">Lo que vas a reconocer dentro de seis meses.</span>
                </div>

                <div className="field">
                  <label htmlFor="f-cat">Categoría</label>
                  <select
                    id="f-cat"
                    className="select"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="row2">
                  <div className="field">
                    <label htmlFor="f-total">Total</label>
                    <input
                      id="f-total"
                      className="input money num"
                      inputMode="numeric"
                      value={importe}
                      onChange={(e) => setImporte(e.target.value)}
                    />
                    <span className="hint">Pesos enteros.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="f-cuotas">Cuotas</label>
                    <input
                      id="f-cuotas"
                      className={`input num${cuotas && !nValido ? " bad" : ""}`}
                      inputMode="numeric"
                      value={cuotas}
                      onChange={(e) => setCuotas(e.target.value)}
                    />
                    {cuotas && !nValido ? (
                      <span className="hint err">Entre 2 y 120. Con una sola no es un plan.</span>
                    ) : (
                      <span className="hint">Mínimo 2.</span>
                    )}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="f-desde">Primera cuota</label>
                  <input
                    id="f-desde"
                    className="input num"
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                  />
                  <span className="hint">
                    Puede ser pasada: las cuotas de meses ya cerrados nacen confirmadas.
                  </span>
                </div>

                {partes && primera !== null && resto !== null ? (
                  <dl className="preview">
                    {/* El reparto puede diferir en centavos, y la presentación es
                        en pesos enteros: mostrar dos líneas con el MISMO número
                        y un cartel diciendo que no divide exacto se lee como un
                        error. Cuando la diferencia no se ve en pesos, va una
                        sola línea y el resto se nombra en centavos, que es donde
                        realmente está. */}
                    {visibleEnPesos ? (
                      <>
                        <div className="line">
                          <dt>Primera cuota</dt>
                          <dd className="num">{formatCentavos(primera)}</dd>
                        </div>
                        <div className="line">
                          <dt>Las otras {n - 1}</dt>
                          <dd className="num">{formatCentavos(resto)}</dd>
                        </div>
                      </>
                    ) : (
                      <div className="line">
                        <dt>Cada cuota</dt>
                        <dd className="num">{formatCentavos(resto)}</dd>
                      </div>
                    )}
                    <div className="line">
                      <dt>Suma</dt>
                      <dd className="num">{formatCentavos(partes.reduce((a, b) => a + b, 0))}</dd>
                    </div>
                    {hayResto && (
                      <p className="note">
                        No divide exacto: la primera cuota lleva {formatCentavosExactos(diferencia)}{" "}
                        más. El resto siempre cae en la tuya, nunca en la de un tercero.
                      </p>
                    )}
                  </dl>
                ) : null}

                {error && (
                  <div className="problem" role="alert">
                    <strong>No se pudo crear el plan</strong>
                    <span>{error}</span>
                  </div>
                )}

                <button
                  className="btn primary"
                  type="submit"
                  disabled={enviando || !total || !nValido || !descripcion.trim()}
                >
                  {enviando ? "Creando…" : "Crear plan"}
                </button>
              </form>
            </div>
          </section>

          <section>
            <div className="head">
              <h2>Planes activos</h2>
              <p>Tocá uno para ver sus cuotas, con el estado con el que nacieron.</p>
            </div>

            <div className="card">
              {planes.length === 0 ? (
                <p className="empty">
                  Todavía no hay ningún plan.
                  <br />
                  El primero que cargues aparece acá.
                </p>
              ) : (
                planes.map((p) => {
                  const abiertoEste = abierto === p.id;
                  const lista = cuotasDe[p.id];
                  return (
                    <div className="plan" key={p.id}>
                      <button
                        className="plan-head"
                        aria-expanded={abiertoEste}
                        style={{ ["--c" as string]: `var(${colorDe(p.category ?? "otros")})` }}
                        onClick={() => { setAbierto(abiertoEste ? null : p.id); if (!abiertoEste) void traerCuotas(p.id); }}
                      >
                        <span className="catico">{p.installmentCount}</span>
                        <span className="body">
                          <span className="t1">{p.description}</span>
                          <span className="t2">
                            {p.installmentCount} cuotas · desde {formatMesAnio(p.startDate)} ·{" "}
                            {p.paidCount} pagas
                          </span>
                        </span>
                        <span className="amt num">{formatCentavos(-p.totalAmount)}</span>
                        <svg
                          className="chev"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                      <div className={`drawer${abiertoEste ? " open" : ""}`}>
                        <div>
                          {lista ? (
                            <div className="cuotas">
                              {lista.map((c) => (
                                <div className="cuota" key={c.id}>
                                  <span className="n num">{c.number}</span>
                                  <span className="f num">{formatFecha(c.date)}</span>
                                  <span className={`tag ${c.status}`}>
                                    <i />
                                    {c.status === "CONFIRMED" ? "Confirmada" : "Pendiente"}
                                  </span>
                                  <span className="m num">{formatCentavos(-c.amount)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="empty" style={{ padding: "var(--s5)" }}>
                              Buscando las cuotas…
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </main>

      {aviso && (
        <div className="toast" role="status">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ingreso)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Plan creado · {aviso}
        </div>
      )}
    </div>
  );
}
