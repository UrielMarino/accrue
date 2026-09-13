// API pública de @chirola/contracts. Los contratos de installments,
// spaces, pockets y la serie mensual se agregan cuando exista su primer
// endpoint (F3–F4) — no antes: un schema sin consumidor es un archivo muerto.

export * from "./categories.js";
export * from "./movements.js";
export * from "./problem.js";
export * from "./recurring.js";
export * from "./reports.js";
export * from "./shared.js";
