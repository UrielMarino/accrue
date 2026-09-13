// Contrato wire de categorías (F1: /ajustes las gestiona y los chips del alta
// las consumen). Las de sistema no se editan ni borran — lo aplica el server.

import { z } from "zod";
import { idSchema } from "./shared.js";

export const categorySchema = z.object({
  id: idSchema,
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  isSystem: z.boolean(),
});

export type CategoryDto = z.infer<typeof categorySchema>;

export const categoryListSchema = z.array(categorySchema);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(50),
  icon: z.string().trim().min(1).max(50).optional(),
  color: z.string().trim().min(1).max(30).optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    icon: z.string().trim().min(1).max(50),
    color: z.string().trim().min(1).max(30),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "nada para actualizar");
