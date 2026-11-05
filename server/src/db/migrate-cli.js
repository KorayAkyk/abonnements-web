import { loadEnvFile } from './env-file.js';
import { loadConfig } from '../config.js';
import { migrate } from './migrate.js';
import { createPool } from './pool.js';

loadEnvFile();
const pool = createPool(loadConfig().databaseUrl);
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Migrations appliquees : ${applied.join(', ')}` : 'Base deja a jour.');
} finally {
  await pool.end();
}
