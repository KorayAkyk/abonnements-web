import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import PlanCards from '../components/PlanCards.jsx';
import { useAsync } from '../useAsync.js';

export default function HomePage() {
  const { user } = useAuth();
  const { data, error } = useAsync(useCallback(() => api.plans(), []));

  return (
    <>
      <section className="intro">
        <h1>Trois formules, sans engagement</h1>
        <p>Choisissez votre formule, payez en ligne et resiliez quand vous voulez depuis votre espace.</p>
      </section>
      <ErrorMessage error={error} />
      {data && (
        <PlanCards
          plans={data.plans}
          renderFallback={() => (
            <Link className="button" to={user ? '/espace' : '/inscription'}>
              {user ? 'Voir mon espace' : 'Commencer'}
            </Link>
          )}
        />
      )}
    </>
  );
}
