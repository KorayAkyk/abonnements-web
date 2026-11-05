import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import PaymentTable from '../components/PaymentTable.jsx';
import PlanCards from '../components/PlanCards.jsx';
import { formatDate, formatPrice, STATUS_LABELS } from '../format.js';
import { useAsync } from '../useAsync.js';

function loadAccount() {
  return Promise.all([api.currentSubscription(), api.payments(), api.plans()]).then(
    ([current, history, catalog]) => ({
      subscription: current.subscription,
      payments: history.payments,
      plans: catalog.plans,
    }),
  );
}

function SubscriptionSummary({ subscription, onCancel, isBusy }) {
  const canCancel = ['active', 'past_due'].includes(subscription.status) && !subscription.cancelAtPeriodEnd;
  return (
    <div className="panel" data-testid="abonnement">
      <h2>Mon abonnement</h2>
      <p>
        <strong>{subscription.plan.name}</strong> -{' '}
        {formatPrice(subscription.plan.priceCents, subscription.plan.currency)} par mois{' '}
        <span className={`tag tag-${subscription.status}`}>{STATUS_LABELS[subscription.status]}</span>
      </p>
      {subscription.status === 'pending' && (
        <p>Le paiement n'a pas abouti. Choisissez une formule ci-dessous pour recommencer.</p>
      )}
      {subscription.status === 'past_due' && (
        <p role="alert">Le dernier paiement a été refusé.</p>
      )}
      {subscription.cancelAtPeriodEnd && subscription.status !== 'canceled' && (
        <p>Résiliation programmée : votre accès prend fin le {formatDate(subscription.currentPeriodEnd)}.</p>
      )}
      {!subscription.cancelAtPeriodEnd && ['active', 'past_due'].includes(subscription.status) && (
        <p>Prochaine échéance : {formatDate(subscription.currentPeriodEnd)}.</p>
      )}
      {subscription.status === 'canceled' && <p>Résilié le {formatDate(subscription.canceledAt)}.</p>}
      {canCancel && (
        <button type="button" className="button button-danger" disabled={isBusy} onClick={onCancel}>
          Résilier mon abonnement
        </button>
      )}
    </div>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const { data, error: loadError, reload } = useAsync(loadAccount);
  const [actionError, setActionError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleChoose(planCode) {
    setIsBusy(true);
    setActionError(null);
    try {
      const { checkoutUrl } = await api.startCheckout(planCode);
      // Adresse interne avec le simulateur, adresse de Stripe en mode test.
      window.location.assign(checkoutUrl);
    } catch (error) {
      setActionError(error);
      setIsBusy(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm('Résilier votre abonnement à la fin de la période payée ?')) {
      return;
    }
    setIsBusy(true);
    setActionError(null);
    try {
      await api.cancelSubscription();
      await reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsBusy(false);
    }
  }

  const subscription = data?.subscription;
  const canSubscribe = data && (!subscription || ['pending', 'canceled'].includes(subscription.status));

  return (
    <>
      <h1>Bonjour {user.fullName}</h1>
      <ErrorMessage error={loadError ?? actionError} />
      {data && !subscription && <p>Vous n'avez pas encore d'abonnement.</p>}
      {subscription && <SubscriptionSummary subscription={subscription} onCancel={handleCancel} isBusy={isBusy} />}
      {canSubscribe && (
        <section>
          <h2>Choisir une formule</h2>
          <PlanCards plans={data.plans} actionLabel="Souscrire" onChoose={handleChoose} busy={isBusy} />
        </section>
      )}
      {data && (
        <section>
          <h2>Historique des paiements</h2>
          <PaymentTable payments={data.payments} caption="Mes paiements, du plus récent au plus ancien" />
        </section>
      )}
    </>
  );
}
