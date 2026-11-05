// Une seule commande pour tout demarrer : npm run demo
// N'utilise que Node : ce script tourne avant meme l'installation des dependances.
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
}

if (!existsSync(path.join(ROOT, 'node_modules'))) {
  run('npm ci');
}

// DATABASE_URL fournie : on utilise cette base, Docker n'est pas necessaire.
if (process.env.DATABASE_URL) {
  console.log('\nDATABASE_URL est definie : docker compose n\'est pas lance.');
} else {
  run('docker compose up -d --wait');
}

run('npm run db:migrate');
run('npm run db:seed');
run('npm run build');

console.log(`
Comptes de demonstration (mot de passe : demonstration-2026)
  membre : membre@salle-horizon.test
  admin  : admin@salle-horizon.test
`);

const server = spawn(process.execPath, ['server/src/index.js'], { cwd: ROOT, stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
