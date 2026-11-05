import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, registerMember, subscribeAndPay } from '../helpers.js';

describe('souscription et historique', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  it("reste en attente tant que le paiement n'a pas été confirme par un événement", async () => {
    const { agent } = await registerMember(ctx.app);
    const checkout = await agent.post('/api/subscriptions/checkout').send({ planCode: 'integral' }).expect(201);

    expect(checkout.body.checkoutUrl).toMatch(/^\/simulateur\/sim_cs_/);
    const current = await agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription).toMatchObject({ status: 'pending', plan: { code: 'integral' } });
    const payments = await agent.get('/api/subscriptions/payments').expect(200);
    expect(payments.body.total).toBe(0);
  });

  it("active l'abonnement après paiement et l'ajoute à l'historique", async () => {
    const { agent } = await registerMember(ctx.app);
    const { subscription } = await subscribeAndPay(agent, 'confort');

    expect(subscription.status).toBe('active');
    expect(new Date(subscription.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now());

    const payments = await agent.get('/api/subscriptions/payments').expect(200);
    expect(payments.body.total).toBe(1);
    expect(payments.body.payments[0]).toMatchObject({
      amountCents: 4500,
      currency: 'eur',
      status: 'paid',
      planName: 'Confort',
    });
  });

  it('un paiement refusé laisse en attente, garde la trace et permet de réessayer', async () => {
    const { agent } = await registerMember(ctx.app);
    const checkout = await agent.post('/api/subscriptions/checkout').send({ planCode: 'essentiel' }).expect(201);
    const checkoutId = checkout.body.checkoutUrl.split('/').pop();

    const refused = await agent.post(`/api/simulator/checkouts/${checkoutId}/pay`).send({ outcome: 'declined' }).expect(200);
    expect(refused.body.subscription.status).toBe('pending');

    const paid = await agent.post(`/api/simulator/checkouts/${checkoutId}/pay`).send({ outcome: 'success' }).expect(200);
    expect(paid.body.subscription.status).toBe('active');

    const payments = await agent.get('/api/subscriptions/payments').expect(200);
    expect(payments.body.payments.map((payment) => payment.status).sort()).toEqual(['failed', 'paid']);
  });

  it("une session abandonnée expire et ne s'affiche plus", async () => {
    const { agent } = await registerMember(ctx.app);
    const checkout = await agent.post('/api/subscriptions/checkout').send({ planCode: 'essentiel' }).expect(201);
    const checkoutId = checkout.body.checkoutUrl.split('/').pop();

    await agent.post(`/api/simulator/checkouts/${checkoutId}/pay`).send({ outcome: 'abandon' }).expect(200);

    const current = await agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription).toBeNull();
  });

  it('une session terminée ne peut pas être payée une seconde fois', async () => {
    const { agent } = await registerMember(ctx.app);
    const { checkoutId } = await subscribeAndPay(agent);
    const response = await agent.post(`/api/simulator/checkouts/${checkoutId}/pay`).send({ outcome: 'success' }).expect(409);
    expect(response.body.error.code).toBe('session_terminee');
  });

  it("refuse une formule inconnue, sans laisser d'injection SQL passer", async () => {
    const { agent } = await registerMember(ctx.app);
    const response = await agent
      .post('/api/subscriptions/checkout')
      .send({ planCode: "confort'; DROP TABLE plans; --" })
      .expect(404);
    expect(response.body.error.code).toBe('formule_introuvable');

    const { rows } = await ctx.pool.query('SELECT count(*) AS n FROM plans');
    expect(rows[0].n).toBe(3);
  });

  it('refuse un résultat de paiement simulé inconnu', async () => {
    const { agent } = await registerMember(ctx.app);
    const checkout = await agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
    const checkoutId = checkout.body.checkoutUrl.split('/').pop();
    await agent.post(`/api/simulator/checkouts/${checkoutId}/pay`).send({ outcome: 'gratuit' }).expect(400);
  });

  it('refuse un deuxième abonnement sur un compte déjà abonné', async () => {
    const { agent } = await registerMember(ctx.app);
    await subscribeAndPay(agent);
    const response = await agent.post('/api/subscriptions/checkout').send({ planCode: 'integral' }).expect(409);
    expect(response.body.error.code).toBe('abonnement_existant');
  });

  it("une nouvelle demande remplace la session en attente, l'ancienne n'est plus payable", async () => {
    const { agent } = await registerMember(ctx.app);
    const first = await agent.post('/api/subscriptions/checkout').send({ planCode: 'essentiel' }).expect(201);
    const second = await agent.post('/api/subscriptions/checkout').send({ planCode: 'integral' }).expect(201);
    expect(second.body.subscriptionId).not.toBe(first.body.subscriptionId);

    const oldCheckoutId = first.body.checkoutUrl.split('/').pop();
    await agent.post(`/api/simulator/checkouts/${oldCheckoutId}/pay`).send({ outcome: 'success' }).expect(409);

    const current = await agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription.plan.code).toBe('integral');
  });

  it('deux demandes simultanées ne créent jamais deux abonnements vivants', async () => {
    const { agent, user } = await registerMember(ctx.app);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' })),
    );
    expect(responses.some((response) => response.status === 201)).toBe(true);
    for (const response of responses) {
      expect([201, 409]).toContain(response.status);
    }
    const { rows } = await ctx.pool.query(
      `SELECT count(*) AS n FROM subscriptions WHERE user_id = $1 AND status IN ('pending', 'active', 'past_due')`,
      [user.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("la pagination de l'historique est validée et respectée", async () => {
    const { agent } = await registerMember(ctx.app);
    const checkout = await agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
    const checkoutId = checkout.body.checkoutUrl.split('/').pop();
    await agent.post(`/api/simulator/checkouts/${checkoutId}/pay`).send({ outcome: 'declined' }).expect(200);
    await agent.post(`/api/simulator/checkouts/${checkoutId}/pay`).send({ outcome: 'success' }).expect(200);

    const page = await agent.get('/api/subscriptions/payments?limit=1&offset=1').expect(200);
    expect(page.body.payments).toHaveLength(1);
    expect(page.body.total).toBe(2);
    await agent.get('/api/subscriptions/payments?limit=1000').expect(400);
    await agent.get('/api/subscriptions/payments?offset=-1').expect(400);
  });
});
