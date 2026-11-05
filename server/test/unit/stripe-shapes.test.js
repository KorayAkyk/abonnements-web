import { describe, expect, it } from 'vitest';
import * as shapes from '../../src/payments/stripe-shapes.js';

const LOCAL_ID = '6f1d3a52-3c1b-4a7e-9a55-0d2f7c9b1e10';

describe('lecture des objets Stripe', () => {
  it('retrouve notre identifiant sur une facture, forme recente et forme ancienne', () => {
    const metadata = { subscription_id: LOCAL_ID };
    expect(shapes.localIdFromInvoice({ parent: { subscription_details: { metadata } } })).toBe(LOCAL_ID);
    expect(shapes.localIdFromInvoice({ subscription_details: { metadata } })).toBe(LOCAL_ID);
  });

  it('ignore une facture sans identifiant ou avec un identifiant mal forme', () => {
    expect(shapes.localIdFromInvoice({})).toBeNull();
    expect(
      shapes.localIdFromInvoice({ parent: { subscription_details: { metadata: { subscription_id: "1' OR 1=1" } } } }),
    ).toBeNull();
  });

  it('lit la fin de periode sur les lignes de l abonnement, ou a la racine', () => {
    const end = 1_900_000_000;
    const expected = new Date(end * 1000);
    expect(shapes.readSubscription({ items: { data: [{ current_period_end: end }] } }).currentPeriodEnd).toEqual(
      expected,
    );
    expect(shapes.readSubscription({ current_period_end: end }).currentPeriodEnd).toEqual(expected);
  });

  it('accepte une reference Stripe sous forme de texte ou d objet', () => {
    expect(shapes.readSession({ subscription: 'sub_1', customer: { id: 'cus_1' } })).toMatchObject({
      providerSubscriptionId: 'sub_1',
      providerCustomerId: 'cus_1',
    });
  });

  it('lit la facture : montants, date de paiement et abonnement lie', () => {
    const data = shapes.readInvoice({
      id: 'in_1',
      currency: 'eur',
      amount_paid: 100,
      amount_due: 100,
      status_transitions: { paid_at: 1_800_000_000 },
      parent: { subscription_details: { subscription: 'sub_9' } },
    });
    expect(data.occurredAt).toEqual(new Date(1_800_000_000_000));
    expect(data.providerSubscriptionId).toBe('sub_9');
  });
});
