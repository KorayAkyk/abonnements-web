import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import { withTransaction } from '../../src/db/pool.js';
import { DEMO_ADMIN_EMAIL, DEMO_MEMBER_EMAIL, DEMO_PASSWORD, seed } from '../../src/db/seed.js';
import { createTestContext, registerMember } from '../helpers.js';

describe('base de données', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  describe('migrations', () => {
    it('rejouer les migrations ne fait rien', async () => {
      expect(await migrate(ctx.pool)).toEqual([]);
    });

    it('refuse de continuer si une migration appliquée a été modifiée', async () => {
      const version = '001_comptes.sql';
      const { rows } = await ctx.pool.query('SELECT checksum FROM schema_migrations WHERE version = $1', [version]);
      await ctx.pool.query(`UPDATE schema_migrations SET checksum = 'modifiée' WHERE version = $1`, [version]);

      await expect(migrate(ctx.pool)).rejects.toThrow(/001_comptes\.sql/);

      await ctx.pool.query('UPDATE schema_migrations SET checksum = $2 WHERE version = $1', [version, rows[0].checksum]);
    });
  });

  describe('contraintes métier portées par la base', () => {
    it('interdit deux abonnements vivants sur un même compte, même en SQL direct', async () => {
      const { user } = await registerMember(ctx.app);
      const insert = () =>
        ctx.pool.query(
          `INSERT INTO subscriptions (user_id, plan_id, status, provider)
           SELECT $1, id, 'active', 'simulator' FROM plans WHERE code = 'confort'`,
          [user.id],
        );
      await insert();
      await expect(insert()).rejects.toMatchObject({ code: '23505' });
    });

    it("refuse une adresse qui n'est pas normalisée", async () => {
      await expect(
        ctx.pool.query(`INSERT INTO users (email, full_name, password_hash) VALUES ('A@B.TEST', 'x', 'x')`),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('données de démonstration', () => {
    it('remplit la base une seule fois, puis les comptes fonctionnent', async () => {
      expect(await withTransaction(ctx.pool, seed)).toBe(true);
      expect(await withTransaction(ctx.pool, seed)).toBe(false);

      const member = request.agent(ctx.app);
      await member.post('/api/auth/login').send({ email: DEMO_MEMBER_EMAIL, password: DEMO_PASSWORD }).expect(200);
      const payments = await member.get('/api/subscriptions/payments').expect(200);
      expect(payments.body.total).toBe(3);

      const admin = request.agent(ctx.app);
      await admin.post('/api/auth/login').send({ email: DEMO_ADMIN_EMAIL, password: DEMO_PASSWORD }).expect(200);
      await admin.get('/api/admin/stats').expect(200);
    });

    it("n'utilise que des adresses du domaine réservé aux essais", async () => {
      const { rows } = await ctx.pool.query(`SELECT email FROM users WHERE email NOT LIKE '%.test'`);
      expect(rows).toEqual([]);
    });
  });
});
