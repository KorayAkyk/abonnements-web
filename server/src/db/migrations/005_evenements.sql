-- Journal des événements reçus : la clé primaire garantit qu'un événement n'est traite qu'une fois.
CREATE TABLE webhook_events (
  event_id    text PRIMARY KEY,
  type        text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
