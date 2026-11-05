import Stripe from 'stripe';

/**
 * Prestataire reel, en mode test uniquement (voir config.js). Le client est injectable :
 * les tests passent un faux client et ce module n'ouvre alors aucune connexion.
 */
export function createStripeProvider({ secretKey, priceIds, client }) {
  const stripe = client ?? new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 10_000 });

  return {
    name: 'stripe',

    async createCheckout({ subscriptionId, customerEmail, planCode, successUrl, cancelUrl }) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          line_items: [{ price: priceIds[planCode], quantity: 1 }],
          customer_email: customerEmail,
          client_reference_id: subscriptionId,
          // Recopie sur l'abonnement Stripe : ses factures et ses evenements nous retrouvent ainsi.
          subscription_data: { metadata: { subscription_id: subscriptionId } },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        { idempotencyKey: `checkout-${subscriptionId}` },
      );
      return { checkoutId: session.id, url: session.url };
    },

    async expireCheckout(checkoutId) {
      const session = await stripe.checkout.sessions.retrieve(checkoutId);
      if (session.status === 'open') {
        await stripe.checkout.sessions.expire(checkoutId);
      }
    },

    async cancelAtPeriodEnd(providerSubscriptionId) {
      await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true });
    },
  };
}
