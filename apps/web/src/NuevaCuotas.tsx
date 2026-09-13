import { reparto } from "@accrue/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, type Categoria } from "./api.js";
import { formatCentavos, formatCentavosExactos, parsePesos } from "./money.js";

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Props {
  categorias: Categoria[];
  onCerrar: () => void;
  onCreado: (descripcion: string, cuotas: number) => void;
}

/**
 * El alta de una compra en cuotas. Es un ACTO, no una pantalla: se abre encima
 * de Movimientos, se completa y se va.
 *
 * La previsualización llama al `reparto()` del dominio — la misma función que
 * corre el server. Mostrar `total / n` redondeado acá haría que el número del
 * formulario no coincida con el que queda guardado.
 */
export function NuevaCuotas({ categorias, onCerrar, onCreado }: Props) {
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState(categorias[0]?.id ?? "otros");
  const [tipo, setTipo] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [importe, setImporte] = useState("");
  const [cuotas, setCuotas] = useState("12");
  const [desde, setDesde] = useState(hoyISO());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primerCampo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    primerCampo.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCerrar]);

  const total = parsePesos(importe);
  const n = Number(cuotas);
  const nValido = Number.isInteger(n) && n >= 2 && n <= 120;

  const partes = useMemo(
    () => (total && total > 0 && nValido ? reparto(total, n) : null),
    [total, n, nValido],
  );
  const primera = partes?.[0] ?? null;
  const resto = partes && partes.length > 1 ? (partes[partes.length - 1] ?? null) : null;
  const hayResto = primera !== null && resto !== null && primera !== resto;
  const diferencia = hayResto && primera !== null && resto !== null ? primera - resto : 0;
  const visibleEnPesos =
    hayResto && primera !== null && resto !== null
      ? Math.round(primera / 100) !== Math.round(resto / 100)
      : false;

  const puedeGuardar = !!total && nValido && descripcion.trim().length > 0 && !enviando;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeGuardar || !total) return;
    setError(null);
    setEnviando(true);
    try {
      const { plan } = await api.crearPlan({
        type: tipo,
        description: descripcion.trim(),
        category: categoria,
        totalAmount: total,
        installmentCount: n,
        startDate: desde,
      });
      onCreado(plan.description, plan.installmentCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el plan");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header className="sheet-head">
          <h2 id="sheet-title">Compra en cuotas</h2>
          <button className="btn quiet icon" onClick={onCerrar} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <form className="sheet-body" onSubmit={guardar}>
          <div className="field">
            <label htmlFor="n-desc">¿Qué compraste?</label>
            <input
              ref={primerCampo}
              id="n-desc"
              className="input"
              value={descripcion}
              maxLength={60}
              placeholder="Heladera Samsung"
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <div className="row2">
            <div className="field">
              <label htmlFor="n-total">Total</label>
              <input
                id="n-total"
                className="input money num"
                inputMode="numeric"
                placeholder="0"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="n-cuotas">Cuotas</label>
              <input
                id="n-cuotas"
                className={`input num${cuotas && !nValido ? " bad" : ""}`}
                inputMode="numeric"
                value={cuotas}
                onChange={(e) => setCuotas(e.target.value)}
              />
            </div>
          </div>
          {cuotas && !nValido && (
            <span className="hint err" style={{ marginTop: -8 }}>
              Entre 2 y 120. Con una sola cuota es un movimiento suelto, no un plan.
            </span>
          )}

          <div className="row2">
            <div className="field">
              <label htmlFor="n-cat">Categoría</label>
              <select
                id="n-cat"
                className="select"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="n-desde">Primera cuota</label>
              <input
                id="n-desde"
                className="input num"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="n-tipo">Tipo</label>
            <div className="seg" id="n-tipo">
              <button type="button" aria-pressed={tipo === "EXPENSE"} onClick={() => setTipo("EXPENSE")}>
                Gasto
              </button>
              <button type="button" aria-pressed={tipo === "INCOME"} onClick={() => setTipo("INCOME")}>
                Ingreso
              </button>
            </div>
          </div>

          {partes && primera !== null && resto !== null ? (
            <dl className="preview">
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
                  No divide exacto: la primera cuota lleva {formatCentavosExactos(diferencia)} más.
                  El resto siempre cae en la tuya, nunca en la de un tercero.
                </p>
              )}
            </dl>
          ) : (
            <p className="preview-vacio">
              Escribí un total y la cantidad de cuotas para ver cómo queda el reparto.
            </p>
          )}

          {error && (
            <div className="problem" role="alert">
              <strong>No se pudo crear el plan</strong>
              <span>{error}</span>
            </div>
          )}

          <footer className="sheet-foot">
            <button type="button" className="btn quiet" onClick={onCerrar}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={!puedeGuardar}>
              {enviando ? "Creando…" : "Crear plan"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
