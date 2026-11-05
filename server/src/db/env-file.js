import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_ENV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');

/** Charge le .env de la racine s'il existe. Les variables déjà définies gardent la priorité. */
export function loadEnvFile() {
  if (existsSync(ROOT_ENV)) {
    process.loadEnvFile(ROOT_ENV);
  }
}
