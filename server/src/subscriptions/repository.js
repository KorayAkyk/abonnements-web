const SUBSCRIPTION_SELECT = `
  SELECT s.id, s.status, s.provider, s.provider_checkout_id AS "providerCheckoutId",
         s.provider_subscription_id AS "providerSubscriptionId",
         s.provider_customer_id AS "providerCustomerId",
         s.current_period_end AS "currentPeriodEnd",
         s.cancel_at_period_end AS "cancelAtPeriodEnd",
         s.canceled_at AS "canceledAt", s.created_at AS "createdAt", s.user_id AS "userId",
         json_build_object('code', p.code, 'name', p.name, 'description', p.description,
                           'priceCents', p.price_cents, 'currency', p.currency) AS plan
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id`;

export async function findById(db, id, { forUpdate = false } = {}) {
  const lock = forUpdate ? 'FOR UPDATE OF s' : '';
  const { rows } = await db.query(`${SUBSCRIPTION_SELECT} WHERE s.id = $1 ${lock}`, [id]);
  return rows[0] ?? null;
}

export async function findByCheckoutId(db, checkoutId) {
  const { rows } = await db.query(`${SUBSCRIPTION_SELECT} WHERE s.provider_checkout_id = $1`, [checkoutId]);
  return rows[0] ?? null;
}

/** L'abonnement vivant du compte (au plus un, garanti par un index unique). */
export async function findLive(db, userId) {
  const { rows } = await db.query(
    `${SUBSCRIPTION_SELECT} WHERE s.user_id = $1 AND s.status IN ('pending', 'active', 'past_due')`,
    [userId],
  );
  return rows[0] ?? null;
}

/** L'abonnement a afficher : le vivant s'il existe, sinon le dernier resilie. */
export async function findCurrent(db, userId) {
  const { rows } = await db.query(
    `${SUBSCRIPTION_SELECT}
      WHERE s.user_id = $1 AND s.status <> 'expired'
      ORDER BY (s.status <> 'canceled') DESC, s.created_at DESC
      LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function insertPending(db, { userId, planId, provider }) {
  const { rows } = await db.query(
    `INSERT INTO subscriptions (user_id, plan_id, status, provider)
     VALUES ($1, $2, 'pending', $3)
     RETURNING id`,
    [userId, planId, provider],
  );
  return rows[0].id;
}

export async function setCheckoutId(db, id, checkoutId) {
  await db.query('UPDATE subscriptions SET provider_checkout_id = $2, updated_at = now() WHERE id = $1', [
    id,
    checkoutId,
  ]);
}

export async function markExpired(db, id) {
  await db.query(`UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE id = $1`, [id]);
}

export async function markCancelAtPeriodEnd(db, id) {
  await db.query('UPDATE subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE id = $1', [id]);
}

const UPDATABLE_COLUMNS = {
  status: 'status',
  providerSubscriptionId: 'provider_subscription_id',
  providerCustomerId: 'provider_customer_id',
  currentPeriodEnd: 'current_period_end',
  cancelAtPeriodEnd: 'cancel_at_period_end',
  canceledAt: 'canceled_at',
};

/** Met a jour les champs fournis. Les noms de colonnes viennent de la liste ci-dessus, jamais du dehors. */
export async function updateFields(db, id, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return;
  }
  const assignments = entries.map(([key], index) => `${UPDATABLE_COLUMNS[key]} = $${index + 2}`);
  await db.query(`UPDATE subscriptions SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1`, [
    id,
    ...entries.map(([, value]) => value),
  ]);
}

/** Enregistre un paiement. Renvoie false si cette issue de facture est deja connue. */
export async function insertPayment(db, payment) {
  const { rowCount } = await db.query(
    `INSERT INTO payments (subscription_id, amount_cents, currency, status, provider_invoice_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (provider_invoice_id, status) DO NOTHING`,
    [
      payment.subscriptionId,
      payment.amountCents,
      payment.currency,
      payment.status,
      payment.invoiceId,
      payment.occurredAt,
    ],
  );
  return rowCount === 1;
}

export async function listPaymentsOfUser(db, userId, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT pay.id, pay.amount_cents AS "amountCents", pay.currency, pay.status,
            pay.occurred_at AS "occurredAt", p.name AS "planName",
            count(*) OVER () AS total
       FROM payments pay
       JOIN subscriptions s ON s.id = pay.subscription_id
       JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1
      ORDER BY pay.occurred_at DESC, pay.id
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}
