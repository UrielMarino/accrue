# MODEL.md — Fase 2: Modelo conceptual

Fecha: 2026-08-08 · Insumo: AUDIT.md + decisiones de Fase 1 (criterio devengado, reparto único, nada se confirma por almanaque, compromiso = lo que falta, edición no retroactiva, leer-no-recalcular).

Estado: **FIRME** (P1–P3 resueltas el 2026-08-08, §12). Ninguna pantalla ni cálculo futuro puede contradecir este documento sin cambiarlo primero acá.

---

## 0. Principios (valen sobre cualquier sección)

1. **El ledger es la única verdad sobre lo que pasó.** Ninguna pantalla afirma "esto ocurrió" leyendo una regla, un plan o el almanaque: lo lee del movimiento.
2. **Un dato vive en un solo lugar.** Si dos pantallas pueden contradecirse sobre una cifra, el dato está duplicado y eso es el bug — no las pantallas.
3. **Leer, no recalcular.** Toda división ya repartida se guarda y las vistas la leen. Recalcular una división en la vista es un defecto aunque hoy dé igual.
4. **Resultado ≠ caja.** El resultado del mes mide consumo e ingreso devengados. Los movimientos de caja pura (cancelar una deuda, cobrar un crédito, mover plata a un ahorro) no lo tocan.
5. **Nada se confirma por almanaque.** Que una fecha haya pasado no convierte un previsto en un hecho.

---

## 1. Unidad monetaria y reparto

- **La unidad interna es el centavo (ARS), entero.** El ledger almacena enteros en centavos y toda la aritmética — repartos, sumas, comparaciones — opera en centavos.
- **La presentación no cambia:** pesos sin decimales (`formatCurrency` actual). Los inputs siguen aceptando solo pesos enteros; la conversión a centavos es interna.
- **Migración:** valores existentes × 100. **Antes** de convertir, loguear todo valor que no sea entero: si aparece alguno, hay un `parseFloat` o una división vieja arrastrando decimales y hay que verlo — prohibido redondearlo en silencio.
- Existe **una sola función de reparto** para todo lo que divide un total en partes: cuotas de un plan, partes de un gasto compartido, partes de un espacio. Hoy hay dos implementaciones (`splitShares` en store.ts y `allocateIntegers` en Spaces.tsx) más tres previews que redondean por su cuenta: queda **una**, y todo lo demás la llama o muere.
- **Regla de reparto:** división entera hacia abajo; el resto `r` se reparte de a 1 centavo a las **primeras `r` partes**, en el orden persistido de la lista.
- **Tests obligatorios en `finance.test.ts`, en centavos:**
  - `$ 100.000,00 / 3` → `reparto(10.000.000, 3) = 3.333.334, 3.333.333, 3.333.333`
  - `$ 19.444.333 / 4` → `reparto(1.944.433.300, 4) = 486.108.325 × 4` (cierra exacto)
  - `$ 0,01 / 7` → `reparto(1, 7) = 1, 0, 0, 0, 0, 0, 0`
- **Dónde cae el peso del redondeo:** en gastos compartidos, tu parte va primera en la lista → el peso del resto lo absorbés vos, nunca un tercero. En cuotas, la primera cuota.
- **Invariante testeable:** para todo total ≥ 0 y todo n ≥ 1, `sum(reparto(total, n)) === total`, y ninguna parte difiere de otra en más de 1 centavo.

---

## 2. Estados de un débito (movimiento)

- `PENDIENTE` — previsto y aún no ocurrido.
- `CONFIRMADO` — ocurrió.
- `CANCELADO` — no va a ocurrir; fuera de todo total.
- **Regla de nacimiento — la frontera es quién afirma, y para lo tipeado, la fecha:**
  - Lo que **la app genera por proyección** (materializar una recurrente, cuotas futuras de un plan) nace `PENDIENTE`, siempre — aunque el día ya haya pasado cuando se materializa.
  - Lo que **el usuario tipea con fecha pasada o de hoy** nace `CONFIRMADO`: tipear un consumo con esa fecha ES afirmar que ocurrió. Nada de tipear y después confirmar lo mismo.
  - Lo que el usuario tipea con **fecha futura** nace `PENDIENTE` (nada futuro puede haber ocurrido).
- **El paso del tiempo no confirma nada.** Un débito proyectado que llega a su fecha sigue `PENDIENTE` hasta que haya un hecho (el usuario lo marca). (Deroga: la auto-confirmación de `materializeRecurring` y el `debited: day <= today` de Fijos.)
- **`VENCIDO` no es un estado almacenado.** Es derivado: `PENDIENTE` + fecha < hoy. Se muestra con el mismo texto y color en todas las pantallas (Inicio, Fijos, donde sea). Excepción vigente que se mantiene: una deuda de terceros no "vence" — nadie pactó fecha de devolución.

## 3. Qué es un gasto

- **Gasto = tu parte de un consumo, devengada en la fecha en que se consumió.** No importa quién puso la plata ni cuándo la devolvés.
- Corolarios:
  - De un gasto compartido que pagaste vos, tu gasto es **tu parte**, no el total. (Ya vigente vía `ownShare`; se mantiene.)
  - De un gasto compartido que pagó otro, tu parte **es gasto tuyo de ese mes** — hoy es invisible; deja de serlo. Simultáneamente nace el pasivo (§8).
  - Cancelar una deuda **no es gasto** (§8). Cobrar un crédito **no es ingreso**.
  - Aportar a un ahorro no es gasto del resultado; retirar no es ingreso. (Ya vigente; se ratifica.)
- El "Resultado de {mes}" = ingresos devengados confirmados − gastos devengados confirmados de ese mes. Sin proyecciones adentro.
- **Retroactividad asumida:** bajo devengado, cargar tarde un consumo viejo (o que otro lo cargue en un espacio) modifica el resultado de un mes pasado. Es correcto y deliberado: el mes cuenta lo que se consumió en él.

## 4. Qué es un ingreso

- **Ingreso = plata que entra y es tuya** (sueldo, venta, aguinaldo). Se reconoce al **confirmarse la acreditación**; mientras tanto es `PENDIENTE` ("por acreditar") y participa de la proyección, no del resultado.
- **No son ingreso, nunca:** la parte que te devuelve alguien de un gasto compartido (es cobro de un activo, §8), un reintegro (neteo contra el gasto que lo originó), un retiro de un ahorro propio.

## 5. Compra en cuotas

- Un **plan** (total, N cuotas, fecha de la primera) genera **N débitos**, uno por mes, ligados al plan por id.
- Montos: la función de reparto de §1 sobre el total. **La suma de las cuotas ES el total del plan** — invariante, no aspiración. `installmentsOutstanding` y todo derivado suman cuotas reales del ledger, nunca `(total/N) × restantes`.
- Cada cuota es **gasto del mes en que se debita** (la cuota devenga mes a mes; la compra no se imputa entera al mes de compra).
- El estado del plan (paidCount, COMPLETED) se **deriva del ledger** (ya vigente vía `syncInstallmentPlans`; se ratifica).
- Estado al cargar un plan (§2): las cuotas con **fecha ≤ hoy nacen `CONFIRMADAS`** — cargar hoy una compra en 12 cuotas que arrancó hace 6 meses es afirmar que esas 6 ya se debitaron —; las de fecha futura nacen `PENDIENTES`. **La frontera es la fecha de cada cuota vs. hoy, no un flag manual.**
- Una compra en cuotas compartida: cada cuota es un gasto compartido (§7) con las mismas partes, repartidas con la función de §1 sobre el monto de esa cuota.

## 6. Recurrentes

- Una regla describe un débito que se repite: descripción, monto, día, tipo, meses restringidos, partes (si es compartido).
- La regla **materializa** un débito por mes, ligado **por id de regla — nunca por descripción**. La adopción heurística por descripción se ejecuta una única vez como migración de vaults legacy y se elimina; después de eso, un movimiento sin `recurringId` es un movimiento suelto, punto.
- El débito materializado nace `PENDIENTE` (§2), incluso si el día ya pasó cuando se materializa.
- **Editar la regla no reescribe el pasado** (revisado 2026-08-31, ver abajo)**:** lo que está `CONFIRMADO` conserva su monto para siempre — es un hecho ocurrido y el ledger es la única verdad sobre él (§0.1). Lo que sigue `PENDIENTE` **con fecha futura** sí se actualiza al editar la regla: todavía no ocurrió, es proyección, y un compromiso que el usuario sabe desactualizado miente en las cifras de §9. **Excepción dura:** si ese pendiente ya tiene un monto distinto del que la regla traía, fue corregido a mano y **no se toca** — la corrección puntual del usuario gana siempre sobre la propagación automática.
  - *Por qué cambió:* la versión anterior decía «los débitos ya generados — pendientes o confirmados — conservan su monto». Con la materialización cubriendo el mes en curso y el siguiente, eso significaba que subir el precio de la luz no tenía ningún efecto visible durante dos meses. El caso real que lo motivó: un servicio de monto variable ($3.000 un mes, $3.400 el otro). Se protege el pasado, no lo que todavía no pasó.
- **Corregir un débito puntual** (llegó la boleta con otro número) es editar ESE movimiento, y no toca la regla. Los dos sentidos son independientes: la regla no pisa una corrección manual, y una corrección manual no cambia la regla.
- Toda cifra "de este mes" en cualquier pantalla se lee de los **débitos materializados**, no de `rule.amount`. La regla solo alimenta meses que aún no materializó.

## 7. Gasto compartido

- Definición: **fecha de consumo + total + titular** (quien puso la plata) **+ partes por persona** (cuánto de ese total corresponde a cada uno, incluido vos).
- La división **se calcula una vez (§1) y se persiste**. Toda vista — "c/u", "te debe $X", desgloses — **lee** las partes guardadas. Prohibido volver a dividir en la vista.
- Efectos según el titular:
  - **Pagaste vos:** tu parte → gasto devengado en la fecha de consumo. Las partes ajenas → **activo** (te deben, §8). El total nunca es tu gasto.
  - **Pagó otro:** tu parte → gasto devengado en la fecha de consumo **+ pasivo** por el mismo monto (le debés al titular, §8). Las partes de terceros no te tocan.
- Un espacio es un **agrupador de gastos compartidos con miembros estables**, no un modelo distinto: sus gastos siguen estas mismas reglas. El "balance del espacio" es una vista derivada (§8), no un dato propio.
- "Quién le debe a quién" dentro de un espacio de 3+ personas se deriva **gasto por gasto** (cada gasto sabe su titular y sus partes) — deja de ser el prorrateo estimado del neto. Con esto, "te debe $X" pasa a ser exacto y el disclaimer de estimación no hace falta.

## 8. Deudas: activo, pasivo y cancelación

- **Activo** = suma de partes ajenas de gastos donde el titular sos vos, aún no cobradas. **Pasivo** = suma de tus partes de gastos donde el titular es otro, aún no saldadas.
- **Una sola fuente:** activo y pasivo se derivan de los gastos compartidos y sus cancelaciones. "Falta cobrar"/"Falta pagar" de Inicio y los saldos de Espacios leen **la misma derivación**. Queda derogado el doble registro actual (gasto del espacio + movimientos espejados como fuente paralela).
- **Cancelar una deuda es caja pura:**
  - No es gasto ni ingreso. No entra al Resultado, ni a Informes, ni a la serie mensual, ni a categorías. **No tiene categoría** (nunca más "Otros").
  - Se registra como cancelación: fecha, monto, contraparte, y contra qué gastos/espacio aplica. El ledger la muestra (pasó plata), rotulada como lo que es: "pago de deuda" / "cobro".
  - Cancelación parcial permitida: reduce el saldo; el orden de imputación es contra las deudas más viejas primero.
- Las deudas **no vencen** (§2): sin fecha pactada, un pasivo viejo es viejo, no "vencido".
- El agregado por persona ("Saldos por persona") suma deudas exactas gasto por gasto (§7) a través de todos los espacios. El "desde {fecha}" de un deudor es la fecha de su deuda viva **más vieja**, no la primera por alfabeto.

## 9. Comprometido a futuro

- **Compromiso = débitos que faltan pagar de acá a fin de la ventana** (mes en curso, o meses siguientes en vistas de proyección): cuotas pendientes + recurrentes pendientes/aún no materializadas + gastos futuros ya cargados.
- **Un peso pagado es gasto, no compromiso. Nunca ambos.** Al confirmarse un débito, sale del compromiso y entra al gasto del mes — el compromiso baja al pagar, por definición (ya no es una foto del mes: es un contador de lo que falta, con nombre honesto).
- Cuotas y recurrentes se tratan **igual** en el compromiso.
- El compromiso no es gasto: mide futuro conocido, no consumo ocurrido. El pasivo (§8) tampoco es compromiso: es deuda ya devengada. Las tres cifras — gasto, compromiso, pasivo — no comparten número jamás.
- **Composición vs. confusión de conceptos (agregado 2026-08-08, al elegir P2 de INICIO.md):**
  - **Prohibido CONFUNDIR:** presentar como un solo concepto cosas que el modelo separa. Ejemplo prohibido: sumar un cobro de deuda a Ingresos, o un settle a Gastos. El resultado es un número cuyo significado el usuario no puede reconstruir.
  - **Permitido COMPONER:** un número derivado que combina términos de distinta especie, si y solo si: (a) cada término está rotulado y visible en la misma pantalla, o accesible en un toque desde el número; (b) la operación entre términos es explícita — el usuario puede reconstruir la cuenta sin adivinar; (c) el número compuesto NO se llama con el nombre de ninguno de sus términos. "Libre este mes" es válido; llamarlo "Saldo" o "Resultado" no lo es.
  - "Libre este mes" = confirmado − falta pagar es **composición, no confusión**: los dos términos siguen existiendo por separado en el modelo y en la pantalla, y el compuesto tiene nombre propio.
- **Alcance en Fijos: solo lo fijo.** Compromiso(Fijos) = cuotas + recurrentes pendientes de la ventana. "Falta pagar"(Inicio) = fijo + gastos sueltos pendientes + pasivo. Son preguntas distintas y **deben** dar números distintos: Fijos responde "qué tengo comprometido de recurrente", Inicio "cuánta plata me falta desembolsar".
  - **Invariante testeable:** `compromiso(Fijos) ≤ faltaPagar(Inicio)`, siempre.
  - **Rótulos:** cada cifra dice qué es sin que haya que deducirlo; dos pantallas con la misma cifra y distinto nombre es ruido, no información.

## 10. Qué lee cada pantalla (mapa de fuentes)

| Cifra | Fuente única |
|---|---|
| Libre en {mes} (Inicio, protagonista — P2 de INICIO.md) | Composición §9: (ingresos − gastos confirmados) − falta pagar; términos rotulados en el ancla; ingresos por acreditar visibles aparte, no sumados |
| Resultado de {mes} | Ledger: gastos e ingresos devengados confirmados del mes — vive en Informes, ya no en Inicio |
| Ingresos / Gastos (términos del ancla de Inicio) | Ídem, por tipo |
| Falta pagar (Inicio) | Compromiso del mes restante (§9) + pasivo (§8), rotulados aparte |
| Te deben (Inicio) | Activo (§8) + ingresos por acreditar (§4), rotulados aparte |
| Fijos: debitado / falta / calendario | Débitos materializados del mes en el ledger, por estado — nunca `rule.amount`, nunca el almanaque |
| Fijos: compromiso | Cuotas + recurrentes pendientes (§9) — invariante: ≤ "Falta pagar" de Inicio |
| Espacios: saldos por espacio/persona | Derivación única de §8 |
| Detalle de espacio: lista | Todos los gastos, más nuevos primero, **sin encabezado de mes** (si algún día se filtra por mes, será un filtro explícito) |
| Detalle de espacio: "c/u", partes | Partes persistidas (§7), leídas |
| Informes (serie, categorías, insights) | Gastos devengados confirmados (§3); cancelaciones de deuda excluidas |

### 10.1 Lenguaje en pantalla (regla de UI, adoptada del benchmark el 2026-08-08)

- **Nunca vocabulario contable en la UI.** "Pasivo", "activo" y "devengado" son palabras de este documento, no de pantallas.
- Rótulos de deuda: **"te debe" / "le debés"** (y "a mano" para cero).
- Cancelaciones en el ledger: rótulo de caja ("Pago de deuda · {persona}" / "Cobro · {persona}"), tono neutro, nunca el color de gasto/ingreso.
- La justificación de una exclusión es siempre **anti-doble-conteo**, nunca contable: *"No cuenta como gasto: el consumo ya está contado en su fecha."*

## 11. Consecuencias y migraciones (para la fase de implementación)

1. **Vaults existentes — settles históricos (condicionado el 2026-08-08, decisión C3 de BENCHMARK.md):**
   - Settle **con** gasto original existente y devengado → se migra a cancelación (§8): deja de ser gasto → el Resultado de meses pasados cambia. Es la corrección del error A1, no una pérdida.
   - Settle **sin** gasto original rastreable (el gasto del espacio fue borrado, o es anterior al uso de la app) → **no se convierte ni se deja como gasto por default**: la migración lista esos casos aparte y el usuario los decide uno por uno. Convertirlo a ciegas borraría consumo real de la historia.
   - **Regla dura de toda migración:** nunca inventa ni borra historia en silencio. Si no puede determinar algo, pregunta.
2. **Partes ajenas hoy espejadas como INCOME PENDING** (`splitFrom`) se migran a la representación de activo. Ningún total debería moverse (ya estaban neteadas), pero la representación cambia.
3. **Adopción por descripción:** una pasada final de adopción legacy y se elimina la heurística (§6).
4. **Código muerto a borrar:** `pages/Installments.tsx`, `components/CommitmentsSection.tsx`, la página `Recurring` standalone (sobrevive solo `RecurringFormModal`), y `installmentsOutstanding` en su forma actual (§5 la redefine). Se borran **en la ola de código que aplique este modelo, en el mismo commit que introduce lo que las reemplaza** — no antes.
5. **Pendiente de la fase de UI (anotado, no arreglar ahora):** posible recorte de la tabla de Fijos en ventanas angostas (AUDIT B2).
6. `projectedClose` hoy suma el activo a la proyección del mes; bajo §0.4 la proyección de **resultado** incluye solo pendientes de resultado (gastos e ingresos del mes aún pendientes), no cobros de deuda. Si se quiere una vista de **caja**, es otra métrica con otro nombre.
7. **Migración a centavos (§1):** todos los montos de todos los vaults × 100, con log previo de valores no enteros (nada se redondea en silencio). Los tests de reparto se escriben en centavos.

---

## 12. Preguntas resueltas (2026-08-08)

Las tres preguntas del borrador quedaron decididas por Uriel e integradas arriba:

- **P1 → Centavos internos** (§1, migración en §11.7): ledger y aritmética en centavos enteros; presentación e inputs siguen en pesos enteros.
- **P2 → La regla distingue quién afirma** (§2, caso borde de cuotas en §5): lo proyectado por la app nace pendiente; lo tipeado con fecha ≤ hoy nace confirmado; el paso del tiempo no confirma nada.
- **P3 → Fijos muestra solo lo fijo** (§9, §10): compromiso(Fijos) ≤ faltaPagar(Inicio), con rótulos que distinguen las dos preguntas.

---

**FIN DE FASE 2 — MODELO FIRME.**
