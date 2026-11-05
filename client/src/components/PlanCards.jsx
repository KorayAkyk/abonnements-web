import { formatPrice } from '../format.js';

/** Affiche les trois formules. Sans onChoose, la liste reste informative. */
export default function PlanCards({ plans, actionLabel, onChoose, busy = false, renderFallback }) {
  return (
    <ul className="plan-grid">
      {plans.map((plan) => (
        <li key={plan.code} className="plan-card" data-plan={plan.code}>
          <h3>{plan.name}</h3>
          <p className="plan-price">
            {formatPrice(plan.priceCents, plan.currency)} <span>par mois</span>
          </p>
          <p>{plan.description}</p>
          {onChoose ? (
            <button
              type="button"
              className="button"
              disabled={busy}
              aria-label={`${actionLabel} ${plan.name}`}
              onClick={() => onChoose(plan.code)}
            >
              {actionLabel}
            </button>
          ) : (
            renderFallback?.(plan)
          )}
        </li>
      ))}
    </ul>
  );
}
