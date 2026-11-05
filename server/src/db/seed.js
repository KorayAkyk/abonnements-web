import { hashPassword } from '../auth/passwords.js';
import { findPlanByCode } from '../plans/repository.js';

/** Donnees inventees pour la demonstration. Le domaine .test est reserve : il n'existe pas. */
export const DEMO_PASSWORD = 'demonstration-2026';
export const DEMO_ADMIN_EMAIL = 'admin@salle-horizon.test';
export const DEMO_MEMBER_EMAIL = 'membre@salle-horizon.test';

const DAY_MS = 24 * 60 * 60 * 1000;

const MEMBERS = [
  { email: DEMO_MEMBER_EMAIL, name: 'Membre Demonstration', plan: 'confort', status: 'active', months: 3 },
  { email: 'lea.exemple@salle-horizon.test', name: 'Lea Exemple', plan: 'essentiel', status: 'active', months: 5 },
  { email: 'noe.fictif@salle-horizon.test', name: 'Noe Fictif', plan: 'integral', status: 'past_due', months: 2 },
  { email: 'ines.essai@salle-horizon.test', name: 'Ines Essai', plan: 'confort', status: 'canceled', months: 4 },
  { email: 'tom.modele@salle-horizon.test', name: 'Tom Modele', plan: 'essentiel', status: 'active', months: 1 },
];

async function insertUser(db, { email, name, role, passwordHash }) {
  const { rows } = await db.query(
    `INSERT INTO users (email, full_name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, name, passwordHash, role],
  );
  return rows[0].id;
}

async function insertHistory(db, member, userId) {
  const now = Date.now();
  const isCanceled = member.status === 'canceled';
  const plan = await findPlanByCode(db, member.plan);
  const price = plan.priceCents;
  const { rows } = await db.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, provider, provider_subscription_id,
                                provider_customer_id, current_period_end, canceled_at, created_at)
     VALUES ($1, $2, $3, 'simulator', $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      userId,
      plan.id,
      member.status,
      `sim_sub_demo_${userId}`,
      `sim_cus_demo_${userId}`,
      new Date(now + (isCanceled ? -10 : 18) * DAY_MS),
      isCanceled ? new Date(now - 10 * DAY_MS) : null,
      new Date(now - (member.months * 30 + 12) * DAY_MS),
    ],
  );
  const subscriptionId = rows[0].id;

  for (let month = member.months; month >= 1; month -= 1) {
    await db.query(
      `INSERT INTO payments (subscription_id, amount_cents, currency, status, provider_invoice_id, occurred_at)
       VALUES ($1, $2, 'eur', 'paid', $3, $4)`,
      [subscriptionId, price, `sim_in_demo_${subscriptionId}_${month}`, new Date(now - (month * 30 - 18) * DAY_MS)],
    );
  }
  if (member.status === 'past_due') {
    await db.query(
      `INSERT INTO payments (subscription_id, amount_cents, currency, status, provider_invoice_id, occurred_at)
       VALUES ($1, $2, 'eur', 'failed', $3, $4)`,
      [subscriptionId, price, `sim_in_demo_${subscriptionId}_echec`, new Date(now - 2 * DAY_MS)],
    );
  }
}

/** Remplit une base vide. Ne fait rien si le compte d'administration existe deja. */
export async function seed(db) {
  const { rowCount } = await db.query('SELECT 1 FROM users WHERE email = $1', [DEMO_ADMIN_EMAIL]);
  if (rowCount > 0) {
    return false;
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await insertUser(db, { email: DEMO_ADMIN_EMAIL, name: 'Administration Horizon', role: 'admin', passwordHash });
  for (const member of MEMBERS) {
    const userId = await insertUser(db, { ...member, role: 'member', passwordHash });
    await insertHistory(db, member, userId);
  }
  return true;
}
