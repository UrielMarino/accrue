// LA función de reparto (MODEL.md §1). Todo lo que divide un total en partes
// —cuotas de un plan, partes de un gasto compartido, partes de un espacio—
// llama acá. Cualquier otra división de montos es un defecto.
//
// Regla: división entera hacia abajo; el resto se reparte de a 1 centavo a las
// PRIMERAS `r` partes, en el orden persistido de la lista. En gastos
// compartidos tu parte va primera, así el peso del resto lo absorbés vos; en
// cuotas, la primera cuota.
//
// Invariantes (con test): sum(reparto(total, n)) === total para todo total ≥ 0
// y n ≥ 1, y ninguna parte difiere de otra en más de 1 centavo.
export function reparto(total: number, parts: number): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`reparto: el total debe ser un entero ≥ 0 (recibió ${total})`);
  }
  if (!Number.isInteger(parts) || parts < 1) {
    throw new Error(`reparto: las partes deben ser un entero ≥ 1 (recibió ${parts})`);
  }
  const base = Math.floor(total / parts);
  const resto = total - base * parts;
  return Array.from({ length: parts }, (_, i) => (i < resto ? base + 1 : base));
}
