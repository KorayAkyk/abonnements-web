import * as repository from '../subscriptions/repository.js';
import { nextStatus, TRIGGERS } from '../subscriptions/state.js';
import * as shapes from './stripe-shapes.js';

/**
 * Chaque gestionnaire recoit le client de la transaction ouverte par le service de webhook :
 * l'effet et l'enregistrement de l'evenement sont donc valides ensemble, ou pas du tout.
 * Un evenement qui ne vise aucun abonnement connu est ignore : Stripe n'a pas a le renvoyer.
 */
async function lockSubscription(db, localId) {
  return localId ? repository.findById(db, localId, { forUpdate: true }) : null;
}

async function handleCheckoutCompleted(db, session) {
  const subscription = await lockSubscription(db, shapes.localIdFromSession(session));
  if (!subscription) {
    return;
  }
  const data = shapes.readSession(session);
  await repository.updateFields(db, subscription.id, {
    providerSubscriptionId: data.providerSubscriptionId,
    providerCustomerId: data.providerCustomerId,
    status: data.isPaid ? nextStatus(subscription.status, TRIGGERS.PAYMENT_SUCCEEDED) : undefined,
  });
}

async function handleCheckoutExpired(db, session) {
  const subscription = await lockSubscription(db, shapes.localIdFromSession(session));
  if (subscription) {
    await repository.updateFields(db, subscription.id, {
      status: nextStatus(subscription.status, TRIGGERS.CHECKOUT_EXPIRED),
    });
  }
}

async function handleInvoicePaid(db, invoice) {
  const subscription = await lockSubscription(db, shapes.localIdFromInvoice(invoice));
  if (!subscription) {
    return;
  }
  const data = shapes.readInvoice(invoice);
  await repository.insertPayment(db, {
    subscriptionId: subscription.id,
    amountCents: data.amountPaid,
    currency: data.currency,
    status: 'paid',
    invoiceId: data.invoiceId,
    occurredAt: data.occurredAt,
  });
  await repository.updateFields(db, subscription.id, {
    status: nextStatus(subscription.status, TRIGGERS.PAYMENT_SUCCEEDED),
    // La facture peut arriver avant la fin de session : elle suffit a relier l'abonnement Stripe.
    providerSubscriptionId: data.providerSubscriptionId,
    currentPeriodEnd: data.periodEnd,
  });
}

async function handleInvoiceFailed(db, invoice) {
  const subscription = await lockSubscription(db, shapes.localIdFromInvoice(invoice));
  if (!subscription) {
    return;
  }
  const data = shapes.readInvoice(invoice);
  await repository.insertPayment(db, {
    subscriptionId: subscription.id,
    amountCents: data.amountDue,
    currency: data.currency,
    status: 'failed',
    invoiceId: data.invoiceId,
    occurredAt: data.occurredAt,
  });
  await repository.updateFields(db, subscription.id, {
    status: nextStatus(subscription.status, TRIGGERS.PAYMENT_FAILED),
  });
}

async function handleSubscriptionUpdated(db, stripeSubscription) {
  const subscription = await lockSubscription(db, shapes.localIdFromSubscription(stripeSubscription));
  if (!subscription) {
    return;
  }
  const data = shapes.readSubscription(stripeSubscription);
  await repository.updateFields(db, subscription.id, {
    providerSubscriptionId: data.providerSubscriptionId,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
    currentPeriodEnd: data.currentPeriodEnd,
  });
}

async function handleSubscriptionDeleted(db, stripeSubscription) {
  const subscription = await lockSubscription(db, shapes.localIdFromSubscription(stripeSubscription));
  if (!subscription) {
    return;
  }
  const data = shapes.readSubscription(stripeSubscription);
  await repository.updateFields(db, subscription.id, {
    status: nextStatus(subscription.status, TRIGGERS.PROVIDER_CANCELED),
    canceledAt: data.canceledAt ?? new Date(),
  });
}

const HANDLERS = {
  'checkout.session.completed': handleCheckoutCompleted,
  'checkout.session.expired': handleCheckoutExpired,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handleInvoiceFailed,
  'customer.subscription.updated': handleSubscriptionUpdated,
  'customer.subscription.deleted': handleSubscriptionDeleted,
};

export async function applyEvent(db, event) {
  const handler = HANDLERS[event.type];
  if (handler) {
    await handler(db, event.data.object);
  }
}
