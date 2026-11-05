import pg from 'pg';

// bigint (COUNT, SUM) : renvoyé en nombre, les montants de cette application tiennent largement.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export function createPool(connectionString, { schema } = {}) {
  return new pg.Pool({
    connectionString,
    max: 10,
    // Les tests isolent chaque fichier dans son propre schéma.
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  });
}

/**
 * Exécute fn dans une transaction : validation si tout se passe bien,
 * annulation si fn lève une erreur.
 */
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
