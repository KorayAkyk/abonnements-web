import { describe, expect, it, vi } from 'vitest';
import { createStripeProvider } from '../../src/payments/stripe-provider.js';

const SUBSCRIPTION_ID = '6f1d3a52-3c1b-4a7e-9a55-0d2f7c9b1e10';
const PRICE_IDS = { essentiel: 'price_a', confort: 'price_b', integral: 'price_c' };

function fakeClient() {
  return {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: 'cs_test_1', url: 'https://paiement.test/cs_test_1' }),
        retrieve: vi.fn().mockResolvedValue({ status: 'open' }),
        expire: vi.fn().mockResolvedValue({}),
      },
    },
    subscriptions: { update: vi.fn().mockResolvedValue({}) },
  };
}

describe('prestataire Stripe, avec un faux client', () => {
  it('cree une session d abonnement reliee a notre identifiant, sans doublon possible', async () => {
    const client = fakeClient();
    const provider = createStripeProvider({ priceIds: PRICE_IDS, client });

    const checkout = await provider.createCheckout({
      subscriptionId: SUBSCRIPTION_ID,
      customerEmail: 'membre@exemple.test',
      planCode: 'confort',
      successUrl: 'http://app.test/ok',
      cancelUrl: 'http://app.test/non',
    });

    expect(checkout).toEqual({ checkoutId: 'cs_test_1', url: 'https://paiement.test/cs_test_1' });
    const [params, options] = client.checkout.sessions.create.mock.calls[0];
    expect(params.mode).toBe('subscription');
    expect(params.line_items).toEqual([{ price: 'price_b', quantity: 1 }]);
    expect(params.client_reference_id).toBe(SUBSCRIPTION_ID);
    expect(params.subscription_data.metadata.subscription_id).toBe(SUBSCRIPTION_ID);
    expect(options.idempotencyKey).toBe(`checkout-${SUBSCRIPTION_ID}`);
  });

  it('resilie a la fin de la periode, pas immediatement', async () => {
    const client = fakeClient();
    await createStripeProvider({ priceIds: PRICE_IDS, client }).cancelAtPeriodEnd('sub_1');
    expect(client.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
  });

  it('n expire une session que si elle est encore ouverte', async () => {
    const client = fakeClient();
    const provider = createStripeProvider({ priceIds: PRICE_IDS, client });
    await provider.expireCheckout('cs_1');
    expect(client.checkout.sessions.expire).toHaveBeenCalledTimes(1);

    client.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete' });
    await provider.expireCheckout('cs_2');
    expect(client.checkout.sessions.expire).toHaveBeenCalledTimes(1);
  });
});
