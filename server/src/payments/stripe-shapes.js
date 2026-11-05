import { uuidSchema } from '../http/validate.js';

/**
 * Lecture des objets Stripe reçus par webhook. Certains champs ont change de place selon la
 * version d'API de l'endpoint (la version est choisie côté Stripe) : les deux formes sont lues.
 */

function validId(value) {
  return uuidSchema.safeParse(value).success ? value : null;
}

function toDate(unixSeconds) {
  return typeof unixSeconds === 'number' ? new Date(unixSeconds * 1000) : undefined;
}

function idOf(reference) {
  return typeof reference === 'string' ? reference : reference?.id;
}

/** Notre identifiant d'abonnement, déposé dans les métadonnées à la création de la session. */
export function localIdFromSession(session) {
  return validId(session.client_reference_id ?? session.metadata?.subscription_id);
}

export function localIdFromSubscription(subscription) {
  return validId(subscription.metadata?.subscription_id);
}

export function localIdFromInvoice(invoice) {
  const metadata = invoice.parent?.subscription_details?.metadata ?? invoice.subscription_details?.metadata;
  return validId(metadata?.subscription_id);
}

export function readSession(session) {
  return {
    providerSubscriptionId: idOf(session.subscription),
    providerCustomerId: idOf(session.customer),
    isPaid: session.payment_status === 'paid',
  };
}

export function readInvoice(invoice) {
  const line = invoice.lines?.data?.[0];
  return {
    invoiceId: invoice.id,
    providerSubscriptionId: idOf(invoice.parent?.subscription_details?.subscription ?? invoice.subscription),
    currency: invoice.currency,
    amountPaid: invoice.amount_paid,
    amountDue: invoice.amount_due,
    periodEnd: toDate(line?.period?.end),
    occurredAt: toDate(invoice.status_transitions?.paid_at) ?? toDate(invoice.created) ?? new Date(),
  };
}

export function readSubscription(subscription) {
  const periodEnd = subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end;
  return {
    providerSubscriptionId: subscription.id,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: toDate(periodEnd),
    canceledAt: toDate(subscription.ended_at ?? subscription.canceled_at),
  };
}
