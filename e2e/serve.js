// Prepare la base du parcours (migrations, donnees de demonstration) puis demarre l'application.
// L'interface doit avoir ete construite avant : npm run build.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

if (!existsSync(new URL('../client/dist/index.html', import.meta.url))) {
  throw new Error("L'interface n'est pas construite : lancez npm run build.");
}

for (const script of ['server/src/db/migrate-cli.js', 'server/src/db/seed-cli.js']) {
  execFileSync(process.execPath, [script], { cwd: ROOT, stdio: 'inherit' });
}

await import('../server/src/index.js');
