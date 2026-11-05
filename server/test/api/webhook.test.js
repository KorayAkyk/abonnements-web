import Stripe from 'stripe';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countPayments,
  createTestContext,
  invoiceObject,
  postEvent,
  registerMember,
  stripeEvent,
  subscribeAndPay,
  TEST_WEBHOOK_SECRET,
} from '../helpers.js';

const WEBHOOK_URL = '/api/webhooks/payments';

function postRaw(app, body, signature) {
  const req = request(app).post(WEBHOOK_URL).set('Content-Type', 'application/json');
  return signature === undefined ? req.send(body) : req.set('Stripe-Signature', signature).send(body);
}

describe('webhook de paiement', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  async function eventCount(eventId) {
    const { rowCount } = await ctx.pool.query('SELECT 1 FROM webhook_events WHERE event_id = $1', [eventId]);
    return rowCount;
  }

  async function pendingSubscription() {
    const member = await registerMember(ctx.app);
    const checkout = await member.agent.post('/api/subscriptions/checkout').send({ planCode: 'confort' }).expect(201);
    return { ...member, subscriptionId: checkout.body.subscriptionId };
  }

  describe('signature', () => {
    it('active un abonnement sur un événement correctement signé', async () => {
      const { agent, subscriptionId } = await pendingSubscription();
      await postEvent(ctx.app, stripeEvent('evt_ok', 'invoice.paid', invoiceObject(subscriptionId))).expect(200);
      const current = await agent.get('/api/subscriptions/current').expect(200);
      expect(current.body.subscription.status).toBe('active');
    });

    it.each([
      ['absente', undefined],
      ['vide', ''],
      ['mal formée', 'pas-une-signature'],
    ])('refuse une signature %s, sans aucun effet', async (_label, signature) => {
      const { agent, subscriptionId } = await pendingSubscription();
      const eventId = `evt_sans_signature_${subscriptionId}`;
      const payload = JSON.stringify(stripeEvent(eventId, 'invoice.paid', invoiceObject(subscriptionId)));

      const response = await postRaw(ctx.app, payload, signature).expect(400);

      expect(response.body.error.code).toBe('signature_invalide');
      expect(await eventCount(eventId)).toBe(0);
      const current = await agent.get('/api/subscriptions/current').expect(200);
      expect(current.body.subscription.status).toBe('pending');
    });

    it('refuse un événement signé avec un autre secret', async () => {
      const { subscriptionId } = await pendingSubscription();
      const event = stripeEvent('evt_autre_secret', 'invoice.paid', invoiceObject(subscriptionId));
      await postEvent(ctx.app, event, 'whsec_autre_secret').expect(400);
      expect(await countPayments(ctx.pool, subscriptionId)).toBe(0);
    });

    it('refuse un corps modifié après signature : le montant ne peut pas être truqué', async () => {
      const { subscriptionId } = await pendingSubscription();
      const payload = JSON.stringify(stripeEvent('evt_truque', 'invoice.paid', invoiceObject(subscriptionId)));
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });

      await postRaw(ctx.app, payload.replace('"amount_paid":4500', '"amount_paid":1'), signature).expect(400);

      expect(await countPayments(ctx.pool, subscriptionId)).toBe(0);
    });

    it('refuse une signature trop ancienne : une capture ne peut pas être rejouée plus tard', async () => {
      const { subscriptionId } = await pendingSubscription();
      const payload = JSON.stringify(stripeEvent('evt_ancien', 'invoice.paid', invoiceObject(subscriptionId)));
      const signature = Stripe.webhooks.generateTestHeaderString({
        payload,
        secret: TEST_WEBHOOK_SECRET,
        timestamp: Math.floor(Date.now() / 1000) - 3600,
      });
      await postRaw(ctx.app, payload, signature).expect(400);
    });
  });

  describe('traitement unique', () => {
    it("un événement rejoué n'est traite qu'une fois", async () => {
      const { subscriptionId } = await pendingSubscription();
      const event = stripeEvent('evt_rejoue', 'invoice.paid', invoiceObject(subscriptionId));

      const first = await postEvent(ctx.app, event).expect(200);
      const second = await postEvent(ctx.app, event).expect(200);

      expect(first.body).toEqual({ received: true, duplicate: false });
      expect(second.body).toEqual({ received: true, duplicate: true });
      expect(await countPayments(ctx.pool, subscriptionId)).toBe(1);
    });

    it("des livraisons simultanées du même événement ne le traitent qu'une fois", async () => {
      const { subscriptionId } = await pendingSubscription();
      const event = stripeEvent('evt_simultane', 'invoice.paid', invoiceObject(subscriptionId));

      const responses = await Promise.all(Array.from({ length: 8 }, () => postEvent(ctx.app, event)));

      expect(responses.map((response) => response.status)).toEqual(Array(8).fill(200));
      expect(responses.filter((response) => !response.body.duplicate)).toHaveLength(1);
      expect(await countPayments(ctx.pool, subscriptionId)).toBe(1);
    });

    it("la même facture sous deux événements différents n'est comptée qu'une fois", async () => {
      const { subscriptionId } = await pendingSubscription();
      const invoice = invoiceObject(subscriptionId);
      await postEvent(ctx.app, stripeEvent('evt_facture_a', 'invoice.paid', invoice)).expect(200);
      await postEvent(ctx.app, stripeEvent('evt_facture_b', 'invoice.paid', invoice)).expect(200);
      expect(await countPayments(ctx.pool, subscriptionId)).toBe(1);
    });

    it('un traitement en échec est annulé en entier, et le renvoi aboutit', async () => {
      const { agent, subscriptionId } = await pendingSubscription();
      const eventId = 'evt_echec_puis_renvoi';
      // Montant négatif : refuse par une contrainte de la base, au milieu du traitement.
      const broken = stripeEvent(eventId, 'invoice.paid', invoiceObject(subscriptionId, { amount_paid: -1 }));

      await postEvent(ctx.app, broken).expect(500);

      expect(await eventCount(eventId)).toBe(0);
      expect(await countPayments(ctx.pool, subscriptionId)).toBe(0);

      await postEvent(ctx.app, stripeEvent(eventId, 'invoice.paid', invoiceObject(subscriptionId))).expect(200);
      expect(await eventCount(eventId)).toBe(1);
      const current = await agent.get('/api/subscriptions/current').expect(200);
      expect(current.body.subscription.status).toBe('active');
    });
  });

  describe('contenu des événements', () => {
    it("garde la trace d'un type inconnu sans échouer", async () => {
      await postEvent(ctx.app, stripeEvent('evt_inconnu', 'customer.created', { id: 'cus_1' })).expect(200);
      expect(await eventCount('evt_inconnu')).toBe(1);
    });

    it('ignore un événement qui ne vise aucun abonnement connu', async () => {
      const unknown = invoiceObject('00000000-0000-4000-8000-000000000000');
      await postEvent(ctx.app, stripeEvent('evt_orphelin', 'invoice.paid', unknown)).expect(200);
      const noMetadata = invoiceObject('x', { parent: null });
      await postEvent(ctx.app, stripeEvent('evt_sans_metadonnees', 'invoice.paid', noMetadata)).expect(200);
      const { rows } = await ctx.pool.query(`SELECT count(*) AS n FROM payments WHERE provider_invoice_id = $1`, [
        unknown.id,
      ]);
      expect(rows[0].n).toBe(0);
    });

    it("accepte les événements dans le désordre : facture d'abord, fin de session ensuite", async () => {
      const { agent, subscriptionId } = await pendingSubscription();
      await postEvent(ctx.app, stripeEvent('evt_ordre_1', 'invoice.paid', invoiceObject(subscriptionId))).expect(200);
      await postEvent(
        ctx.app,
        stripeEvent('evt_ordre_2', 'checkout.session.completed', {
          id: 'cs_test_ordre',
          client_reference_id: subscriptionId,
          payment_status: 'paid',
          subscription: 'sub_ordre',
          customer: 'cus_ordre',
        }),
      ).expect(200);
      const current = await agent.get('/api/subscriptions/current').expect(200);
      expect(current.body.subscription.status).toBe('active');
      expect(await countPayments(ctx.pool, subscriptionId)).toBe(1);
    });

    it("une mise à jour de l'abonnement synchronise la résiliation et la fin de période", async () => {
      const { agent } = await registerMember(ctx.app);
      const { subscriptionId } = await subscribeAndPay(agent);
      const end = Math.floor(Date.now() / 1000) + 1000;

      await postEvent(
        ctx.app,
        stripeEvent('evt_maj', 'customer.subscription.updated', {
          id: 'sub_maj',
          metadata: { subscription_id: subscriptionId },
          cancel_at_period_end: true,
          items: { data: [{ current_period_end: end }] },
        }),
      ).expect(200);

      const current = await agent.get('/api/subscriptions/current').expect(200);
      expect(current.body.subscription.cancelAtPeriodEnd).toBe(true);
      expect(new Date(current.body.subscription.currentPeriodEnd).getTime()).toBe(end * 1000);
    });
  });
});
