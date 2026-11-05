import { HttpError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF en complément du cookie SameSite : une requête qui modifié des données
 * et qui annonce une origine doit venir d'une origine autorisee.
 */
export function originCheck(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return function checkOrigin(req, _res, next) {
    const origin = req.get('origin');
    if (!SAFE_METHODS.has(req.method) && origin && !allowed.has(origin)) {
      next(new HttpError(403, 'origine_refusee', "L'origine de cette requête n'est pas autorisee."));
      return;
    }
    next();
  };
}
