import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const LOCAL_DATABASE_URL = 'postgres://abonnements:abonnements@localhost:5433/abonnements';

/** Une variable vide dans .env compte comme absente. */
function blankToUndefined(env) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, value === '' ? undefined : value]));
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z.string().optional(),
  APP_BASE_URL: z.url().optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  PAYMENT_PROVIDER: z.enum(['simulator', 'stripe']).default('simulator'),
  SIMULATOR_WEBHOOK_SECRET: z.string().min(16).optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ESSENTIEL: z.string().optional(),
  STRIPE_PRICE_CONFORT: z.string().optional(),
  STRIPE_PRICE_INTEGRAL: z.string().optional(),
});

function loadStripeConfig(values) {
  const key = values.STRIPE_SECRET_KEY ?? '';
  // Garde-fou : ce projet de démonstration ne doit jamais toucher de vrai argent.
  if (!/^(sk|rk)_test_/.test(key)) {
    throw new Error('STRIPE_SECRET_KEY doit être une clé du mode test (sk_test_ ou rk_test_).');
  }
  const webhookSecret = values.STRIPE_WEBHOOK_SECRET ?? '';
  if (!webhookSecret.startsWith('whsec_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET est obligatoire avec PAYMENT_PROVIDER=stripe.');
  }
  const priceIds = {
    essentiel: values.STRIPE_PRICE_ESSENTIEL,
    confort: values.STRIPE_PRICE_CONFORT,
    integral: values.STRIPE_PRICE_INTEGRAL,
  };
  for (const [plan, priceId] of Object.entries(priceIds)) {
    if (!priceId?.startsWith('price_')) {
      throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} doit contenir un identifiant de prix Stripe.`);
    }
  }
  return { secretKey: key, webhookSecret, priceIds };
}

export function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(blankToUndefined(env));
  if (!parsed.success) {
    throw new Error(`Configuration invalide : ${z.prettifyError(parsed.error)}`);
  }
  const values = parsed.data;
  const isProduction = values.NODE_ENV === 'production';

  if (isProduction && !values.DATABASE_URL) {
    throw new Error('DATABASE_URL est obligatoire en production.');
  }
  // Le simulateur permet de "payer" sans argent : il n'a pas sa place en production.
  if (isProduction && values.PAYMENT_PROVIDER === 'simulator') {
    throw new Error('Le simulateur de paiement est interdit en production.');
  }

  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    databaseUrl: values.DATABASE_URL ?? LOCAL_DATABASE_URL,
    appBaseUrl: (values.APP_BASE_URL ?? `http://localhost:${values.PORT}`).replace(/\/$/, ''),
    cookieSecure: values.COOKIE_SECURE ? values.COOKIE_SECURE === 'true' : isProduction,
    trustProxy: values.TRUST_PROXY,
    sessionTtlHours: 24 * 7,
    rateLimit: { loginMax: 10, registerMax: 20 },
    paymentProvider: values.PAYMENT_PROVIDER,
    simulatorWebhookSecret: values.SIMULATOR_WEBHOOK_SECRET ?? `whsec_${randomBytes(24).toString('hex')}`,
    stripe: values.PAYMENT_PROVIDER === 'stripe' ? loadStripeConfig(values) : null,
  };
}
