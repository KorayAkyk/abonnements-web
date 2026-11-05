const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

export function formatPrice(cents, currency = 'eur') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

export function formatDate(value) {
  return value ? DATE_FORMAT.format(new Date(value)) : '-';
}

export const STATUS_LABELS = {
  pending: 'Paiement en attente',
  active: 'Actif',
  past_due: 'Paiement en retard',
  canceled: 'Résilié',
  expired: 'Expiré',
};

export const PAYMENT_LABELS = { paid: 'Payé', failed: 'Refusé' };
