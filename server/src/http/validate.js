import { z } from 'zod';
import { HttpError } from './errors.js';

/** Valide une valeur avec un schema zod ; en cas d'echec, repond 400 avec le detail par champ. */
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  throw new HttpError(400, 'donnees_invalides', 'Les donnees envoyees sont invalides.', details);
}

export const uuidSchema = z.uuid();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
