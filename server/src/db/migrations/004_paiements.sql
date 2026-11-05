CREATE TABLE payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     uuid NOT NULL REFERENCES subscriptions (id),
  amount_cents        integer NOT NULL CHECK (amount_cents >= 0),
  currency            char(3) NOT NULL,
  status              text NOT NULL CHECK (status IN ('paid', 'failed')),
  provider_invoice_id text NOT NULL,
  occurred_at         timestamptz NOT NULL,
  -- Une facture peut echouer puis etre payee, mais chaque issue n'est comptee qu'une fois.
  UNIQUE (provider_invoice_id, status)
);

CREATE INDEX payments_subscription_id_idx ON payments (subscription_id, occurred_at DESC);
