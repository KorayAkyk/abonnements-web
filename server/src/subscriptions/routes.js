import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/sessions.js';
import { HttpError } from '../http/errors.js';
import { paginationSchema, parse } from '../http/validate.js';
import * as repository from './repository.js';
import { serializeSubscription } from './serialize.js';

const checkoutSchema = z.object({ planCode: z.string().trim().min(1).max(50) });

export function subscriptionRoutes({ pool, subscriptionService }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/current', async (req, res) => {
    const subscription = await repository.findCurrent(pool, req.user.id);
    res.json({ subscription: subscription ? serializeSubscription(subscription) : null });
  });

  router.post('/checkout', async (req, res) => {
    const { planCode } = parse(checkoutSchema, req.body);
    const result = await subscriptionService.startCheckout(req.user, planCode);
    res.status(201).json(result);
  });

  router.post('/current/cancel', async (req, res) => {
    const subscription = await repository.findLive(pool, req.user.id);
    if (!subscription) {
      throw new HttpError(404, 'abonnement_introuvable', "Ce compte n'a pas d'abonnement en cours.");
    }
    const updated = await subscriptionService.cancelAtPeriodEnd(subscription);
    res.json({ subscription: serializeSubscription(updated) });
  });

  router.get('/payments', async (req, res) => {
    const page = parse(paginationSchema, req.query);
    const rows = await repository.listPaymentsOfUser(pool, req.user.id, page);
    res.json({
      payments: rows.map(({ total: _total, ...payment }) => payment),
      total: rows[0]?.total ?? 0,
    });
  });

  return router;
}
