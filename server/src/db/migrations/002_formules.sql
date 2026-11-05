CREATE TABLE plans (
  id          serial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  currency    char(3) NOT NULL DEFAULT 'eur',
  position    integer NOT NULL
);

INSERT INTO plans (code, name, description, price_cents, position) VALUES
  ('essentiel', 'Essentiel', 'Accès à la salle de musculation, du lundi au vendredi.', 2900, 1),
  ('confort', 'Confort', 'Accès illimité à la salle et aux cours collectifs.', 4500, 2),
  ('integral', 'Intégral', 'Accès illimité, cours collectifs et un suivi mensuel avec un coach.', 6900, 3);
