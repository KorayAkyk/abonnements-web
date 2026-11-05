/**
 * Cycle de vie d'un abonnement, sans base de données ni réseau.
 *
 *   pending --paiement recu--> active --paiement refusé--> past_due
 *      |                          ^                           |
 *      | session expirée          +------paiement recu--------+
 *      v
 *   expired                    active/past_due/pending --fin chez le prestataire--> canceled
 *
 * canceled et expired sont définitifs : un événement en retard ne ranime jamais un abonnement.
 */
export const TRIGGERS = Object.freeze({
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  PAYMENT_FAILED: 'payment_failed',
  PROVIDER_CANCELED: 'provider_canceled',
  CHECKOUT_EXPIRED: 'checkout_expired',
});

const TRANSITIONS = {
  pending: {
    [TRIGGERS.PAYMENT_SUCCEEDED]: 'active',
    [TRIGGERS.PROVIDER_CANCELED]: 'canceled',
    [TRIGGERS.CHECKOUT_EXPIRED]: 'expired',
  },
  active: {
    [TRIGGERS.PAYMENT_FAILED]: 'past_due',
    [TRIGGERS.PROVIDER_CANCELED]: 'canceled',
  },
  past_due: {
    [TRIGGERS.PAYMENT_SUCCEEDED]: 'active',
    [TRIGGERS.PROVIDER_CANCELED]: 'canceled',
  },
  canceled: {},
  expired: {},
};

/** Renvoie le nouvel état, ou l'état courant si l'événement ne change rien. */
export function nextStatus(current, trigger) {
  const transitions = TRANSITIONS[current];
  if (!transitions) {
    throw new Error(`État d'abonnement inconnu : ${current}`);
  }
  return transitions[trigger] ?? current;
}

/** Un abonnement résiliable : il donne accès à la salle et n'est pas déjà terminé. */
export function isCancelable(status) {
  return status === 'active' || status === 'past_due';
}
