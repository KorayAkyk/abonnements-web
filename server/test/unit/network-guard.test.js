import net from 'node:net';
import { describe, expect, it } from 'vitest';

describe('garde réseau des tests', () => {
  it('bloque toute connexion vers un hôte extérieur', () => {
    expect(() => net.connect(443, 'hote-extérieur.invalid')).toThrow(/interdite/);
    expect(() => net.connect({ host: 'hote-extérieur.invalid', port: 443 })).toThrow(/interdite/);
  });
});
