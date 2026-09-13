# UI.md — Cómo se muestra el ledger

Fecha: 2026-09-12 · Estado: **vigente** · Deriva de: [MODEL.md](../MODEL.md)

Este documento no decide nada nuevo sobre el dominio: traduce a pantalla lo que
MODEL.md ya resolvió. Donde los dos se contradigan, **manda MODEL.md** y este
archivo está mal.

Existe para que estas preguntas no se vuelvan a discutir desde cero: cómo se
muestra cada tipo de movimiento, dónde viven las deudas con otras personas, y
qué pasa cuando hay muchas filas.

---

## 0. La regla de alcance

**No se construye una vista que lea datos que todavía no se pueden cargar.**

Un filtro por persona con el total de lo que te debe es inútil mientras no exista
el alta de gasto compartido. Y al revés: en cuanto el alta existe, la vista pasa
a ser obligatoria, porque hay datos cargados que no se pueden ver.

De ahí el orden de trabajo, que no es negociable por entusiasmo:

1. Compra en cuotas ✅
2. Movimiento suelto
3. Fijos (recurrentes)
4. Gastos compartidos — **último**, porque arrastra deudas, cobros e imputación
   FIFO, que es la mitad de §7 y §8

El antecedente: el proyecto anterior tenía 138 tests en verde y murió con el alta
de cuotas sin existir, después de reescribir la misma tabla siete veces.

---

## 1. Una sola lista, diferenciada por etiqueta

Movimientos **no se parte en secciones por tipo**. El ledger es la verdad
cronológica de lo que pasó (§0.1); separarlo en cuatro listas rompe el agrupado
por día y obliga a mirar en cuatro lugares para saber qué pasó el martes.

Todos los tipos comparten la misma forma de fila. Lo que cambia es una etiqueta
en la línea secundaria y, en un caso, el color del monto.

| Tipo | Etiqueta | Monto que se muestra |
| --- | --- | --- |
| Gasto suelto | ninguna | el gasto |
| Cuota de un plan | `Cuota 3/12` | el monto de esa cuota |
| Fijo materializado | `Fijo` | **lo materializado del mes**, nunca `rule.amount` (§6) |
| Compartido | `Compartido · tu parte` | **tu parte, no el total** (§7) |
| Ingreso | ninguna | en verde, con signo `+` |
| Cancelación de deuda | `Cobro · Ana` / `Pago de deuda · Ana` | **en neutro: ni verde ni rojo** (§10.1) |

### La fila más fácil de arruinar

**Cancelar una deuda no es gasto ni ingreso.** Es caja pura: no tiene categoría,
no entra al Resultado, ni a informes, ni a la serie mensual, ni a categorías
(§8). Aparece en el ledger porque pasó plata, y sólo por eso.

Si se pinta de verde, el usuario suma un cobro a sus ingresos y el número deja de
significar algo que pueda reconstruir. La justificación que se le muestra es
siempre anti-doble-conteo, nunca contable:

> No cuenta como gasto: el consumo ya está contado en su fecha.

### Vocabulario

Nunca palabras contables en pantalla. "Pasivo", "activo" y "devengado" son
vocabulario de MODEL.md, no de la UI. En pantalla: **"te debe"**, **"le debés"**,
y **"a mano"** para cero.

---

## 2. Gastos compartidos y personas

### Qué es un movimiento y qué no

Si pagaste una cena de $30.000 y te tocan $10.000: **tu gasto es $10.000**. Los
$20.000 ajenos **no son un movimiento tuyo** — son un derivado, calculado gasto
por gasto a partir de las partes persistidas (§7, §8).

No hay movimiento espejo que anotar, ni que confirmar, ni que borrar cuando te
pagan. Esto deroga el doble registro del proyecto anterior, donde las partes
ajenas vivían como `INCOME PENDING` y eran una fuente paralela que se
desincronizaba.

La división **se calcula una vez y se persiste**. Toda vista lee las partes
guardadas. Volver a dividir en la vista es un defecto aunque dé el mismo número
(§0.3).

### Dónde viven los saldos

**"Cuánto me debe Ana" no es una pregunta del ledger.** El ledger responde "qué
pasó en septiembre": tiene rango y orden cronológico. Un saldo no tiene rango —
atraviesa todos los meses y sigue vivo hasta que se cancele.

Son dos verbos distintos, así que son dos lugares distintos. Los saldos van en su
propio panel (**"Saldos por persona"**), no como un filtro de Movimientos.
Mezclarlos haría que el mismo control responda dos preguntas incompatibles.

Detalle que ya está decidido: el "desde {fecha}" de un deudor es la fecha de su
deuda viva **más vieja**, no la primera por orden alfabético.

### Cobrar

Registrar un cobro es registrar una **cancelación**: fecha, monto, contraparte y
contra qué gastos aplica. Admite parcial, y **se imputa contra las deudas más
viejas primero** (FIFO, §8). Las deudas **no vencen**: sin fecha pactada, un
saldo viejo es viejo, no "vencido".

---

## 3. Fijos

Una regla describe un débito que se repite; **no es un movimiento**. Materializa
uno por mes, ligado **por id de regla, nunca por descripción** (§6).

En la lista, un fijo materializado se ve como cualquier otro movimiento con la
etiqueta `Fijo`. No tiene tratamiento visual especial, y esto es deliberado: el
usuario quiere ver qué pasó ese día, y que Spotify sea recurrente no cambia que
el martes salieron $6.200.

Dos cosas que la UI **no** debe hacer:

- Mostrar `rule.amount` como cifra del mes. Toda cifra "de este mes" se lee del
  débito materializado.
- Confirmar algo porque la fecha pasó. El paso del tiempo no confirma nada (§2).

Editar la regla no reescribe el pasado; sí actualiza pendientes **futuros**,
salvo que ya tengan un monto corregido a mano — la corrección puntual del usuario
gana siempre.

---

## 4. Volumen: ni scroll infinito ni paginado

La pregunta parece de rendimiento y en realidad es de correctitud.

### El problema real

Si la lista carga de a pedazos, **los totales del encabezado mienten**. Sumar las
filas cargadas hace que "Gastado" diga una cifra a medio scrollear y otra al
final. Eso es peor que lento: es incorrecto, y es exactamente el tipo de número
que el usuario no puede reconstruir.

### La decisión

1. **Los totales salen de un endpoint de agregados** (`GROUP BY` en SQL), nunca
   de las filas cargadas en el cliente. El encabezado es verdadero desde el
   primer frame, cargue lo que cargue la lista.
2. **Con rango acotado, se carga el rango entero.** Un mes son decenas de filas.
   No hay problema que resolver, y ni el scroll infinito ni el paginado se
   justifican.
3. **Virtualizar arriba de ~200 filas.** Eso es rendimiento de pintado y es
   ortogonal a cómo se traen los datos.
4. **Keyset sólo para "Todo"**, que es el único rango sin techo. Nunca `OFFSET`:
   con el ledger creciendo, la página 40 se vuelve un scan.

El átomo del tiempo es un **rango** (`{desde, hasta}`), no el mes. "Septiembre"
es un preset. Esto acota el volumen casi siempre, y es lo que hace que el punto 2
alcance.

---

## 5. Cifras: componer sí, confundir no

MODEL.md §9 permite un número que combine términos de distinta especie **sólo
si** los tres se cumplen:

- cada término está rotulado y visible en la misma pantalla, o a un toque;
- la operación entre términos es explícita;
- el número compuesto **no se llama como ninguno de sus términos**.

Consecuencia práctica y concreta: **"Resultado" está reservado** para ingresos
menos gastos devengados confirmados del mes, y vive en Informes. Un encabezado
que reste lo que haya cargado y lo llame "Resultado" está mal nombrado aunque la
cuenta dé bien.

Gasto, compromiso y pasivo **nunca comparten número**. Son tres preguntas
distintas y deben dar tres cifras distintas.

---

## 6. Lo que este documento no decide

Diseño visual — paleta, tipografía, motion, componentes. Eso está aprobado aparte
y se aplica tal cual: azul Cauri como único acento, los gastos **no** van en
rojo, color por categoría persistente en toda la app, tarjetas sólo en el
Dashboard.
