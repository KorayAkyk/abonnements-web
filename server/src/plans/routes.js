import { Router } from 'express';
import { listPlans } from './repository.js';

export function planRoutes({ pool }) {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ plans: await listPlans(pool) });
  });

  return router;
}
