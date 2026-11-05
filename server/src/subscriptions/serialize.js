/** Forme publique d'un abonnement : les identifiants du prestataire restent côté serveur. */
export function serializeSubscription(subscription) {
  return {
    id: subscription.id,
    status: subscription.status,
    provider: subscription.provider,
    plan: subscription.plan,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: subscription.canceledAt,
    createdAt: subscription.createdAt,
  };
}
