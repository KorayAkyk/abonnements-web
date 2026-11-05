import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countPayments,
  createAdmin,
  createTestContext,
  invoiceObject,
  postEvent,
  registerMember,
  stripeEvent,
  subscribeAndPay,
} from '../helpers.js';

describe('resiliation', () => {
  let ctx;
  let admin;

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await createAdmin(ctx);
  });
  afterAll(() => ctx.close());

  async function endPeriod(subscriptionId) {
    return admin.agent.post(`/api/simulator/subscriptions/${subscriptionId}/end-period`).expect(200);
  }

  it('programme la fin : l abonnement reste actif jusqu a la fin de la periode payee', async () => {
    const { agent } = await registerMember(ctx.app);
    await subscribeAndPay(agent);

    const response = await agent.post('/api/subscriptions/current/cancel').expect(200);

    expect(response.body.subscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
  });

  it('demander deux fois la resiliation ne change rien de plus', async () => {
    const { agent } = await registerMember(ctx.app);
    await subscribeAndPay(agent);
    await agent.post('/api/subscriptions/current/cancel').expect(200);
    const second = await agent.post('/api/subscriptions/current/cancel').expect(200);
    expect(second.body.subscription.cancelAtPeriodEnd).toBe(true);
  });

  it('passe en resilie a la fin de la periode', async () => {
    const { agent } = await registerMember(ctx.app);
    const { subscriptionId } = await subscribeAndPay(agent);
    await agent.post('/api/subscriptions/current/cancel').expect(200);

    await endPeriod(subscriptionId);

    const current = await agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription.status).toBe('canceled');
    expect(current.body.subscription.canceledAt).not.toBeNull();
  });

  it('sans abonnement, il n y a rien a resilier', async () => {
    const { agent } = await registerMember(ctx.app);
    const response = await agent.post('/api/subscriptions/current/cancel').expect(404);
    expect(response.body.error.code).toBe('abonnement_introuvable');
  });

  it('un abonnement en attente de paiement n est pas resiliable', async () => {
    const { agent } = await registerMember(ctx.app);
    await agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
    const response = await agent.post('/api/subscriptions/current/cancel').expect(409);
    expect(response.body.error.code).toBe('abonnement_non_resiliable');
  });

  it('un abonnement deja resilie n est plus resiliable, meme par l administration', async () => {
    const { agent } = await registerMember(ctx.app);
    const { subscriptionId } = await subscribeAndPay(agent);
    await endPeriod(subscriptionId);

    await agent.post('/api/subscriptions/current/cancel').expect(404);
    await admin.agent.post(`/api/admin/subscriptions/${subscriptionId}/cancel`).expect(409);
  });

  it('un compte resilie peut se reabonner, et l ancien historique reste', async () => {
    const { agent } = await registerMember(ctx.app);
    const { subscriptionId } = await subscribeAndPay(agent, 'essentiel');
    await endPeriod(subscriptionId);

    const again = await subscribeAndPay(agent, 'integral');

    expect(again.subscriptionId).not.toBe(subscriptionId);
    expect(again.subscription).toMatchObject({ status: 'active', plan: { code: 'integral' } });
    const payments = await agent.get('/api/subscriptions/payments').expect(200);
    expect(payments.body.total).toBe(2);
  });

  it('une facture arrivee en retard ne ranime pas un abonnement resilie, mais reste comptee', async () => {
    const { agent } = await registerMember(ctx.app);
    const { subscriptionId } = await subscribeAndPay(agent);
    await endPeriod(subscriptionId);

    await postEvent(ctx.app, stripeEvent('evt_retard', 'invoice.paid', invoiceObject(subscriptionId))).expect(200);

    const current = await agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription.status).toBe('canceled');
    expect(await countPayments(ctx.pool, subscriptionId)).toBe(2);
  });

  it('un echec de renouvellement met en retard, un paiement regularise', async () => {
    const { agent } = await registerMember(ctx.app);
    const { subscriptionId } = await subscribeAndPay(agent);

    const failed = await admin.agent.post(`/api/simulator/subscriptions/${subscriptionId}/payment-failure`).expect(200);
    expect(failed.body.subscription.status).toBe('past_due');

    const renewed = await admin.agent.post(`/api/simulator/subscriptions/${subscriptionId}/renew`).expect(200);
    expect(renewed.body.subscription.status).toBe('active');
  });

  it('un abonnement en retard de paiement reste resiliable', async () => {
    const { agent } = await registerMember(ctx.app);
    const { subscriptionId } = await subscribeAndPay(agent);
    await admin.agent.post(`/api/simulator/subscriptions/${subscriptionId}/payment-failure`).expect(200);

    const response = await agent.post('/api/subscriptions/current/cancel').expect(200);
    expect(response.body.subscription).toMatchObject({ status: 'past_due', cancelAtPeriodEnd: true });
  });
});
