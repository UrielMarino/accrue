// Valores runtime compartidos entre front y back. Regla anti-fuga (PLAN.md #6):
// contracts NO importa valores de @accrue/domain (solo `import type`, y por eso
// domain es devDependency); los enums que el wire necesita como VALOR se
// declaran acá y un guard de tipos en contracts.test.ts fuerza la igualdad.

import { z } from "zod";

export const MOVEMENT_TYPES = ["INCOME", "EXPENSE"] as const;
export const MOVEMENT_STATUSES = ["CONFIRMED", "PENDING", "CANCELLED"] as const;

export const movementTypeSchema = z.enum(MOVEMENT_TYPES);
export const movementStatusSchema = z.enum(MOVEMENT_STATUSES);

// Fecha contable: YYYY-MM-DD con rangos reales de mes/día (nunca timestamps
// para fechas contables, PLAN.md #9; el "hoy" se computa en zona AR).
export const isoDateSchema = z.iso.date();

// Montos del ledger: ENTEROS en centavos ARS (§1). El 0 es legal en el ledger
// (una parte de reparto puede dar 0); los inputs de alta/edición usan la
// variante positiva — el signo lo da `type`, nunca el monto.
export const amountSchema = z.int().nonnegative();
export const positiveAmountSchema = z.int().positive();

export const idSchema = z.string().min(1);
