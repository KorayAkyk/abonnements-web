import express, { Router } from 'express';
import { HttpError } from '../http/errors.js';

/** Monte avant express.json() : la signature porte sur les octets exacts du corps. */
export function webhookRoutes({ webhookService }) {
  const router = Router();

  router.post('/payments', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      throw new HttpError(400, 'signature_invalide', 'La signature de cet événement est invalide.');
    }
    const result = await webhookService.receive(req.body, req.get('stripe-signature'));
    res.json({ received: true, duplicate: result.duplicate });
  });

  return router;
}
