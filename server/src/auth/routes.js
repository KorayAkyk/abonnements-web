import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../http/errors.js';
import { parse } from '../http/validate.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords.js';
import { requireAuth } from './sessions.js';

const UNIQUE_VIOLATION = '23505';

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

const registerSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(100),
  // scrypt accepte toute longueur, mais un mot de passe géant coûterait du calcul pour rien.
  password: z.string().min(10).max(200),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

function limiter(options) {
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'trop_de_tentatives', 'Trop de tentatives. Réessayez dans quelques minutes.'));
    },
    ...options,
  });
}

function publicUser(row) {
  return { id: row.id, email: row.email, fullName: row.fullName, role: row.role };
}

export function authRoutes({ pool, sessions, config }) {
  const router = Router();

  // Par adresse IP et par compte visé : un attaquant ne peut pas bloquer tous les comptes,
  // et il ne peut pas multiplier les essais sur un compte. Seuls les échecs comptent.
  const loginLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    limit: config.rateLimit.loginMax,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email).toLowerCase()}`,
  });
  const registerLimiter = limiter({
    windowMs: 60 * 60 * 1000,
    limit: config.rateLimit.registerMax,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
  });

  router.post('/register', registerLimiter, async (req, res) => {
    const { email, fullName, password } = parse(registerSchema, req.body);
    const passwordHash = await hashPassword(password);
    let user;
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, full_name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, full_name AS "fullName", role`,
        [email, fullName, passwordHash],
      );
      user = rows[0];
    } catch (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw new HttpError(409, 'email_deja_utilise', 'Un compte existe déjà avec cette adresse.');
      }
      throw error;
    }
    await sessions.open(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const { rows } = await pool.query(
      `SELECT id, email, full_name AS "fullName", role, password_hash AS "passwordHash"
         FROM users WHERE email = $1`,
      [email],
    );
    const user = rows[0];
    if (!user) {
      await burnPasswordCheck(password);
    }
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'identifiants_invalides', 'Adresse ou mot de passe incorrect.');
    }
    await sessions.open(res, user.id);
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', async (req, res) => {
    await sessions.close(req, res);
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  return router;
}
