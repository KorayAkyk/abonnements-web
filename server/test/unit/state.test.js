import { describe, expect, it } from 'vitest';
import { isCancelable, nextStatus, TRIGGERS } from '../../src/subscriptions/state.js';

const { PAYMENT_SUCCEEDED, PAYMENT_FAILED, PROVIDER_CANCELED, CHECKOUT_EXPIRED } = TRIGGERS;

describe("cycle de vie de l'abonnement", () => {
  it.each([
    ['pending', PAYMENT_SUCCEEDED, 'active'],
    ['pending', PAYMENT_FAILED, 'pending'],
    ['pending', CHECKOUT_EXPIRED, 'expired'],
    ['active', PAYMENT_SUCCEEDED, 'active'],
    ['active', PAYMENT_FAILED, 'past_due'],
    ['active', PROVIDER_CANCELED, 'canceled'],
    ['active', CHECKOUT_EXPIRED, 'active'],
    ['past_due', PAYMENT_SUCCEEDED, 'active'],
    ['past_due', PAYMENT_FAILED, 'past_due'],
    ['past_due', PROVIDER_CANCELED, 'canceled'],
  ])('%s + %s donne %s', (current, trigger, expected) => {
    expect(nextStatus(current, trigger)).toBe(expected);
  });

  it.each([['canceled'], ['expired']])("%s est définitif, quel que soit l'événement", (status) => {
    for (const trigger of Object.values(TRIGGERS)) {
      expect(nextStatus(status, trigger)).toBe(status);
    }
  });

  it('refuse un état inconnu', () => {
    expect(() => nextStatus('inconnu', PAYMENT_SUCCEEDED)).toThrow(/inconnu/);
  });

  it('seuls les abonnements en cours sont résiliables', () => {
    expect(['pending', 'active', 'past_due', 'canceled', 'expired'].filter(isCancelable)).toEqual([
      'active',
      'past_due',
    ]);
  });
});
