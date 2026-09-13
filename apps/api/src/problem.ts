import type { Problem } from "@accrue/contracts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { $ZodIssue } from "zod/v4/core";

/**
 * Toda respuesta de error de la API sale de acá, en formato RFC 9457
 * (`application/problem+json`). Está escrito antes que la primera ruta para que
 * ninguna invente su propia forma de fallar.
 *
 * `issues` viene de un `safeParse` de zod: se aplana a `errors`, con el campo
 * que falló y por qué, porque un formulario necesita saber en qué input pintar
 * el mensaje — no alcanza con "es inválido".
 */
export function problem(
  c: Context,
  status: ContentfulStatusCode,
  title: string,
  issues?: $ZodIssue[],
) {
  const body: Problem = {
    type: "about:blank",
    title,
    status,
    ...(issues?.length
      ? { errors: issues.map((i) => ({ path: i.path.join("."), message: i.message })) }
      : {}),
  };
  return c.json(body, status, { "content-type": "application/problem+json" });
}
