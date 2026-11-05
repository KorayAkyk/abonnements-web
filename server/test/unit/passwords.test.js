import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/passwords.js';

describe('mots de passe', () => {
  it('ne stockée jamais le mot de passe en clair et sale chaque empreinte', async () => {
    const first = await hashPassword('un-mot-de-passe');
    const second = await hashPassword('un-mot-de-passe');
    expect(first).not.toContain('un-mot-de-passe');
    expect(first).not.toBe(second);
    expect(first.startsWith('scrypt$')).toBe(true);
  });

  it('accepte le bon mot de passe et refuse les autres', async () => {
    const stored = await hashPassword('un-mot-de-passe');
    expect(await verifyPassword('un-mot-de-passe', stored)).toBe(true);
    expect(await verifyPassword('un-mot-de-passE', stored)).toBe(false);
  });

  it('refuse un format inconnu', async () => {
    expect(await verifyPassword('x', 'md5$abc')).toBe(false);
  });
});
