import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction } from './pool.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const MIGRATION_LOCK_ID = 727401;

const CREATE_TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

/**
 * Applique dans l'ordre les fichiers SQL pas encore passes, chacun dans sa transaction.
 * Refuse de continuer si une migration deja appliquee a ete modifiee.
 * Renvoie la liste des versions appliquees.
 */
export async function migrate(pool) {
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  const applied = [];

  return withTransaction(pool, async (client) => {
    // Deux demarrages simultanes ne doivent pas appliquer deux fois la meme migration.
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(CREATE_TRACKING_TABLE);
    const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
    const known = new Map(rows.map((row) => [row.version, row.checksum]));

    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (known.has(file)) {
        if (known.get(file) !== checksum) {
          throw new Error(`La migration ${file} a change apres avoir ete appliquee.`);
        }
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [file, checksum]);
      applied.push(file);
    }
    return applied;
  });
}
