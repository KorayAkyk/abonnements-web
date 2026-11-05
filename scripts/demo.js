// Une seule commande pour tout démarrer : npm run demo
// N'utilise que Node : ce script tourne avant même l'installation des dépendances.
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
}

if (!existsSync(path.join(ROOT, 'node_modules'))) {
  run('npm ci');
}

// DATABASE_URL fournie : on utilise cette base, Docker n'est pas nécessaire.
if (process.env.DATABASE_URL) {
  console.log('\nDATABASE_URL est définie : docker compose n\'est pas lancé.');
} else {
  run('docker compose up -d --wait');
}

run('npm run db:migrate');
run('npm run db:seed');
run('npm run build');

console.log(`
Comptes de démonstration (mot de passe : demonstration-2026)
  membre : membre@salle-horizon.test
  admin  : admin@salle-horizon.test
`);

const server = spawn(process.execPath, ['server/src/index.js'], { cwd: ROOT, stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
