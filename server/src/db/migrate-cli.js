import { loadEnvFile } from './env-file.js';
import { loadConfig } from '../config.js';
import { migrate } from './migrate.js';
import { createPool } from './pool.js';

loadEnvFile();
const pool = createPool(loadConfig().databaseUrl);
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Migrations appliquées : ${applied.join(', ')}` : 'Base déjà à jour.');
} finally {
  await pool.end();
}
