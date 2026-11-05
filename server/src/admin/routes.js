import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../auth/sessions.js';
import { HttpError } from '../http/errors.js';
import { paginationSchema, parse, uuidSchema } from '../http/validate.js';
import * as subscriptions from '../subscriptions/repository.js';
import { serializeSubscription } from '../subscriptions/serialize.js';
import * as repository from './repository.js';

const listSchema = paginationSchema.extend({
  status: z.enum(['pending', 'active', 'past_due', 'canceled', 'expired']).optional(),
});

function withTotal(rows) {
  return { items: rows.map(({ total: _total, ...row }) => row), total: rows[0]?.total ?? 0 };
}

export function adminRoutes({ pool, subscriptionService }) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/stats', async (_req, res) => {
    res.json({ stats: await repository.getStats(pool) });
  });

  router.get('/subscriptions', async (req, res) => {
    const { items, total } = withTotal(await repository.listSubscriptions(pool, parse(listSchema, req.query)));
    res.json({ subscriptions: items, total });
  });

  router.get('/payments', async (req, res) => {
    const { items, total } = withTotal(await repository.listPayments(pool, parse(paginationSchema, req.query)));
    res.json({ payments: items, total });
  });

  router.post('/subscriptions/:id/cancel', async (req, res) => {
    const subscription = await subscriptions.findById(pool, parse(uuidSchema, req.params.id));
    if (!subscription) {
      throw new HttpError(404, 'abonnement_introuvable', 'Cet abonnement est introuvable.');
    }
    const updated = await subscriptionService.cancelAtPeriodEnd(subscription);
    res.json({ subscription: serializeSubscription(updated) });
  });

  return router;
}
