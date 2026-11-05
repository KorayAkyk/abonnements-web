export async function getStats(db) {
  const { rows } = await db.query(`
    SELECT
      (SELECT count(*) FROM users WHERE role = 'member') AS "memberCount",
      (SELECT count(*) FROM subscriptions WHERE status = 'active') AS "activeCount",
      (SELECT count(*) FROM subscriptions WHERE status = 'past_due') AS "pastDueCount",
      (SELECT count(*) FROM subscriptions WHERE status = 'canceled') AS "canceledCount",
      (SELECT coalesce(sum(p.price_cents), 0)
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'active' AND NOT s.cancel_at_period_end) AS "monthlyRevenueCents",
      (SELECT coalesce(sum(amount_cents), 0) FROM payments WHERE status = 'paid') AS "totalPaidCents"`);
  return rows[0];
}

export async function listSubscriptions(db, { status, limit, offset }) {
  const { rows } = await db.query(
    `SELECT s.id, s.status, s.current_period_end AS "currentPeriodEnd",
            s.cancel_at_period_end AS "cancelAtPeriodEnd", s.created_at AS "createdAt",
            p.name AS "planName", u.email, u.full_name AS "fullName",
            count(*) OVER () AS total
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       JOIN users u ON u.id = s.user_id
      WHERE ($1::text IS NULL OR s.status = $1)
      ORDER BY s.created_at DESC, s.id
      LIMIT $2 OFFSET $3`,
    [status ?? null, limit, offset],
  );
  return rows;
}

export async function listPayments(db, { limit, offset }) {
  const { rows } = await db.query(
    `SELECT pay.id, pay.amount_cents AS "amountCents", pay.currency, pay.status,
            pay.occurred_at AS "occurredAt", p.name AS "planName", u.email,
            count(*) OVER () AS total
       FROM payments pay
       JOIN subscriptions s ON s.id = pay.subscription_id
       JOIN plans p ON p.id = s.plan_id
       JOIN users u ON u.id = s.user_id
      ORDER BY pay.occurred_at DESC, pay.id
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}
