# Chirola — Brief de producto y diseño (v5, 2026-08-30)

> Reemplaza al brief anterior. Sale de: (a) rechazo total de Uriel a la UI v4 («el front es horrendo, el diseño, el favicon»), (b) extracción del sistema visual light de **Cauri** (`Cauri-nuevo/src/App.css`), que es la única paleta que Uriel aprobó, (c) benchmark 2025-2026 (Mercury, Copilot, Monarch, Linear, Stripe, Vercel, Actual Budget) y (d) las 35 críticas de UX que Cauri acumuló (no repetirlas).
> Regla permanente: **el front no se cierra sin que Uriel lo vea vivo y lo apruebe.** Prioridad: UX > UI. Solo tema claro.

## 1. Usuario y escena
Uriel, en el navegador de su PC (1366–1920px). Caso nº1: registrar un gasto en segundos (`N` → monto → Enter). Caso nº2: sentarse a fin de mes, ver cuánto queda libre y confirmar pendientes. Caso nº3: revisar en qué se fue la plata y quién le debe. Tiene que aguantar **años de datos** (miles de movimientos, decenas/cientos de categorías) sin romperse visualmente.

## 2. Sistema visual (tokens de Cauri, literales)
- **Fondo/superficies:** bg `#F4F6F8` · surface `#FFFFFF` · sunken `#EAEEF2` (hover, chips, segmented) · zebra `#F8FAFC` · line `#E2E7ED` · line-soft `#EDF1F5` · line-strong `#CBD3DC` · control-line `#7E8894` (borde que identifica un control).
- **Tinta:** ink `#171B21` · ink-2 `#4C555F` · ink-3 `#636D79` · ink-4 `#AEB6C0` (placeholder/disabled).
- **Acento (solo accionable y foco):** `#1667E0` · hover `#1052BC` · soft `#E7F0FD` · line `#C2D8F8` · focus `rgba(22,103,224,.75)`.
- **Dinero (nunca como único canal):** positive `#0F7A50` / soft `#E3F3EA` / line `#C4E4D3` · negative `#B9433D` / deep `#94322D` / soft `#FBEDEC` / line `#EFCFCD` · attention (pendiente/vencido) `#8F5D0E` / soft `#FBF1DF` / line `#EDD9BE`.
- **Tintes de categoría** (13 pares soft/ink, medidos AA): menta `#d1fae5/#047857`, lima `#ecfccb/#4d7c0f`, turquesa `#cffafe/#0e7490`, celeste `#e0f2fe/#0369a1`, azul `#e0e7ff/#4338ca`, violeta `#ede9fe/#6d28d9`, fucsia `#fae8ff/#a21caf`, rosa `#ffe4e6/#be123c`, rojo `#fee2e2/#b91c1c`, naranja `#ffedd5/#c2410c`, ámbar `#fef3c7/#b45309`, gris `#e2e8f0/#475569`.
- **Tipografía:** **Figtree Variable** (`@fontsource-variable/figtree`), pesos 400/500/600 (sin 700). Escala: 10.5/11.5/12.5/**14 (cuerpo)**/15.5/17.5/21/26 (título de pantalla)/34 (cifra ancla)/46 (LA cifra de Inicio, un solo uso). `tabular-nums` + `"zero" 1` en toda cifra.
- **Radios:** 4 / 8 (chips) / 10 (botones, inputs) / 14 (ítems de menú) / 18 (tarjetas) / 22 (modales).
- **Elevación:** tarjetas = borde `line` + `0 1px 2px rgba(23,28,36,.05)`; flotantes `0 6px 16px -4px rgba(23,28,36,.08)`; modales `0 24px 48px -12px rgba(23,28,36,.28)`; scrim `rgba(23,28,36,.32)`.
- **Motion:** color/hover 150ms ease-out; overlays 180ms; entrada de pantalla 200ms (opacity + y:6). Se anima el **cambio de estado**, en dos tiempos encadenados y ≤600ms en total: primero se resuelve **el objeto que el dedo tocó** —la celda de Estado en el ledger, el botón «Confirmar» en Inicio: el contorno vira a verde, la palabra colapsa su ancho y el tilde se afirma en el mismo lugar, 200ms— y recién después la fila hace su flash `positive-soft` de 400ms. Nunca al revés: si el feedback sale de otro lado que del control tocado, la acción no se siente. También se anima la fila nueva, la paleta ⌘K y los toasts. NO se anima: hover de filas, cambio de mes, valores numéricos. `prefers-reduced-motion` → todo a 0.01ms por el bloque global de `app.css` (por eso las animaciones de confirmar son CSS y no JS: quedan cubiertas sin excepciones).
- **Íconos:** Lucide, `strokeWidth 1.75`, 16px en filas/sidebar, 18–20 en botones.
- **Ícono de la app:** nuevo. Monograma simple en azul `#1667E0` sobre blanco (o blanco sobre azul), legible a 16px; sin gradientes, sin "concha". Se elige entre 3 opciones visuales.

## 3. Navegación y shell
- **Sidebar izquierda 240px** (colapsable a 56px con `[`, recordada). Cabecera: monograma 22px + «Chirola» en peso de cuerpo (no un cartel; al colapsar queda el monograma). Ítems con ícono + texto, activo = fondo `accent-soft` + texto `accent`.
- Ítems (6): **Inicio · Movimientos · Fijos · Espacios · Informes** — y **Ajustes** abajo, pegado al pie junto al **menú de cuenta** (avatar/email → «Cerrar sesión» = redirect a `/cdn-cgi/access/logout` cuando exista Cloudflare Access; en local muestra «usuario local»).
- Botón primario **«Registrar»** arriba de la nav (único botón azul sólido del shell).
- **Header de página:** título 26px + una línea que dice qué pregunta responde la pantalla + controles de la pantalla a la derecha (un solo selector de período por pantalla).
- Contenido `max-w 1240px`, padding 32px, `scrollbar-gutter: stable`. Piso 1024px de ventana.

## 4. Búsqueda y atajos
- **`Ctrl+K` = paleta única**: texto libre busca movimientos (descripción, monto, categoría, persona); «Ir a…» navega; acciones («Registrar gasto», «Confirmar vencidos»). Cada resultado muestra su `kbd`. Se elimina `/`.
- `N` nuevo movimiento · `G I/M/F/E/R/A` ir a Inicio/Movimientos/Fijos/Espacios/Informes/Ajustes · `[` sidebar · `Esc` cierra · `?` hoja de atajos · `J/K` mover en listas · `C` confirmar el seleccionado.

## 5. Arquitectura de información
**Inicio — «¿Cuánto tengo libre este mes?» (bandeja de trabajo, no póster).** Máximo 5 bloques, cada uno linkea a su página:
1. **Libre en {mes}** (46px) + una frase de 2 cifras («entraron $X · comprometiste $Y») cuyos términos filtran.
2. **Pendientes** (vencidos primero, techo 6 filas + «ver todos»), confirmar en un clic, «Confirmar los N vencidos». Acá SÍ se conserva el botón **«Confirmar» con la palabra escrita** —no hay columnas y todas las filas piden lo mismo: es la pantalla donde se aprende el verbo—, y lo que se saca es el badge que lo duplicaba. El badge «Vencido» se queda igual: no dice lo mismo que «Confirmar», es la única marca de lo que ya se te pasó.
3. **Próximos 14 días** (fijos, cuotas, vencimientos) en franja horizontal.
4. **Espacios**: te deben / debés, neto.
~~5. Últimos movimientos (6) → Movimientos.~~ **Borrado el 2026-08-31:** era la misma query de Movimientos recortada a los confirmados, o sea las mismas cifras impresas dos veces en la app — lo que §6 prohíbe. Inicio queda en ancla + bandeja de pendientes a ancho completo.
Sin gráficos en Inicio. Sin dos relojes: todo sigue el mes seleccionado.

**Movimientos — la verdad.** Selector de mes sticky (`?m=2026-08`, URL estable) + tabla virtualizada (TanStack Table + Virtual) agrupada por día con subtotal, header sticky, columnas **chip de categoría · estado · descripción · fecha · monto (derecha, tabular) · acciones**. El **estado va segundo, a la izquierda** (2026-08-31): lo que se escanea en esta lista es «qué tengo que hacer» y el ojo arranca por ahí (Linear, Gmail, Things). Monto no se mueve de anteúltimo: es donde cierra el bloque de números y donde se alinea el total del pie. Reglas de la columna Estado, las tres a la vez: **va escrita, no como glifo** (un punto no se lee, y el nombre no puede vivir sólo en un `sr-only`); **lo confirmado no escribe nada** (decía «Confirmado» en 45 de 49 filas: ése fue el motivo real por el que la columna se había sacado, y se cumple igual sin sacarla); y **la palabra ES el botón** — tocar «Pendiente» o «Vencido» confirma, así que no hay además un botón «Confirmar» en acciones diciendo lo mismo. Lo accionable se distingue por su **contorno de control**, no por tener texto: dos filas pueden decir «Pendiente» y ser sólo una un botón — y para que eso se lea, **las cinco clases de fila comparten exactamente la misma caja** (alto, `px-2`, radio, `text-xs`, peso 500, slot de ícono con `gap-1.5`), así que la palabra arranca en la misma x tenga borde o no y lo único que decide es el borde: contorno de control sobre `surface` en Pendiente y Vencido, borde transparente y sin relleno en Programado y Cancelado, nada en Confirmado. **«Vencido» ya no se rellena de ámbar**: el relleno chocaba con los tintes cálidos de categoría a 12px de distancia; ahora el ámbar vive en la tinta y el reloj, y la urgencia la grita un **riel de 2px en el borde izquierdo de la fila entera**. El **header de la columna ordenada** se marca con peso y tinta, nunca con pastilla `sunken` (§6). La **acción masiva «Confirmar los N vencidos» vive pegada a los chips de estado** —el control que define ese conjunto—, no en el slot del título a 600px de las filas que opera, y aparece desde **N ≥ 1**; **«Limpiar» tiene slot fijo contra el borde derecho**, con el espacio reservado siempre, porque al final de una fila de chips de ancho variable se corría de lugar y no se podía apuntar de memoria. El scroll de la lista es **`snap mandatory`** y su target es el envoltorio de la fila (nunca el `LedgerRow`, que vive dentro de un `overflow:hidden` y por eso el snap no corrió nunca): no queda medio renglón cortado, salvo en la fila con el desglose abierto, que se exceptúa. Filtros como chips removibles (tipo, estado, categoría, persona) + búsqueda; los chips de estado son **toggles que se apagan al re-tocarlos**, sin chip «Todos» (se pintaba activo aunque hubiera filtros de otra dimensión puestos, contradiciendo al «Limpiar» de al lado). «Cargar mes anterior» al final; nunca paginación numérica; nunca 5.000 filas en el DOM. Fila de cierre con doble filete. Edición inline al doble clic; selección múltiple con `Shift`; acciones secundarias visibles al hover **y** al foco, nunca solo-hover.

**Fijos — «lo que se repite solo».** Ancla «Fijos de {mes}» (pagado / falta / vencido) con techo de 168px; «Te sale» / «Te entra»; orden vencido → pendiente → pagado → pausado; «Terminados» plegado; pockets al pie. Vocabulario: «Todos los meses», «En cuotas» (nunca «recurrencia»).

**Espacios — «quién debe qué».** Cards por espacio (saldo por persona), detalle con roster fijo y gastos con desglose; acción central «¿quién me pagó su parte?» dentro del espacio; pago/cobro en tono neutro.

**Informes — todo lo que necesita más de un mes.** Pestañas Resumen · Historial · Categorías. Barras horizontales para ranking, verticales con promedio punteado para tendencia (Recharts). Nunca dona. Todo drill-down aterriza en Movimientos filtrados por URL.

**Ajustes — página con nav interna** (no modal): General · Categorías · Personas · Datos y privacidad (exportar/importar/backup) · Atajos · Cuenta. **Categorías**: grid de chips por grupo, búsqueda inline, contador de uso, «sin uso hace 6 meses» plegado — nunca una columna de 300. Editar categoría también desde el chip en cualquier tabla.

## 6. Reglas heredadas de Cauri (no repetir errores)
- Una cifra grande por bloque; ≤3 niveles de jerarquía; ninguna frase con más de 2 cifras; sin porcentajes falsos; ninguna cifra impresa dos veces en la misma pantalla.
- Una palabra = un número (glosario único: «Libre», «Falta pagar», «Te deben», «Debés»). Nada de jerga interna en UI.
- Ningún vacío ocupa más que lo que reemplaza; dos columnas solo si las dos tienen techo (R5); ninguna columna mitad vacía al lado de una que sigue.
- Nada solo-hover; información necesaria nunca solo en tooltip; controles que no hacen nada = error.
- **`bg-sunken` NUNCA marca un estado permanente, en ningún lado.** Es el token del hover y sólo del hover (fila, botón, chip). Cada vez que se usó para decir «esto está activo» —el badge «Pendiente», la pastilla de la columna ordenada— «esto manda» y «el mouse está acá» quedaron indistinguibles. Un estado permanente se dice con **tinta, peso o contorno**; y el peso hay que **medirlo contra el que ya tiene el contenedor** (en el header de columnas, `.label` ya es 600: subir a `font-semibold` no era ningún paso).
- **Un relleno de color no vive al lado de otro relleno de color de la misma familia.** `attention-soft` (#FBF1DF) cae en la misma banda de tono que 3 de los 13 tintes de categoría (ámbar/naranja/rojo), y a 12px del chip los dos se leían como un solo objeto amarillo. Lo urgente se marca con un **riel de 2px en el borde de la fila** (patrón Superhuman/Linear), lejos de cualquier color que elija el usuario; el color de la familia sobrevive en la **tinta y el ícono**, que no se funden.
- **Una columna, una caja.** Todas las variantes de una misma celda comparten alto, padding, radio, tamaño de letra, peso y slot de ícono; lo único que puede cambiar es borde y tinta. Dos cajas distintas en la misma columna corren el texto de renglón en renglón y se leen como desalineadas aunque cada una esté bien centrada.
- **Ningún efecto puede depender de que un ancestro lo recorte.** Los filetes de columna son bordes reales sobre la celda estirada, no `::before` con `top/bottom: ±999px`: ese truco se rompía solo cada vez que alguien tocaba el `overflow` de algún padre (la columna Fecha con `truncate`, el pie de cierre atravesado de punta a punta).
- Modales: un ancho (480), un tamaño de título, focus trap, `Esc`, botón de acción siempre visible; el mismo modal tiene un solo nombre.
- Tablas con anchos fijos viven en `overflow-x: auto`; ceden fecha/estado antes que monto/acciones; slots de ancho fijo para hermanos.
- Contraste **medido**: script de verificación (4.5 texto, 3:1 controles) corre en CI; sin hex fuera de `@theme`.

## 7. Stack de front resultante
React 19 + Vite + Tailwind 4 · shadcn/ui sobre Base UI · Lucide · Figtree · TanStack Query/Table/Virtual · cmdk (paleta) · Sonner (toasts) · Recharts · View Transitions nativas; Motion solo para layout/presence.

## 8. Método de aprobación
1. Maquetas visuales (design canvas) en la paleta de Cauri: shell + Inicio + Movimientos + Ajustes/Categorías, con variantes donde haya duda. **Uriel elige mirando.**
2. Recién entonces: `apps/web` se reescribe de cero sobre esa decisión (estructura §5, tokens §2), pantalla por pantalla, cada una mostrada viva antes de la siguiente.
3. Cada pantalla se cierra en loop (jueces adversariales → fixes → re-juicio).
