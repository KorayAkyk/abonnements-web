import { loadConfig } from '../config.js';
import { loadEnvFile } from './env-file.js';
import { createPool, withTransaction } from './pool.js';
import { seed } from './seed.js';

loadEnvFile();
const config = loadConfig();
if (config.nodeEnv === 'production') {
  throw new Error('Les donnees de demonstration sont interdites en production.');
}
const pool = createPool(config.databaseUrl);
try {
  const created = await withTransaction(pool, seed);
  console.log(created ? 'Donnees de demonstration creees.' : 'Donnees de demonstration deja presentes.');
} finally {
  await pool.end();
}
