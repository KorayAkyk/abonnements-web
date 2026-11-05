const PLAN_COLUMNS = `
  p.code, p.name, p.description, p.price_cents AS "priceCents", p.currency`;

export async function listPlans(db) {
  const { rows } = await db.query(`SELECT ${PLAN_COLUMNS} FROM plans p ORDER BY p.position`);
  return rows;
}

export async function findPlanByCode(db, code) {
  const { rows } = await db.query(`SELECT p.id, ${PLAN_COLUMNS} FROM plans p WHERE p.code = $1`, [code]);
  return rows[0] ?? null;
}
