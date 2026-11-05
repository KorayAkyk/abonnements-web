import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdmin, createTestContext, registerMember, subscribeAndPay } from '../helpers.js';

const ANY_ID = '6f1d3a52-3c1b-4a7e-9a55-0d2f7c9b1e10';

const MEMBER_ROUTES = [
  ['get', '/api/auth/me'],
  ['get', '/api/subscriptions/current'],
  ['get', '/api/subscriptions/payments'],
  ['post', '/api/subscriptions/checkout'],
  ['post', '/api/subscriptions/current/cancel'],
  ['get', '/api/simulator/checkouts/sim_cs_x'],
  ['post', '/api/simulator/checkouts/sim_cs_x/pay'],
];

const ADMIN_ROUTES = [
  ['get', '/api/admin/stats'],
  ['get', '/api/admin/subscriptions'],
  ['get', '/api/admin/payments'],
  ['post', `/api/admin/subscriptions/${ANY_ID}/cancel`],
  ['post', `/api/simulator/subscriptions/${ANY_ID}/renew`],
  ['post', `/api/simulator/subscriptions/${ANY_ID}/payment-failure`],
  ['post', `/api/simulator/subscriptions/${ANY_ID}/end-period`],
];

describe('contrôle des droits', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  it.each([...MEMBER_ROUTES, ...ADMIN_ROUTES])('visiteur anonyme : %s %s répond 401', async (method, url) => {
    const response = await request(ctx.app)[method](url).send({}).expect(401);
    expect(response.body.error.code).toBe('non_connecte');
  });

  it.each(ADMIN_ROUTES)('simple membre : %s %s répond 403', async (method, url) => {
    const { agent } = await registerMember(ctx.app);
    const response = await agent[method](url).send({}).expect(403);
    expect(response.body.error.code).toBe('acces_refuse');
  });

  it('la liste des formules reste publique', async () => {
    const response = await request(ctx.app).get('/api/plans').expect(200);
    expect(response.body.plans.map((plan) => plan.code)).toEqual(['essentiel', 'confort', 'integral']);
  });

  it("un membre ne voit ni l'abonnement ni les paiements d'un autre", async () => {
    const alice = await registerMember(ctx.app);
    const bob = await registerMember(ctx.app);
    await subscribeAndPay(alice.agent);

    const current = await bob.agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription).toBeNull();
    const payments = await bob.agent.get('/api/subscriptions/payments').expect(200);
    expect(payments.body).toEqual({ payments: [], total: 0 });
  });

  it("un membre ne peut ni lire ni payer la session de paiement d'un autre", async () => {
    const alice = await registerMember(ctx.app);
    const bob = await registerMember(ctx.app);
    const checkout = await alice.agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
    const checkoutId = checkout.body.checkoutUrl.split('/').pop();

    await bob.agent.get(`/api/simulator/checkouts/${checkoutId}`).expect(404);
    await bob.agent.post(`/api/simulator/checkouts/${checkoutId}/pay`).send({ outcome: 'success' }).expect(404);

    const current = await alice.agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription.status).toBe('pending');
  });

  it('un membre ne peut résilier que son propre abonnement', async () => {
    const alice = await registerMember(ctx.app);
    const bob = await registerMember(ctx.app);
    const { subscriptionId } = await subscribeAndPay(alice.agent);

    await bob.agent.post('/api/subscriptions/current/cancel').expect(404);
    await bob.agent.post(`/api/admin/subscriptions/${subscriptionId}/cancel`).expect(403);

    const current = await alice.agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it("le rôle vient de la base, pas de la session : un retrait de droits s'applique aussitôt", async () => {
    const admin = await createAdmin(ctx);
    await admin.agent.get('/api/admin/stats').expect(200);
    await ctx.pool.query(`UPDATE users SET role = 'member' WHERE id = $1`, [admin.user.id]);
    await admin.agent.get('/api/admin/stats').expect(403);
  });

  it('les identifiants du prestataire ne sortent jamais vers le client', async () => {
    const member = await registerMember(ctx.app);
    await subscribeAndPay(member.agent);
    const current = await member.agent.get('/api/subscriptions/current').expect(200);
    expect(JSON.stringify(current.body)).not.toMatch(/sim_sub|sim_cus|providerSubscriptionId|userId/);
  });
});
