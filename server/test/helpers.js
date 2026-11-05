import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { signEvent } from '../src/payments/simulator-events.js';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://abonnements:abonnements@localhost:5433/abonnements';

export const silentLogger = { error() {}, log() {}, warn() {} };

export const TEST_WEBHOOK_SECRET = `whsec_${randomBytes(24).toString('hex')}`;

const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL,
  APP_BASE_URL: 'http://app.test',
  SIMULATOR_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
};

/** Chaque fichier de test travaille dans son propre schéma : ils peuvent tourner en parallèle. */
export async function createTestContext({ env = {}, stripeClient } = {}) {
  const schema = `test_${randomBytes(8).toString('hex')}`;
  const admin = createPool(DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool(DATABASE_URL, { schema });
  await migrate(pool);
  const config = loadConfig({ ...TEST_ENV, ...env });
  const app = createApp({ pool, config, logger: silentLogger, stripeClient });

  return {
    app,
    pool,
    config,
    schema,
    async close() {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}

let userCounter = 0;

export function uniqueEmail(prefix = 'membre') {
  userCounter += 1;
  return `${prefix}.${userCounter}.${randomBytes(4).toString('hex')}@exemple.test`;
}

export const TEST_PASSWORD = 'mot-de-passe-de-test';

/** Crée un membre et renvoie un agent HTTP qui garde son cookie de session. */
export async function registerMember(app, email = uniqueEmail()) {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/register')
    .send({ email, fullName: 'Membre Test', password: TEST_PASSWORD })
    .expect(201);
  return { agent, email, user: response.body.user };
}

export async function createAdmin(ctx) {
  const member = await registerMember(ctx.app, uniqueEmail('admin'));
  await ctx.pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [member.user.id]);
  return member;
}

/** Souscrit et paie via le simulateur. Renvoie l'identifiant de session et l'abonnement. */
export async function subscribeAndPay(agent, planCode = 'confort') {
  const checkout = await agent.post('/api/subscriptions/checkout').send({ planCode }).expect(201);
  const checkoutId = checkout.body.checkoutUrl.split('/').pop();
  const paid = await agent.post(`/api/simulator/checkouts/${checkoutId}/pay`).send({ outcome: 'success' }).expect(200);
  return { checkoutId, subscriptionId: checkout.body.subscriptionId, subscription: paid.body.subscription };
}

/** Envoie un événement signé au vrai point d'entrée HTTP du webhook. */
export function postEvent(app, event, secret = TEST_WEBHOOK_SECRET) {
  const { rawBody, signature } = signEvent(event, secret);
  return request(app)
    .post('/api/webhooks/payments')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(rawBody.toString());
}

export function stripeEvent(id, type, object) {
  return { id, object: 'event', type, created: Math.floor(Date.now() / 1000), data: { object } };
}

export function invoiceObject(subscriptionId, fields = {}) {
  return {
    id: `in_${randomBytes(8).toString('hex')}`,
    object: 'invoice',
    currency: 'eur',
    amount_paid: 4500,
    amount_due: 4500,
    created: Math.floor(Date.now() / 1000),
    parent: { subscription_details: { metadata: { subscription_id: subscriptionId } } },
    lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 2592000 } }] },
    ...fields,
  };
}

export async function countPayments(pool, subscriptionId) {
  const { rows } = await pool.query('SELECT count(*) AS n FROM payments WHERE subscription_id = $1', [subscriptionId]);
  return rows[0].n;
}
