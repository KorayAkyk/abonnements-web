import Stripe from 'stripe';
import { withTransaction } from '../db/pool.js';
import { HttpError } from '../http/errors.js';
import { applyEvent } from './event-handlers.js';

/** Vérifie la signature (schéma Stripe : horodatage et HMAC-SHA256) sans aucun appel réseau. */
export function verifySignedEvent(rawBody, signature, secret) {
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature ?? '', secret);
  } catch {
    throw new HttpError(400, 'signature_invalide', 'La signature de cet événement est invalide.');
  }
}

export function createWebhookService({ pool, webhookSecret }) {
  return {
    /**
     * Traite un événement une seule fois. L'enregistrement de son identifiant et ses effets sont
     * dans la même transaction :
     * - événement rejoué : la clé primaire existe déjà, rien n'est refait ;
     * - deux livraisons simultanées : la seconde attend la première, puis voit le doublon ;
     * - erreur pendant le traitement : tout est annulé, Stripe pourra renvoyer l'événement.
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
