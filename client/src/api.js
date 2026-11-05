/** Erreur de l'API, avec son code stable et le détail par champ quand il existe. */
export class ApiError extends Error {
  constructor(status, { code, message, details } = {}) {
    super(message ?? 'Une erreur est survenue.');
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function call(method, path, body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) {
    return null;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.error);
  }
  return data;
}

export const api = {
  me: () => call('GET', '/auth/me'),
  register: (values) => call('POST', '/auth/register', values),
  login: (values) => call('POST', '/auth/login', values),
  logout: () => call('POST', '/auth/logout'),

  plans: () => call('GET', '/plans'),

  currentSubscription: () => call('GET', '/subscriptions/current'),
  startCheckout: (planCode) => call('POST', '/subscriptions/checkout', { planCode }),
  cancelSubscription: () => call('POST', '/subscriptions/current/cancel'),
  payments: () => call('GET', '/subscriptions/payments?limit=50'),

  simulatedCheckout: (checkoutId) => call('GET', `/simulator/checkouts/${encodeURIComponent(checkoutId)}`),
  paySimulatedCheckout: (checkoutId, outcome) =>
    call('POST', `/simulator/checkouts/${encodeURIComponent(checkoutId)}/pay`, { outcome }),
  simulateAdminEvent: (subscriptionId, action) =>
    call('POST', `/simulator/subscriptions/${encodeURIComponent(subscriptionId)}/${action}`),

  health: () => call('GET', '/health'),
  adminStats: () => call('GET', '/admin/stats'),
  adminSubscriptions: (status) =>
    call('GET', `/admin/subscriptions?limit=100${status ? `&status=${encodeURIComponent(status)}` : ''}`),
  adminPayments: () => call('GET', '/admin/payments?limit=20'),
  adminCancel: (subscriptionId) => call('POST', `/admin/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`),
};
