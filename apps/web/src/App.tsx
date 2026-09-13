import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, type Categoria, type Movimiento } from "./api.js";
import { NuevaCuotas } from "./NuevaCuotas.jsx";
import { formatCentavos, formatFechaLarga } from "./money.js";
import { presets, type Rango } from "./rango.js";

const ICONOS: Record<string, string> = {
  alimentos: "M4 7h16l-1.5 11a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8Z M9 7V5a3 3 0 0 1 6 0v2",
  vivienda: "M3 10.5 12 3l9 7.5 M5 9.5V20h14V9.5 M10 20v-6h4v6",
  transporte: "M3 7h18v9H3z M3 12h18M7 20v-2M17 20v-2",
  salud: "M12 20s-7-4.5-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7-2.7 M14 13h7M17.5 9.5v7",
  ocio: "M2.5 5h19v14h-19z M10 9.5l5 2.5-5 2.5Z",
  servicios: "M13 2 4.5 13.5H11L9.5 22 19 9.8h-6.4Z",
  ahorro: "M4 12a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3a2 2 0 0 1-2 2h-1v2h-3v-2H10v2H7v-2.3A6 6 0 0 1 4 12Z",
  otros: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 16v.01M12 13a2.2 2.2 0 1 0-2.2-2.6",
};

const VAR: Record<string, string> = {
  alimentos: "--c-alimentos",
  vivienda: "--c-vivienda",
  transporte: "--c-transporte",
  salud: "--c-salud",
  ocio: "--c-ocio",
  servicios: "--c-servicios",
  ahorro: "--c-ahorro",
  otros: "--c-otros",
};

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** VENCIDO no es un estado guardado: es pendiente con fecha pasada (§2). */
const estaVencido = (m: Movimiento) => m.status === "PENDING" && m.date < hoy();

type Filtro = "TODOS" | "EXPENSE" | "INCOME";

export function App() {
  const opciones = useMemo(() => presets(), []);
  const [rango, setRango] = useState<Rango>(opciones[0]!);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [pendientes, setPendientes] = useState(true);

  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abrirAlta, setAbrirAlta] = useState(false);
  const [menuRango, setMenuRango] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const lista = await api.movimientos(rango.desde || undefined, rango.hasta || undefined);
      setMovs(lista);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron leer los movimientos");
    } finally {
      setCargando(false);
    }
  }, [rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    api.categorias().then(setCategorias).catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    if (!menuRango) return;
    const fuera = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuRango(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuRango(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [menuRango]);

  const visibles = movs.filter(
    (m) =>
      (filtro === "TODOS" || m.type === filtro) &&
      (pendientes || m.status !== "PENDING") &&
      m.status !== "CANCELLED",
  );

  // Un solo recorrido: los totales del rango y el agrupado por día salen de las
  // mismas filas que se muestran. Si se calcularan aparte podrían discrepar.
  const porDia = new Map<string, Movimiento[]>();
  let gastos = 0;
  let ingresos = 0;
  for (const m of visibles) {
    const arr = porDia.get(m.date) ?? [];
    arr.push(m);
    porDia.set(m.date, arr);
    if (m.status === "CONFIRMED") {
      if (m.type === "EXPENSE") gastos += m.amount;
      else ingresos += m.amount;
    }
  }

  async function confirmar(id: string) {
    try {
      await api.confirmar(id);
      await cargar();
      setAviso("Movimiento confirmado");
      setTimeout(() => setAviso(null), 2600);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo confirmar");
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="mark">A</div>
        <h1>Accrue</h1>
        <nav className="nav">
          <button className="navitem" aria-current="page">Movimientos</button>
          <button className="navitem" disabled title="Todavía no">Dashboard</button>
          <button className="navitem" disabled title="Todavía no">Administración</button>
        </nav>
      </header>

      <div className="toolbar">
        <div className="menu-anchor" ref={menuRef}>
          <button
            className="btn ghost"
            aria-haspopup="true"
            aria-expanded={menuRango}
            onClick={() => setMenuRango((v) => !v)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M8 3v4M16 3v4M3 10h18" />
            </svg>
            {rango.etiqueta}
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div className={`menu${menuRango ? " open" : ""}`} role="menu">
            <div className="menu-label">Rango</div>
            {opciones.map((r) => (
              <button
                key={r.etiqueta}
                className="menu-item"
                role="menuitemradio"
                aria-checked={r.etiqueta === rango.etiqueta}
                onClick={() => {
                  setRango(r);
                  setMenuRango(false);
                }}
              >
                {r.etiqueta}
                {r.desde && <span className="rng num">{r.desde.slice(8)}–{r.hasta.slice(8)}</span>}
                <svg className="tick" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>
            ))}
          </div>
        </div>

        <div className="seg">
          <button aria-pressed={filtro === "TODOS"} onClick={() => setFiltro("TODOS")}>Todos</button>
          <button aria-pressed={filtro === "EXPENSE"} onClick={() => setFiltro("EXPENSE")}>Gastos</button>
          <button aria-pressed={filtro === "INCOME"} onClick={() => setFiltro("INCOME")}>Ingresos</button>
        </div>

        <label className="sw-toggle">
          <input type="checkbox" checked={pendientes} onChange={(e) => setPendientes(e.target.checked)} />
          <span className="track"><span className="knob" /></span>
          Incluir pendientes
        </label>

        <div className="spacer" />

        <button className="btn primary" onClick={() => setAbrirAlta(true)}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva compra en cuotas
        </button>
      </div>

      <main className="main">
        <div className="ledger">
          <div className="totales">
            <div className="tot">
              <span className="k">Gastado</span>
              <span className="v num">{formatCentavos(-gastos)}</span>
            </div>
            <div className="tot">
              <span className="k">Ingresos</span>
              {/* El verde significa ingreso. Cero no es un ingreso: va en neutro. */}
              <span className={`v num${ingresos > 0 ? " pos" : ""}`}>
                {ingresos > 0 ? formatCentavos(ingresos, { sign: true }) : "$ 0"}
              </span>
            </div>
            <div className="tot">
              <span className="k">Diferencia</span>
              <span className={`v num${ingresos - gastos > 0 ? " pos" : ""}`}>
                {ingresos - gastos === 0 ? "$ 0" : formatCentavos(ingresos - gastos, { sign: true })}
              </span>
            </div>
            {/* "Resultado" está reservado por MODEL.md §9/§10 para ingresos menos
                gastos devengados del MES, y vive en Informes. Esto es la diferencia
                de un rango arbitrario: es una composición y lleva nombre propio. */}
            <p className="tot-note">Sólo lo confirmado. Los pendientes no son hechos.</p>
          </div>

          {error && (
            <div className="problem" role="alert">
              <strong>Algo falló</strong>
              <span>{error}</span>
            </div>
          )}

          {cargando ? (
            <div className="card">
              {[0, 1, 2].map((i) => (
                <div className="sk-row" key={i}>
                  <span className="sk circle" style={{ width: 32, height: 32 }} />
                  <span style={{ flex: 1, display: "grid", gap: 6 }}>
                    <span className="sk" style={{ width: `${46 - i * 8}%`, height: 11 }} />
                    <span className="sk" style={{ width: `${30 + i * 6}%`, height: 9 }} />
                  </span>
                  <span className="sk" style={{ width: 66, height: 12 }} />
                </div>
              ))}
            </div>
          ) : visibles.length === 0 ? (
            <div className="card">
              <div className="empty">
                <p style={{ margin: 0, fontWeight: 600, color: "var(--ink-mute)" }}>
                  No hay movimientos en {rango.etiqueta.toLowerCase()}.
                </p>
                <p style={{ margin: "6px 0 0" }}>
                  Cargá una compra en cuotas y sus cuotas aparecen acá, una por mes.
                </p>
              </div>
            </div>
          ) : (
            <div className="card">
              {[...porDia.entries()].map(([dia, delDia], gi) => {
                const suma = delDia.reduce(
                  (a, m) => a + (m.type === "EXPENSE" ? -m.amount : m.amount),
                  0,
                );
                return (
                  <section key={dia}>
                    <div className="daybar">
                      <span>{formatFechaLarga(dia)}</span>
                      <span className="sum num">{formatCentavos(suma, { sign: true })}</span>
                    </div>
                    {delDia.map((m, i) => {
                      const vencido = estaVencido(m);
                      return (
                        <div
                          className="row"
                          key={m.id}
                          style={{
                            ["--c" as string]: `var(${VAR[m.category] ?? "--c-otros"})`,
                            ["--d" as string]: `${Math.min((gi * 3 + i) * 35, 300)}ms`,
                          }}
                        >
                          <span className="catico">
                            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d={ICONOS[m.category] ?? ICONOS.otros!} />
                            </svg>
                          </span>
                          <span className="body">
                            <span className="t1">{m.description}</span>
                            <span className="t2">
                              {categorias.find((c) => c.id === m.category)?.name ?? m.category}
                              {m.installmentId && " · cuota"}
                              {m.status === "PENDING" && (
                                <span className={`tag ${vencido ? "vencido" : "pendiente"}`}>
                                  <i />
                                  {vencido ? "Vencido" : "Pendiente"}
                                </span>
                              )}
                            </span>
                          </span>
                          {m.status === "PENDING" && (
                            <button className="btn quiet mini" onClick={() => void confirmar(m.id)}>
                              Confirmar
                            </button>
                          )}
                          <span className={`amt num${m.type === "INCOME" ? " pos" : ""}`}>
                            {formatCentavos(m.type === "EXPENSE" ? -m.amount : m.amount, {
                              sign: m.type === "INCOME",
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {abrirAlta && (
        <NuevaCuotas
          categorias={categorias}
          onCerrar={() => setAbrirAlta(false)}
          onCreado={(desc, n) => {
            setAbrirAlta(false);
            setAviso(`${desc} · ${n} cuotas`);
            setTimeout(() => setAviso(null), 3200);
            void cargar();
          }}
        />
      )}

      {aviso && (
        <div className="toast" role="status">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ingreso)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {aviso}
        </div>
      )}
    </div>
  );
}
