// Developpement : base, API avec rechargement automatique et interface Vite.
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command) {
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
}

if (!process.env.DATABASE_URL) {
  run('docker compose up -d --wait');
}
run('npm run db:migrate');
run('npm run db:seed');

const children = [
  spawn('npm', ['run', 'dev', '-w', 'server'], { cwd: ROOT, stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', 'client'], { cwd: ROOT, stdio: 'inherit' }),
];

function stopAll(signal) {
  for (const child of children) {
    child.kill(signal);
  }
}

for (const child of children) {
  child.on('exit', () => stopAll('SIGTERM'));
}
process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));
