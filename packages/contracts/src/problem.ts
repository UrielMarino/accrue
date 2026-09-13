// Formato de error estándar de toda la API: RFC 9457 (application/problem+json).
// Definido ANTES de la primera ruta para que ningún endpoint invente el suyo.

import { z } from "zod";

export const problemSchema = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.int().min(100).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  // Extensión para errores de validación: qué campo falló y por qué.
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type Problem = z.infer<typeof problemSchema>;
