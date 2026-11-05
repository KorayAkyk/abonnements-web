import { HttpError } from '../http/errors.js';
import { findPlanByCode } from '../plans/repository.js';
import * as repository from './repository.js';
import { isCancelable } from './state.js';

const UNIQUE_VIOLATION = '23505';

export function createSubscriptionService({ pool, provider, config, logger }) {
  async function callProvider(action) {
    try {
      return await action();
    } catch (error) {
      logger.error(error);
      throw new HttpError(502, 'prestataire_indisponible', 'Le service de paiement ne repond pas. Reessayez plus tard.');
    }
  }

  /** Un abonnement cree avec un autre prestataire (donnees de demonstration) reste local. */
  function isManagedByProvider(subscription) {
    return subscription.provider === provider.name;
  }

  async function replacePendingCheckout(pending) {
    // Une session de paiement abandonnee ne doit pas rester payable en parallele de la nouvelle.
    if (pending.providerCheckoutId && isManagedByProvider(pending)) {
      await callProvider(() => provider.expireCheckout(pending.providerCheckoutId));
    }
    await repository.markExpired(pool, pending.id);
  }

  async function reservePending(userId, planId) {
    try {
      return await repository.insertPending(pool, { userId, planId, provider: provider.name });
    } catch (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw new HttpError(409, 'abonnement_existant', 'Une souscription est deja en cours pour ce compte.');
      }
      throw error;
    }
  }

  return {
    /**
     * Reserve l'abonnement en base, puis demande une page de paiement au prestataire.
     * L'abonnement ne devient actif qu'a la reception de l'evenement signe, jamais ici.
     */
    async startCheckout(user, planCode) {
      const plan = await findPlanByCode(pool, planCode);
      if (!plan) {
        throw new HttpError(404, 'formule_introuvable', "Cette formule n'existe pas.");
      }
      const live = await repository.findLive(pool, user.id);
      if (live && live.status !== 'pending') {
        throw new HttpError(409, 'abonnement_existant', 'Ce compte a deja un abonnement en cours.');
      }
      if (live) {
        await replacePendingCheckout(live);
      }

      const subscriptionId = await reservePending(user.id, plan.id);
      try {
        const checkout = await callProvider(() =>
          provider.createCheckout({
            subscriptionId,
            customerEmail: user.email,
            planCode: plan.code,
            successUrl: `${config.appBaseUrl}/paiement/retour?statut=succes`,
            cancelUrl: `${config.appBaseUrl}/paiement/retour?statut=annule`,
          }),
        );
        await repository.setCheckoutId(pool, subscriptionId, checkout.checkoutId);
        return { subscriptionId, checkoutUrl: checkout.url };
      } catch (error) {
        await repository.markExpired(pool, subscriptionId);
        throw error;
      }
    },

    /** Resiliation a la fin de la periode payee. Refaire la demande ne change rien. */
    async cancelAtPeriodEnd(subscription) {
      if (!isCancelable(subscription.status)) {
        throw new HttpError(409, 'abonnement_non_resiliable', 'Cet abonnement ne peut pas etre resilie.');
      }
      if (subscription.cancelAtPeriodEnd) {
        return repository.findById(pool, subscription.id);
      }
      if (isManagedByProvider(subscription)) {
        if (!subscription.providerSubscriptionId) {
          throw new HttpError(409, 'abonnement_en_cours_de_liaison', 'Le paiement est encore en cours de traitement.');
        }
        await callProvider(() => provider.cancelAtPeriodEnd(subscription.providerSubscriptionId));
      }
      await repository.markCancelAtPeriodEnd(pool, subscription.id);
      return repository.findById(pool, subscription.id);
    },
  };
}
