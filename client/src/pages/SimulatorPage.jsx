import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { formatPrice } from '../format.js';
import { useAsync } from '../useAsync.js';

/** Tient le rôle de la page de paiement de Stripe quand aucune clé n'est configurée. */
export default function SimulatorPage() {
  const { checkoutId } = useParams();
  const navigate = useNavigate();
  const { data, error: loadError } = useAsync(useCallback(() => api.simulatedCheckout(checkoutId), [checkoutId]));
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  async function pay(outcome) {
    setIsBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await api.paySimulatedCheckout(checkoutId, outcome);
      if (outcome === 'success') {
        navigate('/paiement/retour?statut=succes');
      } else if (outcome === 'abandon') {
        navigate('/paiement/retour?statut=annule');
      } else {
        setNotice('Paiement refusé par la banque simulée. Vous pouvez réessayer.');
        setIsBusy(false);
      }
    } catch (error) {
      setActionError(error);
      setIsBusy(false);
    }
  }

  return (
    <section className="form-page">
      <h1>Paiement simulé</h1>
      <p className="alert alert-info">Ce simulateur remplace la page de paiement. Aucun argent n'est en jeu.</p>
      <ErrorMessage error={loadError ?? actionError} />
      {notice && (
        <p role="status" className="alert alert-error">
          {notice}
        </p>
      )}
      {data && (
        <>
          <p>
            Formule <strong>{data.plan.name}</strong> : {formatPrice(data.plan.priceCents, data.plan.currency)} par mois.
          </p>
          <div className="button-row">
            <button type="button" className="button" disabled={isBusy} onClick={() => pay('success')}>
              Payer
            </button>
            <button type="button" className="button button-secondary" disabled={isBusy} onClick={() => pay('declined')}>
              Simuler un refus
            </button>
            <button type="button" className="button button-secondary" disabled={isBusy} onClick={() => pay('abandon')}>
              Abandonner
            </button>
          </div>
        </>
      )}
    </section>
  );
}
