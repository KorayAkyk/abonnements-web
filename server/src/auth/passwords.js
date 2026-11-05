import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 32;
const MAX_MEMORY = 64 * 1024 * 1024;

async function derive(password, salt, { N, r, p }) {
  return scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY });
}

/** Format stocke : scrypt$N$r$p$sel$empreinte. Les parametres voyagent avec l'empreinte. */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [algorithm, N, r, p, salt, expected] = stored.split('$');
  if (algorithm !== 'scrypt') {
    return false;
  }
  const expectedHash = Buffer.from(expected, 'base64');
  const hash = await derive(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) });
  return hash.length === expectedHash.length && timingSafeEqual(hash, expectedHash);
}

let decoyHash;

/**
 * Compare le mot de passe a une empreinte factice quand le compte n'existe pas :
 * le temps de reponse ne revele donc pas si une adresse est inscrite.
 */
export async function burnPasswordCheck(password) {
  decoyHash ??= await hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, decoyHash);
}
