CREATE TABLE subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users (id),
  plan_id                  integer NOT NULL REFERENCES plans (id),
  status                   text NOT NULL
    CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'expired')),
  provider                 text NOT NULL CHECK (provider IN ('simulator', 'stripe')),
  provider_checkout_id     text UNIQUE,
  provider_subscription_id text UNIQUE,
  provider_customer_id     text,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  canceled_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Règle métier portée par la base : un compte a au plus un abonnement vivant.
CREATE UNIQUE INDEX subscriptions_one_live_per_user
  ON subscriptions (user_id)
  WHERE status IN ('pending', 'active', 'past_due');

CREATE INDEX subscriptions_status_idx ON subscriptions (status);
