/** Erreur prevue, renvoyee telle quelle au client avec un code stable et un message lisible. */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, 'route_introuvable', 'Cette adresse ne correspond a aucune ressource.'));
}

export function createErrorHandler(logger) {
  // Express reconnait un gestionnaire d'erreurs a ses quatre parametres.
  return function errorHandler(error, _req, res, _next) {
    if (error instanceof HttpError) {
      res.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }
    // Corps JSON illisible ou trop volumineux : erreurs levees par express.json().
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'json_invalide', message: 'Le corps de la requete est illisible.' } });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'corps_trop_grand', message: 'Le corps de la requete est trop grand.' } });
      return;
    }
    // Le detail reste dans les journaux : il ne doit jamais partir vers le client.
    logger.error(error);
    res.status(500).json({ error: { code: 'erreur_interne', message: 'Une erreur interne est survenue.' } });
  };
}
