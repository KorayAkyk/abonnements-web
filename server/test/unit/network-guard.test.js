import net from 'node:net';
import { describe, expect, it } from 'vitest';

describe('garde reseau des tests', () => {
  it('bloque toute connexion vers un hote exterieur', () => {
    expect(() => net.connect(443, 'hote-exterieur.invalid')).toThrow(/interdite/);
    expect(() => net.connect({ host: 'hote-exterieur.invalid', port: 443 })).toThrow(/interdite/);
  });
});
