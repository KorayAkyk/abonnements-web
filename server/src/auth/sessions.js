import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from '../http/errors.js';

export const SESSION_COOKIE = 'abonnements_session';

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionStore({ pool, config }) {
  const ttlMs = config.sessionTtlHours * 60 * 60 * 1000;
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  };

  return {
    /** Ouvre une session : le jeton ne vit que dans le cookie, la base n'en garde que l'empreinte. */
    async open(res, userId) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + ttlMs);
      await pool.query('DELETE FROM sessions WHERE expires_at < now()');
      await pool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
        hashToken(token),
        userId,
        expiresAt,
      ]);
      res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
    },

    async close(req, res) {
      const token = req.cookies?.[SESSION_COOKIE];
      if (token) {
        await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
      }
      res.clearCookie(SESSION_COOKIE, cookieOptions);
    },

    /** Middleware : place l'utilisateur de la session dans req.user, ou null. */
    loadUser() {
      return async function loadUser(req, _res, next) {
        req.user = null;
        const token = req.cookies?.[SESSION_COOKIE];
        if (token) {
          const { rows } = await pool.query(
            `SELECT u.id, u.email, u.full_name AS "fullName", u.role
               FROM sessions s
               JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = $1 AND s.expires_at > now()`,
            [hashToken(token)],
          );
          req.user = rows[0] ?? null;
        }
        next();
      };
    },
  };
}

export function requireAuth(req, _res, next) {
  if (!req.user) {
    next(new HttpError(401, 'non_connecte', 'Connexion requise.'));
    return;
  }
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) {
    next(new HttpError(401, 'non_connecte', 'Connexion requise.'));
    return;
  }
  if (req.user.role !== 'admin') {
    next(new HttpError(403, 'acces_refuse', "Cette action est réservée à l'administration."));
    return;
  }
  next();
}
