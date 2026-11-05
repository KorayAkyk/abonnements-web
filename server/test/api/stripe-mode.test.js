import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext, invoiceObject, postEvent, registerMember, stripeEvent } from '../helpers.js';

const WEBHOOK_SECRET = `whsec_${randomBytes(16).toString('hex')}`;

const STRIPE_ENV = {
  PAYMENT_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_test_factice',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_ESSENTIEL: 'price_a',
  STRIPE_PRICE_CONFORT: 'price_b',
  STRIPE_PRICE_INTEGRAL: 'price_c',
};

/** Parcours complet en mode Stripe, avec un faux client : aucune connexion n'est ouverte. */
describe('mode Stripe, sans appel à Stripe', () => {
  let ctx;
  const stripeClient = {
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } },
    subscriptions: { update: vi.fn() },
  };

  beforeAll(async () => {
    ctx = await createTestContext({ env: STRIPE_ENV, stripeClient });
  });
  afterAll(() => ctx.close());

  beforeEach(() => {
    vi.resetAllMocks();
    stripeClient.checkout.sessions.create.mockImplementation(async () => {
      const id = `cs_test_${randomBytes(6).toString('hex')}`;
      return { id, url: `https://paiement.test/${id}` };
    });
    stripeClient.checkout.sessions.retrieve.mockResolvedValue({ status: 'open' });
  });

  async function activeSubscription(agent) {
    const checkout = await agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
    const id = checkout.body.subscriptionId;
    const eventId = `evt_${randomBytes(6).toString('hex')}`;
    await postEvent(
      ctx.app,
      stripeEvent(eventId, 'checkout.session.completed', {
        client_reference_id: id,
        payment_status: 'paid',
        subscription: `sub_${id}`,
        customer: 'cus_1',
      }),
      WEBHOOK_SECRET,
    ).expect(200);
    return id;
  }

  it("renvoie l'adresse de paiement de Stripe et attend l'événement pour activer", async () => {
    const { agent } = await registerMember(ctx.app);
    const checkout = await agent.post('/api/subscriptions/checkout').send({ planCode: 'integral' }).expect(201);

    expect(checkout.body.checkoutUrl).toMatch(/^https:\/\/paiement\.test\/cs_test_/);
    const params = stripeClient.checkout.sessions.create.mock.calls[0][0];
    expect(params.line_items[0].price).toBe('price_c');
    expect(params.success_url).toBe('http://app.test/paiement/retour?statut=succes');

    const before = await agent.get('/api/subscriptions/current').expect(200);
    expect(before.body.subscription.status).toBe('pending');

    await postEvent(
      ctx.app,
      stripeEvent('evt_stripe_ok', 'invoice.paid', invoiceObject(checkout.body.subscriptionId, { amount_paid: 6900 })),
      WEBHOOK_SECRET,
    ).expect(200);
    const after = await agent.get('/api/subscriptions/current').expect(200);
    expect(after.body.subscription.status).toBe('active');
  });

  it('expire la session Stripe précédente quand le membre recommence', async () => {
    const { agent } = await registerMember(ctx.app);
    await agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
    await agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
    expect(stripeClient.checkout.sessions.expire).toHaveBeenCalledTimes(1);
  });

  it('transmet la résiliation à Stripe', async () => {
    const { agent } = await registerMember(ctx.app);
    const id = await activeSubscription(agent);

    const response = await agent.post('/api/subscriptions/current/cancel').expect(200);

    expect(response.body.subscription.cancelAtPeriodEnd).toBe(true);
    expect(stripeClient.subscriptions.update).toHaveBeenCalledWith(`sub_${id}`, { cancel_at_period_end: true });
  });

  it('si Stripe échoue à la résiliation, répond 502 et ne change rien', async () => {
    const { agent } = await registerMember(ctx.app);
    await activeSubscription(agent);
    stripeClient.subscriptions.update.mockRejectedValue(new Error('panne'));

    const response = await agent.post('/api/subscriptions/current/cancel').expect(502);

    expect(response.body.error.code).toBe('prestataire_indisponible');
    expect(JSON.stringify(response.body)).not.toContain('panne');
    const current = await agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it('si Stripe échoue à la souscription, répond 502 et le membre peut réessayer', async () => {
    const { agent } = await registerMember(ctx.app);
    stripeClient.checkout.sessions.create.mockRejectedValueOnce(new Error('panne'));

    await agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(502);

    await agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
  });

  it("demande de patienter si l'abonnement Stripe n'est pas encore relié", async () => {
    const { agent } = await registerMember(ctx.app);
    const checkout = await agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
    await postEvent(
      ctx.app,
      stripeEvent('evt_sans_lien', 'invoice.paid', invoiceObject(checkout.body.subscriptionId)),
      WEBHOOK_SECRET,
    ).expect(200);

    const response = await agent.post('/api/subscriptions/current/cancel').expect(409);
    expect(response.body.error.code).toBe('abonnement_en_cours_de_liaison');
  });

  it("n'expose pas les routes du simulateur", async () => {
    const { agent } = await registerMember(ctx.app);
    const response = await agent.post('/api/simulator/checkouts/sim_cs_x/pay').send({ outcome: 'success' }).expect(404);
    expect(response.body.error.code).toBe('route_introuvable');
  });

  it('vérifie les événements avec le secret du webhook Stripe', async () => {
    const event = stripeEvent('evt_mauvais_secret', 'customer.created', {});
    await postEvent(ctx.app, event, 'whsec_secret_du_simulateur').expect(400);
    await request(ctx.app).get('/api/health').expect(200);
  });
});
