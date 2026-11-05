/**
 * Cycle de vie d'un abonnement, sans base de donnees ni reseau.
 *
 *   pending --paiement recu--> active --paiement refuse--> past_due
 *      |                          ^                           |
 *      | session expiree          +------paiement recu--------+
 *      v
 *   expired                    active/past_due/pending --fin chez le prestataire--> canceled
 *
 * canceled et expired sont definitifs : un evenement en retard ne ranime jamais un abonnement.
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

/** Renvoie le nouvel etat, ou l'etat courant si l'evenement ne change rien. */
export function nextStatus(current, trigger) {
  const transitions = TRANSITIONS[current];
  if (!transitions) {
    throw new Error(`Etat d'abonnement inconnu : ${current}`);
  }
  return transitions[trigger] ?? current;
}

/** Un abonnement resiliable : il donne acces a la salle et n'est pas deja termine. */
export function isCancelable(status) {
  return status === 'active' || status === 'past_due';
}
