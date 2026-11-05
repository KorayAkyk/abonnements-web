import net from 'node:net';

/**
 * Aucun test ne doit sortir du poste : toute connexion vers un hote autre que la base et
 * l'application testee echoue immediatement. Un appel a Stripe ferait donc echouer le test.
 */
const databaseHost = new URL(process.env.DATABASE_URL ?? 'postgres://localhost').hostname;
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '::', '0.0.0.0', databaseHost]);

const originalConnect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function guardedConnect(...args) {
  const target = Array.isArray(args[0]) ? args[0][0] : args[0];
  const isOptions = typeof target === 'object' && target !== null;
  const isUnixSocket = isOptions ? Boolean(target.path) : typeof target === 'string';
  const host = isOptions ? target.host : args[1];
  if (!isUnixSocket && typeof host === 'string' && !ALLOWED_HOSTS.has(host)) {
    throw new Error(`Connexion reseau interdite pendant les tests : ${host}`);
  }
  return originalConnect.apply(this, args);
};
