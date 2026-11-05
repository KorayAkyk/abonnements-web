import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, registerMember, TEST_PASSWORD, uniqueEmail } from '../helpers.js';

describe('comptes et sessions', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  describe('inscription', () => {
    it("crée le compte, ouvre une session et ne renvoie jamais l'empreinte", async () => {
      const email = uniqueEmail();
      const response = await request(ctx.app)
        .post('/api/auth/register')
        .send({ email, fullName: 'Nouveau Membre', password: TEST_PASSWORD })
        .expect(201);

      expect(response.body.user).toMatchObject({ email, fullName: 'Nouveau Membre', role: 'member' });
      expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);
      const { rows } = await ctx.pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
      expect(rows[0].password_hash).toMatch(/^scrypt\$/);
    });

    it('ne laisse pas un visiteur se donner le rôle admin', async () => {
      const response = await request(ctx.app)
        .post('/api/auth/register')
        .send({ email: uniqueEmail(), fullName: 'Pirate', password: TEST_PASSWORD, role: 'admin' })
        .expect(201);
      expect(response.body.user.role).toBe('member');
    });

    it("normalise l'adresse et refuse le doublon, même avec des majuscules", async () => {
      const email = uniqueEmail();
      await registerMember(ctx.app, email);
      const response = await request(ctx.app)
        .post('/api/auth/register')
        .send({ email: email.toUpperCase(), fullName: 'Doublon', password: TEST_PASSWORD })
        .expect(409);
      expect(response.body.error.code).toBe('email_deja_utilise');
    });

    it.each([
      ['adresse invalide', { email: 'pas-une-adresse', fullName: 'Test Test', password: TEST_PASSWORD }],
      ['mot de passe court', { email: 'a@exemple.test', fullName: 'Test Test', password: 'court' }],
      ['nom manquant', { email: 'a@exemple.test', password: TEST_PASSWORD }],
      ['type inattendu', { email: { $ne: null }, fullName: 'Test Test', password: TEST_PASSWORD }],
    ])('refuse les entrées invalides : %s', async (_label, body) => {
      const response = await request(ctx.app).post('/api/auth/register').send(body).expect(400);
      expect(response.body.error.code).toBe('donnees_invalides');
      expect(response.body.error.details.length).toBeGreaterThan(0);
    });
  });

  describe('connexion', () => {
    it('ouvre une session avec un cookie HttpOnly et SameSite', async () => {
      const { email } = await registerMember(ctx.app);
      const response = await request(ctx.app).post('/api/auth/login').send({ email, password: TEST_PASSWORD }).expect(200);

      const cookie = response.headers['set-cookie'][0];
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
    });

    it('marque le cookie Secure quand la configuration le demande', async () => {
      const secure = await createTestContext({ env: { COOKIE_SECURE: 'true' } });
      const response = await request(secure.app)
        .post('/api/auth/register')
        .send({ email: uniqueEmail(), fullName: 'Test Test', password: TEST_PASSWORD })
        .expect(201);
      expect(response.headers['set-cookie'][0]).toMatch(/; Secure/);
      await secure.close();
    });

    it("stockée seulement l'empreinte du jeton de session", async () => {
      const email = uniqueEmail();
      const response = await request(ctx.app)
        .post('/api/auth/register')
        .send({ email, fullName: 'Test Test', password: TEST_PASSWORD });
      const token = response.headers['set-cookie'][0].split(';')[0].split('=')[1];
      const { rows } = await ctx.pool.query(
        'SELECT s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1',
        [email],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).not.toBe(token);
    });

    it('donne la même réponse pour un mauvais mot de passe et un compte inconnu', async () => {
      const { email } = await registerMember(ctx.app);
      const wrongPassword = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email, password: 'mauvais-mot-de-passe' })
        .expect(401);
      const unknownAccount = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: uniqueEmail('inconnu'), password: 'mauvais-mot-de-passe' })
        .expect(401);
      expect(wrongPassword.body).toEqual(unknownAccount.body);
    });

    it("bloque un compte visé après trop d'échecs, sans bloquer les autres", async () => {
      const { email } = await registerMember(ctx.app);
      const attempt = (password) => request(ctx.app).post('/api/auth/login').send({ email, password });
      for (let i = 0; i < ctx.config.rateLimit.loginMax; i += 1) {
        await attempt('mauvais-mot-de-passe').expect(401);
      }

      const blocked = await attempt(TEST_PASSWORD).expect(429);
      expect(blocked.body.error.code).toBe('trop_de_tentatives');

      const other = await registerMember(ctx.app);
      await request(ctx.app).post('/api/auth/login').send({ email: other.email, password: TEST_PASSWORD }).expect(200);
    });
  });

  describe('session', () => {
    it('me renvoie le compte connecté, 401 sinon', async () => {
      const { agent, email } = await registerMember(ctx.app);
      const me = await agent.get('/api/auth/me').expect(200);
      expect(me.body.user.email).toBe(email);
      await request(ctx.app).get('/api/auth/me').expect(401);
    });

    it('la déconnexion invalide la session côté serveur', async () => {
      const { agent, user } = await registerMember(ctx.app);
      await agent.post('/api/auth/logout').expect(204);
      await agent.get('/api/auth/me').expect(401);
      const { rowCount } = await ctx.pool.query('SELECT 1 FROM sessions WHERE user_id = $1', [user.id]);
      expect(rowCount).toBe(0);
    });

    it("une session expirée n'ouvre plus rien", async () => {
      const { agent, user } = await registerMember(ctx.app);
      await ctx.pool.query(`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1`, [user.id]);
      await agent.get('/api/auth/me').expect(401);
    });

    it("un cookie inventé n'ouvre rien", async () => {
      await request(ctx.app).get('/api/auth/me').set('Cookie', 'abonnements_session=inventé').expect(401);
    });
  });

  describe('protections générales', () => {
    it("refuse une requête modifiante venue d'une autre origine", async () => {
      const { agent } = await registerMember(ctx.app);
      const response = await agent.post('/api/auth/logout').set('Origin', 'https://site-pirate.test').expect(403);
      expect(response.body.error.code).toBe('origine_refusee');
      await agent.get('/api/auth/me').expect(200);
    });

    it("accepte la même requête depuis l'origine de l'application", async () => {
      const { agent } = await registerMember(ctx.app);
      await agent.post('/api/auth/logout').set('Origin', ctx.config.appBaseUrl).expect(204);
    });

    it('pose les en-têtes de sécurité et masque le framework', async () => {
      const response = await request(ctx.app).get('/api/plans').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('répond proprement à un JSON illisible et à un corps trop grand', async () => {
      const broken = await request(ctx.app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":')
        .expect(400);
      expect(broken.body.error.code).toBe('json_invalide');

      const huge = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'a@exemple.test', password: 'x'.repeat(40_000) })
        .expect(413);
      expect(huge.body.error.code).toBe('corps_trop_grand');
    });

    it("renvoie une erreur JSON sur une adresse d'API inconnue", async () => {
      const response = await request(ctx.app).get('/api/inconnue').expect(404);
      expect(response.body.error.code).toBe('route_introuvable');
    });

    it('la sonde de santé interroge la base', async () => {
      const response = await request(ctx.app).get('/api/health').expect(200);
      expect(response.body).toEqual({ status: 'ok', paymentProvider: 'simulator' });
    });
  });
});
