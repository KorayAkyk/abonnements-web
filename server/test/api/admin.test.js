import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdmin, createTestContext, registerMember, subscribeAndPay } from '../helpers.js';

describe("espace d'administration", () => {
  let ctx;
  let admin;
  let activeMember;
  let activeId;
  let canceledId;

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await createAdmin(ctx);

    activeMember = await registerMember(ctx.app);
    ({ subscriptionId: activeId } = await subscribeAndPay(activeMember.agent, 'confort'));

    const canceledMember = await registerMember(ctx.app);
    ({ subscriptionId: canceledId } = await subscribeAndPay(canceledMember.agent, 'essentiel'));
    await admin.agent.post(`/api/simulator/subscriptions/${canceledId}/end-period`).expect(200);

    const lateMember = await registerMember(ctx.app);
    const { subscriptionId: lateId } = await subscribeAndPay(lateMember.agent, 'integral');
    await admin.agent.post(`/api/simulator/subscriptions/${lateId}/payment-failure`).expect(200);
  });
  afterAll(() => ctx.close());

  it('calcule les indicateurs', async () => {
    const response = await admin.agent.get('/api/admin/stats').expect(200);
    expect(response.body.stats).toEqual({
      memberCount: 3,
      activeCount: 1,
      pastDueCount: 1,
      canceledCount: 1,
      monthlyRevenueCents: 4500,
      totalPaidCents: 4500 + 2900 + 6900,
    });
  });

  it('liste les abonnements avec le membre et la formule', async () => {
    const response = await admin.agent.get('/api/admin/subscriptions').expect(200);
    expect(response.body.total).toBe(3);
    const row = response.body.subscriptions.find((subscription) => subscription.id === activeId);
    expect(row).toMatchObject({ status: 'active', planName: 'Confort', email: activeMember.email });
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);
  });

  it('filtre par statut et refuse un statut inconnu', async () => {
    const response = await admin.agent.get('/api/admin/subscriptions?status=canceled').expect(200);
    expect(response.body.subscriptions.map((subscription) => subscription.id)).toEqual([canceledId]);
    await admin.agent.get(`/api/admin/subscriptions?status=' OR 1=1 --`).expect(400);
  });

  it('pagine', async () => {
    const response = await admin.agent.get('/api/admin/subscriptions?limit=2&offset=2').expect(200);
    expect(response.body.subscriptions).toHaveLength(1);
    expect(response.body.total).toBe(3);
  });

  it('liste les paiements, réussis et refusés', async () => {
    const response = await admin.agent.get('/api/admin/payments').expect(200);
    expect(response.body.total).toBe(4);
    expect(response.body.payments.filter((payment) => payment.status === 'failed')).toHaveLength(1);
  });

  it("peut résilier l'abonnement d'un membre", async () => {
    const member = await registerMember(ctx.app);
    const { subscriptionId } = await subscribeAndPay(member.agent);
    const response = await admin.agent.post(`/api/admin/subscriptions/${subscriptionId}/cancel`).expect(200);
    expect(response.body.subscription.cancelAtPeriodEnd).toBe(true);
    const current = await member.agent.get('/api/subscriptions/current').expect(200);
    expect(current.body.subscription.cancelAtPeriodEnd).toBe(true);
  });

  it("valide l'identifiant et signale un abonnement absent", async () => {
    await admin.agent.post('/api/admin/subscriptions/pas-un-uuid/cancel').expect(400);
    await admin.agent.post('/api/admin/subscriptions/00000000-0000-4000-8000-000000000000/cancel').expect(404);
  });

  it('refuse une action de simulation inconnue ou impossible', async () => {
    await admin.agent.post(`/api/simulator/subscriptions/${activeId}/offrir`).expect(404);
    await admin.agent.post(`/api/simulator/subscriptions/${canceledId}/renew`).expect(409);
    await admin.agent.post('/api/simulator/subscriptions/00000000-0000-4000-8000-000000000000/renew').expect(404);
  });
});
