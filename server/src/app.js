import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { adminRoutes } from './admin/routes.js';
import { authRoutes } from './auth/routes.js';
import { createSessionStore } from './auth/sessions.js';
import { createErrorHandler, notFoundHandler } from './http/errors.js';
import { originCheck } from './http/origin-check.js';
import { simulatorRoutes } from './payments/simulator-routes.js';
import { createSimulatorProvider } from './payments/simulator-provider.js';
import { createStripeProvider } from './payments/stripe-provider.js';
import { createWebhookService } from './payments/webhook-service.js';
import { webhookRoutes } from './payments/webhook-routes.js';
import { planRoutes } from './plans/routes.js';
import { subscriptionRoutes } from './subscriptions/routes.js';
import { createSubscriptionService } from './subscriptions/service.js';

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
const VITE_DEV_ORIGIN = 'http://localhost:5173';

function buildProvider(config, stripeClient) {
  return config.paymentProvider === 'stripe'
    ? createStripeProvider({ ...config.stripe, client: stripeClient })
    : createSimulatorProvider();
}

function serveClient(app) {
  if (!existsSync(CLIENT_DIST)) {
    return;
  }
  app.use(express.static(CLIENT_DIST));
  // Application à page unique : le routeur React lit l'adresse une fois index.html chargé.
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

/** Construit l'application sans écouter de port : les tests l'utilisent directement. */
export function createApp({ pool, config, logger = console, stripeClient }) {
  const app = express();
  const isSimulator = config.paymentProvider === 'simulator';
  const webhookSecret = isSimulator ? config.simulatorWebhookSecret : config.stripe.webhookSecret;

  const sessions = createSessionStore({ pool, config });
  const provider = buildProvider(config, stripeClient);
  const webhookService = createWebhookService({ pool, webhookSecret });
  const subscriptionService = createSubscriptionService({ pool, provider, config, logger });

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      // Hors HTTPS (poste local), ne pas demander au navigateur de tout passer en HTTPS.
      hsts: config.cookieSecure,
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: config.cookieSecure ? [] : null },
      },
    }),
  );

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', paymentProvider: provider.name });
  });

  // Avant express.json() et sans contrôle d'origine : c'est la signature qui l'authentifie.
  app.use('/api/webhooks', webhookRoutes({ webhookService }));

  const api = express.Router();
  const allowedOrigins = config.nodeEnv === 'production' ? [config.appBaseUrl] : [config.appBaseUrl, VITE_DEV_ORIGIN];
  api.use(originCheck(allowedOrigins));
  api.use(express.json({ limit: '32kb' }));
  api.use(cookieParser());
  api.use(sessions.loadUser());
  api.use('/auth', authRoutes({ pool, sessions, config }));
  api.use('/plans', planRoutes({ pool }));
  api.use('/subscriptions', subscriptionRoutes({ pool, subscriptionService }));
  api.use('/admin', adminRoutes({ pool, subscriptionService }));
  if (isSimulator) {
    api.use('/simulator', simulatorRoutes({ pool, webhookService, webhookSecret }));
  }
  api.use(notFoundHandler);
  app.use('/api', api);

  serveClient(app);
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
