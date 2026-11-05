import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';

/** Fabrique des evenements de meme forme que ceux de Stripe, signes selon le meme schema. */

const DAY_SECONDS = 24 * 60 * 60;

function randomId(prefix) {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function event(type, object) {
  return { id: randomId('evt_sim'), object: 'event', type, created: nowSeconds(), data: { object } };
}

function providerSubscriptionId(subscription) {
  return subscription.providerSubscriptionId ?? randomId('sim_sub');
}

export function checkoutCompleted(subscription) {
  return event('checkout.session.completed', {
    id: subscription.providerCheckoutId,
    object: 'checkout.session',
    client_reference_id: subscription.id,
    payment_status: 'paid',
    subscription: providerSubscriptionId(subscription),
    customer: subscription.providerCustomerId ?? randomId('sim_cus'),
  });
}

export function checkoutExpired(subscription) {
  return event('checkout.session.expired', {
    id: subscription.providerCheckoutId,
    object: 'checkout.session',
    client_reference_id: subscription.id,
  });
}

function invoice(subscription, fields) {
  const start = nowSeconds();
  const invoiceObject = {
    id: randomId('sim_in'),
    object: 'invoice',
    currency: subscription.plan.currency,
    created: start,
    parent: { subscription_details: { metadata: { subscription_id: subscription.id } } },
    lines: { data: [{ period: { start, end: start + 30 * DAY_SECONDS } }] },
    ...fields,
  };
  return invoiceObject;
}

export function invoicePaid(subscription) {
  const amount = subscription.plan.priceCents;
  return event('invoice.paid', invoice(subscription, { amount_paid: amount, amount_due: amount }));
}

export function invoicePaymentFailed(subscription) {
  const amount = subscription.plan.priceCents;
  return event('invoice.payment_failed', invoice(subscription, { amount_paid: 0, amount_due: amount }));
}

export function subscriptionDeleted(subscription) {
  return event('customer.subscription.deleted', {
    id: subscription.providerSubscriptionId,
    object: 'subscription',
    metadata: { subscription_id: subscription.id },
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    ended_at: nowSeconds(),
  });
}

/** Signe un evenement comme le ferait Stripe. Renvoie le corps brut et l'en-tete de signature. */
export function signEvent(eventObject, secret) {
  const payload = JSON.stringify(eventObject);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { rawBody: Buffer.from(payload), signature };
}
