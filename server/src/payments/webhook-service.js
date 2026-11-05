import Stripe from 'stripe';
import { withTransaction } from '../db/pool.js';
import { HttpError } from '../http/errors.js';
import { applyEvent } from './event-handlers.js';

/** Verifie la signature (schema Stripe : horodatage et HMAC-SHA256) sans aucun appel reseau. */
export function verifySignedEvent(rawBody, signature, secret) {
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature ?? '', secret);
  } catch {
    throw new HttpError(400, 'signature_invalide', 'La signature de cet evenement est invalide.');
  }
}

export function createWebhookService({ pool, webhookSecret }) {
  return {
    /**
     * Traite un evenement une seule fois. L'enregistrement de son identifiant et ses effets sont
     * dans la meme transaction :
     * - evenement rejoue : la cle primaire existe deja, rien n'est refait ;
     * - deux livraisons simultanees : la seconde attend la premiere, puis voit le doublon ;
     * - erreur pendant le traitement : tout est annule, Stripe pourra renvoyer l'evenement.
     */
    async receive(rawBody, signature) {
      const event = verifySignedEvent(rawBody, signature, webhookSecret);
      return withTransaction(pool, async (client) => {
        const { rowCount } = await client.query(
          `INSERT INTO webhook_events (event_id, type) VALUES ($1, $2)
           ON CONFLICT (event_id) DO NOTHING`,
          [event.id, event.type],
        );
        if (rowCount === 0) {
          return { duplicate: true };
        }
        await applyEvent(client, event);
        return { duplicate: false };
      });
    },
  };
}
