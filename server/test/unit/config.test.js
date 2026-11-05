import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const STRIPE_ENV = {
  PAYMENT_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_test_factice',
  STRIPE_WEBHOOK_SECRET: 'whsec_factice',
  STRIPE_PRICE_ESSENTIEL: 'price_a',
  STRIPE_PRICE_CONFORT: 'price_b',
  STRIPE_PRICE_INTEGRAL: 'price_c',
};

describe('configuration', () => {
  it('démarre sans aucune variable, en mode simulé', () => {
    const config = loadConfig({});
    expect(config.paymentProvider).toBe('simulator');
    expect(config.stripe).toBeNull();
    expect(config.cookieSecure).toBe(false);
    expect(config.simulatorWebhookSecret).toMatch(/^whsec_/);
  });

  it('traite une variable vide comme absente', () => {
    expect(loadConfig({ PORT: '', PAYMENT_PROVIDER: '' }).port).toBe(3000);
  });

  it('accepte une clé du mode test de Stripe', () => {
    expect(loadConfig(STRIPE_ENV).stripe.priceIds.confort).toBe('price_b');
  });

  it.each([['sk_live_factice'], ['rk_live_factice'], ['nimporte-quoi'], ['']])(
    'refuse la clé %j : seul le mode test est permis',
    (key) => {
      expect(() => loadConfig({ ...STRIPE_ENV, STRIPE_SECRET_KEY: key })).toThrow(/mode test/);
    },
  );

  it('exige le secret de webhook et les prix en mode Stripe', () => {
    expect(() => loadConfig({ ...STRIPE_ENV, STRIPE_WEBHOOK_SECRET: '' })).toThrow(/STRIPE_WEBHOOK_SECRET/);
    expect(() => loadConfig({ ...STRIPE_ENV, STRIPE_PRICE_CONFORT: '' })).toThrow(/STRIPE_PRICE_CONFORT/);
  });

  it('interdit le simulateur en production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://h/b' })).toThrow(/simulateur/);
  });

  it('exige une base explicite et des cookies sécurisés en production', () => {
    expect(() => loadConfig({ ...STRIPE_ENV, NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    const config = loadConfig({ ...STRIPE_ENV, NODE_ENV: 'production', DATABASE_URL: 'postgres://h/b' });
    expect(config.cookieSecure).toBe(true);
  });

  it('refuse une valeur mal formée', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Configuration invalide/);
  });
});
