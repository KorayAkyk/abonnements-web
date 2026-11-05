import { randomBytes } from 'node:crypto';

/**
 * Remplace Stripe sans cle ni reseau : la "page de paiement" est une page de l'application,
 * et les evenements passent par le meme service de webhook que les vrais (voir simulator-routes.js).
 */
export function createSimulatorProvider() {
  return {
    name: 'simulator',

    async createCheckout() {
      const checkoutId = `sim_cs_${randomBytes(12).toString('hex')}`;
      return { checkoutId, url: `/simulateur/${checkoutId}` };
    },

    async expireCheckout() {},

    async cancelAtPeriodEnd() {},
  };
}
