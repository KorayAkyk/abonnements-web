import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../auth/sessions.js';
import { HttpError } from '../http/errors.js';
import { parse, uuidSchema } from '../http/validate.js';
import * as repository from '../subscriptions/repository.js';
import { serializeSubscription } from '../subscriptions/serialize.js';
import * as simulated from './simulator-events.js';

const payBodySchema = z.object({ outcome: z.enum(['success', 'declined', 'abandon']) });

const CHECKOUT_EVENTS = {
  success: [simulated.checkoutCompleted, simulated.invoicePaid],
  declined: [simulated.invoicePaymentFailed],
  abandon: [simulated.checkoutExpired],
};

const ADMIN_EVENTS = {
  renew: { build: simulated.invoicePaid, allowed: ['active', 'past_due'] },
  'payment-failure': { build: simulated.invoicePaymentFailed, allowed: ['active', 'past_due'] },
  'end-period': { build: simulated.subscriptionDeleted, allowed: ['active', 'past_due'] },
};

/** Routes du simulateur : montées uniquement quand PAYMENT_PROVIDER vaut simulator. */
export function simulatorRoutes({ pool, webhookService, webhookSecret }) {
  const router = Router();

  // Passe par le service de webhook : signature vérifiée et traitement unique, comme avec Stripe.
  async function deliver(eventObject) {
    const { rawBody, signature } = simulated.signEvent(eventObject, webhookSecret);
    await webhookService.receive(rawBody, signature);
  }

  async function findOwnCheckout(req) {
    const subscription = await repository.findByCheckoutId(pool, req.params.checkoutId);
    // Même réponse pour une session absente ou celle d'un autre : pas d'indice sur son existence.
    if (!subscription || subscription.userId !== req.user.id) {
      throw new HttpError(404, 'session_introuvable', 'Cette session de paiement est introuvable.');
    }
    return subscription;
  }

  router.get('/checkouts/:checkoutId', requireAuth, async (req, res) => {
    const subscription = await findOwnCheckout(req);
    res.json({ status: subscription.status, plan: subscription.plan });
  });

  router.post('/checkouts/:checkoutId/pay', requireAuth, async (req, res) => {
    const { outcome } = parse(payBodySchema, req.body);
    const subscription = await findOwnCheckout(req);
    if (subscription.status !== 'pending') {
      throw new HttpError(409, 'session_terminee', 'Cette session de paiement est terminée.');
    }
    // checkoutCompleted fixe l'identifiant de l'abonnement simulé : on le relit pour la facture.
    for (const build of CHECKOUT_EVENTS[outcome]) {
      await deliver(build(await repository.findById(pool, subscription.id)));
    }
    const updated = await repository.findById(pool, subscription.id);
    res.json({ subscription: serializeSubscription(updated) });
  });

  router.post('/subscriptions/:id/:action', requireAdmin, async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const action = ADMIN_EVENTS[req.params.action];
    if (!action) {
      throw new HttpError(404, 'action_inconnue', 'Cette action de simulation est inconnue.');
    }
    const subscription = await repository.findById(pool, id);
    if (!subscription) {
      throw new HttpError(404, 'abonnement_introuvable', 'Cet abonnement est introuvable.');
    }
    if (!action.allowed.includes(subscription.status)) {
      throw new HttpError(409, 'action_impossible', 'Cette action est impossible dans cet état.');
    }
    await deliver(action.build(subscription));
    const updated = await repository.findById(pool, id);
    res.json({ subscription: serializeSubscription(updated) });
  });

  return router;
}
