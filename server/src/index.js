import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { loadEnvFile } from './db/env-file.js';
import { createPool } from './db/pool.js';

loadEnvFile();
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = createApp({ pool, config });

const server = app.listen(config.port, () => {
  console.log(`Application prete sur ${config.appBaseUrl} (paiement : ${config.paymentProvider})`);
});

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
