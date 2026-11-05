import { useCallback, useState } from 'react';
import { api } from '../api.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import PaymentTable from '../components/PaymentTable.jsx';
import { formatDate, formatPrice, STATUS_LABELS } from '../format.js';
import { useAsync } from '../useAsync.js';

const SIMULATION_ACTIONS = [
  { action: 'renew', label: 'Renouveler' },
  { action: 'payment-failure', label: 'Refuser un paiement' },
  { action: 'end-period', label: 'Terminer la période' },
];

function Stat({ label, value }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SubscriptionRow({ subscription, isSimulator, isBusy, onCancel, onSimulate }) {
  const isLive = ['active', 'past_due'].includes(subscription.status);
  return (
    <tr data-email={subscription.email}>
      <td>
        {subscription.fullName}
        <br />
        <small>{subscription.email}</small>
      </td>
      <td>{subscription.planName}</td>
      <td>
        <span className={`tag tag-${subscription.status}`}>{STATUS_LABELS[subscription.status]}</span>
        {subscription.cancelAtPeriodEnd && isLive && <small> résiliation programmée</small>}
      </td>
      <td>{formatDate(subscription.currentPeriodEnd)}</td>
      <td className="actions">
        {isLive && !subscription.cancelAtPeriodEnd && (
          <button type="button" className="link-button" disabled={isBusy} onClick={() => onCancel(subscription.id)}>
            Résilier
          </button>
        )}
        {isLive &&
          isSimulator &&
          SIMULATION_ACTIONS.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              className="link-button"
              disabled={isBusy}
              onClick={() => onSimulate(subscription.id, action)}
            >
              {label}
            </button>
          ))}
      </td>
    </tr>
  );
}

export default function AdminPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const loader = useCallback(
    () =>
      Promise.all([api.adminStats(), api.adminSubscriptions(statusFilter), api.adminPayments(), api.health()]).then(
        ([stats, subscriptions, payments, health]) => ({
          stats: stats.stats,
          subscriptions: subscriptions.subscriptions,
          payments: payments.payments,
          isSimulator: health.paymentProvider === 'simulator',
        }),
      ),
    [statusFilter],
  );
  const { data, error: loadError, reload } = useAsync(loader);
  const [actionError, setActionError] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  async function run(action) {
    setIsBusy(true);
    setActionError(null);
    try {
      await action();
      await reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <h1>Administration</h1>
      <ErrorMessage error={loadError ?? actionError} />
      {data && (
        <dl className="stats">
          <Stat label="Membres" value={data.stats.memberCount} />
          <Stat label="Abonnements actifs" value={data.stats.activeCount} />
          <Stat label="En retard de paiement" value={data.stats.pastDueCount} />
          <Stat label="Résiliés" value={data.stats.canceledCount} />
          <Stat label="Revenu mensuel prévu" value={formatPrice(data.stats.monthlyRevenueCents)} />
          <Stat label="Total encaissé" value={formatPrice(data.stats.totalPaidCents)} />
        </dl>
      )}
      <section>
        <h2>Abonnements</h2>
        <label className="inline-field">
          Filtrer par statut
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tous</option>
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <div className="table-wrap">
            <table>
              <caption>Abonnements, du plus récent au plus ancien</caption>
              <thead>
                <tr>
                  <th scope="col">Membre</th>
                  <th scope="col">Formule</th>
                  <th scope="col">État</th>
                  <th scope="col">Fin de période</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((subscription) => (
                  <SubscriptionRow
                    key={subscription.id}
                    subscription={subscription}
                    isSimulator={data.isSimulator}
                    isBusy={isBusy}
                    onCancel={(id) => run(() => api.adminCancel(id))}
                    onSimulate={(id, action) => run(() => api.simulateAdminEvent(id, action))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {data && (
        <section>
          <h2>Derniers paiements</h2>
          <PaymentTable payments={data.payments} caption="Les 20 derniers paiements" showEmail />
        </section>
      )}
    </>
  );
}
