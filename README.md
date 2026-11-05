# abonnements-web

[![CI](https://github.com/KorayAkyk/abonnements-web/actions/workflows/ci.yml/badge.svg)](https://github.com/KorayAkyk/abonnements-web/actions/workflows/ci.yml)

Application de gestion d'abonnements pour une salle de sport fictive, la « Salle Horizon » :
comptes, trois formules, souscription, résiliation, historique des paiements et espace
d'administration. Le paiement passe par Stripe en mode test, ou par un simulateur intégré qui
permet de tout faire tourner sans clé.

Stack : JavaScript, Node.js 22, Express, PostgreSQL, React, Vite. Toutes les données sont inventées.

**English summary.** A small subscription management app for a fictional gym: accounts, three
plans, subscribe, cancel, payment history and a simple admin area. Built with Node.js 22, Express,
PostgreSQL and React. Payments use Stripe in test mode only, or a built-in simulator that needs no
key. The webhook verifies signatures and processes each event once. Run it with `npm run demo`.
Licensed under MIT.

## Ce que fait l'application

- **Visiteur** : consulte les formules, crée un compte.
- **Membre** : souscrit, paie, consulte son historique, résilie à la fin de la période payée, se
  réabonne.
- **Administration** : indicateurs, liste filtrable des abonnements, derniers paiements, résiliation
  d'un abonnement. Avec le simulateur : renouvellement, refus de paiement et fin de période.

## Architecture

```text
 Navigateur : React + Vite
      |
      |  JSON, cookie de session HttpOnly
      v
 API REST Express
 (comptes, formules, abonnements, administration, simulateur)
      |                                     |
      | requêtes paramétrées                | createCheckout, expireCheckout, cancelAtPeriodEnd
      v                                     v
 PostgreSQL                          Prestataire de paiement :
      ^                              Stripe (mode test) ou simulateur
      |                                     |
      | une transaction par événement       | événement signé
      |                                     v
      +------------------------- POST /api/webhooks/payments
                                 (signature, puis traitement unique)
```

Une souscription suit toujours le même chemin :

1. L'API crée un abonnement `pending` et demande une page de paiement au prestataire.
2. Le membre paie sur cette page.
3. Le prestataire envoie un événement signé. Seul cet événement active l'abonnement : le retour du
   navigateur sur le site ne prouve rien.

## Choix techniques

| Choix | Pourquoi |
| --- | --- |
| Sessions en base, cookie `HttpOnly` et `SameSite=Lax`, `Secure` en production | Une session se ferme vraiment côté serveur. Seule l'empreinte SHA-256 du jeton est stockée. |
| Mots de passe hachés avec scrypt (`node:crypto`) | Algorithme adapté aux mots de passe, sans dépendance native à compiler. |
| Contrôle de l'en-tête `Origin` en plus de `SameSite` | Protection CSRF explicite sur les requêtes qui modifient des données. |
| Limitation des tentatives : par IP et compte à la connexion, par IP à l'inscription | Freine les essais de mots de passe sans permettre de bloquer tous les comptes. |
| Validation des entrées avec zod, requêtes SQL paramétrées | Rien ne vient du client sans contrôle, et aucune valeur n'est concaténée dans le SQL. |
| Migrations SQL versionnées, avec empreinte de chaque fichier | Le schéma se lit dans des fichiers SQL. Une migration déjà appliquée ne peut pas changer en silence. |
| Index unique partiel sur les abonnements vivants | La règle « un abonnement vivant par compte » tient même si deux requêtes arrivent ensemble. |
| Table `webhook_events` écrite dans la transaction du traitement | Un événement rejoué n'a aucun effet. Si le traitement échoue, tout est annulé et le renvoi aboutit. |
| État de l'abonnement dans un module pur (`subscriptions/state.js`) | Les transitions se testent sans base. Un événement en retard ne ranime pas un abonnement résilié. |
| Simulateur qui signe des événements au format Stripe | Il passe par le même service de webhook que Stripe : la démonstration et les tests exercent le vrai code. |
| Refus au démarrage d'une clé autre que `sk_test_` ou `rk_test_` | Ce projet ne doit jamais toucher de vrai argent. Le simulateur est aussi refusé si `NODE_ENV=production`. |
| JavaScript sans TypeScript, fichiers courts | Le code se lit directement, sans étape de compilation côté serveur. |

## Lancer le projet

Il faut Node.js 22 et Docker. Une seule commande installe les dépendances si besoin, démarre la
base, applique les migrations, crée les données de démonstration, construit l'interface et lance
le serveur :

```bash
npm run demo
```

L'application répond sur <http://localhost:3000>. Comptes de démonstration, mot de passe
`demonstration-2026` :

- membre : `membre@salle-horizon.test`
- administration : `admin@salle-horizon.test`

Sans Docker, il suffit de fournir une base PostgreSQL : `DATABASE_URL=postgres://... npm run demo`.

Pour développer, `npm run dev` lance l'API avec rechargement automatique et l'interface Vite sur
<http://localhost:5173>.

## Tester

Les tests d'API et de métier ont besoin d'une base PostgreSQL. Chaque fichier de test travaille dans
son propre schéma, créé puis supprimé. Sans `DATABASE_URL`, ils visent la base de docker compose.

```bash
npm run lint       # ESLint
npm test           # API et métier (Vitest, Supertest)
npm run build      # interface
npm run test:e2e   # parcours complet dans Chromium, en mode simulé (Playwright)
```

Playwright a besoin de l'interface construite et du navigateur : `npx playwright install chromium`.

Ce qui est couvert : droits d'accès, signature invalide ou trop ancienne, corps modifié, événement
rejoué ou livré plusieurs fois en même temps, annulation d'un traitement en échec, résiliation,
limitation des tentatives, cookies, parcours complet dans le navigateur.

**Aucun test n'appelle Stripe.** Le mode Stripe est testé avec un faux client, et un garde fait
échouer toute connexion vers un hôte autre que la base et l'application
(`server/test/setup-network-guard.js`).

La CI GitHub Actions lance tout cela sur `ubuntu-latest` avec un service PostgreSQL. Un second job
exécute `npm run demo` depuis un dépôt vierge et interroge l'application démarrée.

## Brancher le mode test de Stripe

Le simulateur suffit pour tout essayer. Pour utiliser Stripe, en mode test uniquement :

1. Dans le tableau de bord Stripe, en mode test, créer trois prix mensuels récurrents.
2. Copier `.env.example` vers `.env` et remplir :
   - `PAYMENT_PROVIDER=stripe`
   - `STRIPE_SECRET_KEY` : la clé secrète du mode test
   - `STRIPE_PRICE_ESSENTIEL`, `STRIPE_PRICE_CONFORT`, `STRIPE_PRICE_INTEGRAL` : les trois prix
3. Transférer les événements avec la CLI Stripe, puis copier le secret affiché dans
   `STRIPE_WEBHOOK_SECRET` :

   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/payments \
     --events checkout.session.completed,checkout.session.expired,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted
   ```

4. Lancer `npm run demo` et payer avec une carte de test de Stripe.

Les clés restent dans `.env`, ignoré par Git.

## Limites connues

- **Le branchement réel au mode test de Stripe n'a jamais été exécuté.** Le code d'appel à Stripe est
  vérifié avec un faux client, et les événements sont construits d'après les types du SDK Stripe, pas
  capturés depuis Stripe. Les étapes ci-dessus restent donc à valider.
- La limitation des tentatives garde ses compteurs en mémoire : elle vaut pour une seule instance du
  serveur.
- Il n'y a ni vérification d'adresse e-mail, ni mot de passe oublié, ni changement de formule.
- Rien n'est déployé : le projet tourne en local et en CI.

## API

La documentation OpenAPI est dans [`docs/openapi/openapi.yaml`](docs/openapi/openapi.yaml). Un test
valide ce document et vérifie que chaque opération décrite existe dans l'application.

## Structure

```text
client/   interface React : pages, composants, appels à l'API
server/   API Express
  src/auth, plans, subscriptions, admin   domaines métier
  src/payments                            webhook, prestataire Stripe, simulateur
  src/db                                  connexion, migrations SQL, données de démonstration
  test/                                   tests unitaires et tests d'API
e2e/      parcours Playwright
docs/     documentation OpenAPI
scripts/  commandes de démarrage
```

## Licence

MIT, voir [LICENSE](LICENSE). Copyright Koray Akyurek.
