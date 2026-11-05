import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

const POLL_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 15;

/**
 * Le retour de paiement ne prouve rien : seul le webhook signe active l'abonnement.
 * La page attend donc que le serveur confirme, car l'evenement peut arriver un peu apres.
 */
export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const isSuccess = params.get('statut') === 'succes';
  const [state, setState] = useState(isSuccess ? 'waiting' : 'canceled');

  useEffect(() => {
    if (!isSuccess) {
      return undefined;
    }
    let attempts = 0;
    let timer;
    let isCurrent = true;

    async function check() {
      attempts += 1;
      const { subscription } = await api.currentSubscription().catch(() => ({ subscription: null }));
      if (!isCurrent) {
        return;
      }
      if (subscription?.status === 'active') {
        setState('confirmed');
      } else if (attempts >= MAX_ATTEMPTS) {
        setState('late');
      } else {
        timer = setTimeout(check, POLL_INTERVAL_MS);
      }
    }
    check();

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [isSuccess]);

  return (
    <section className="form-page">
      <h1>Retour de paiement</h1>
      {state === 'waiting' && <p role="status">Confirmation du paiement en cours...</p>}
      {state === 'confirmed' && (
        <p role="status" className="alert alert-success">
          Paiement confirme, votre abonnement est actif.
        </p>
      )}
      {state === 'late' && (
        <p role="status" className="alert alert-info">
          La confirmation prend plus de temps que prevu. Votre espace se mettra a jour des sa reception.
        </p>
      )}
      {state === 'canceled' && (
        <p role="status" className="alert alert-info">
          Paiement annule. Vous n'avez pas ete debite.
        </p>
      )}
      <Link className="button" to="/espace">
        Aller a mon espace
      </Link>
    </section>
  );
}
