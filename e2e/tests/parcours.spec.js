import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

const ADMIN = { email: 'admin@salle-horizon.test', password: 'demonstration-2026' };
const PASSWORD = 'mot-de-passe-parcours';

function newMember() {
  return { fullName: 'Parcours Essai', email: `parcours.${randomBytes(4).toString('hex')}@exemple.test` };
}

async function register(page, member) {
  await page.goto('/inscription');
  await page.getByLabel('Nom complet').fill(member.fullName);
  await page.getByLabel('Adresse e-mail').fill(member.email);
  await page.getByLabel(/Mot de passe/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: `Bonjour ${member.fullName}` })).toBeVisible();
}

async function login(page, email, password) {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

async function logout(page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
}

async function subscribeAndPay(page, planName) {
  await page.getByRole('button', { name: `Souscrire ${planName}` }).click();
  await expect(page.getByRole('heading', { name: 'Paiement simulé' })).toBeVisible();
  await page.getByRole('button', { name: 'Payer', exact: true }).click();
  await expect(page.getByText('Paiement confirmé, votre abonnement est actif.')).toBeVisible();
  await page.getByRole('link', { name: 'Aller à mon espace' }).click();
}

test('la page publique présente les trois formules', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trois formules, sans engagement' })).toBeVisible();
  await expect(page.locator('.plan-card')).toHaveCount(3);
  await expect(page.locator('[data-plan=confort]')).toContainText('45,00');
});

test('parcours complet : inscription, refus, paiement, résiliation, fin de période, réabonnement', async ({
  page,
  browser,
}) => {
  const member = newMember();

  await test.step('inscription', async () => {
    await register(page, member);
    await expect(page.getByText("Vous n'avez pas encore d'abonnement.")).toBeVisible();
    await expect(page.getByText('Aucun paiement pour le moment.')).toBeVisible();
  });

  await test.step("un paiement refusé ne donne pas d'abonnement actif", async () => {
    await page.getByRole('button', { name: 'Souscrire Confort' }).click();
    await page.getByRole('button', { name: 'Simuler un refus' }).click();
    await expect(page.getByText('Paiement refusé par la banque simulée.')).toBeVisible();
  });

  await test.step("le paiement réussi active l'abonnement et remplit l'historique", async () => {
    await page.getByRole('button', { name: 'Payer', exact: true }).click();
    await expect(page.getByText('Paiement confirmé, votre abonnement est actif.')).toBeVisible();
    await page.getByRole('link', { name: 'Aller à mon espace' }).click();

    const summary = page.getByTestId('abonnement');
    await expect(summary).toContainText('Confort');
    await expect(summary).toContainText('Actif');
    const history = page.getByRole('table');
    await expect(history.getByRole('row')).toHaveCount(3);
    await expect(history).toContainText('45,00');
    await expect(history).toContainText('Payé');
    await expect(history).toContainText('Refusé');
  });

  await test.step("la résiliation est programmée, l'accès reste ouvert", async () => {
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Résilier mon abonnement' }).click();
    const summary = page.getByTestId('abonnement');
    await expect(summary).toContainText('Résiliation programmée');
    await expect(summary).toContainText('Actif');
    await expect(page.getByRole('button', { name: 'Résilier mon abonnement' })).toHaveCount(0);
  });

  await test.step("le membre n'a pas accès à l'administration", async () => {
    await page.goto('/admin');
    await expect(page.getByRole('alert')).toContainText("réservée à l'administration");
    const response = await page.request.get('/api/admin/stats');
    expect(response.status()).toBe(403);
  });

  await test.step("l'administration voit le membre et termine la période", async () => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, ADMIN.email, ADMIN.password);
    await expect(adminPage.getByRole('heading', { name: 'Administration' })).toBeVisible();
    await expect(adminPage.getByText('Abonnements actifs')).toBeVisible();

    const row = adminPage.locator(`tr[data-email="${member.email}"]`);
    await expect(row).toContainText('résiliation programmée');
    await row.getByRole('button', { name: 'Terminer la période' }).click();
    await expect(row).toContainText('Résilié');
    await adminContext.close();
  });

  await test.step('le membre voit la résiliation et peut se réabonner', async () => {
    await page.goto('/espace');
    await expect(page.getByTestId('abonnement')).toContainText('Résilié');
    await subscribeAndPay(page, 'Intégral');
    await expect(page.getByTestId('abonnement')).toContainText('Intégral');
    await expect(page.getByTestId('abonnement')).toContainText('Actif');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(4);
  });

  await test.step("après déconnexion, l'espace n'est plus accessible", async () => {
    await logout(page);
    await page.goto('/espace');
    await expect(page).toHaveURL(/\/connexion$/);
  });
});

test('la session survit à un rechargement et la connexion refuse un mauvais mot de passe', async ({ page }) => {
  const member = newMember();
  await register(page, member);
  await page.reload();
  await expect(page.getByRole('heading', { name: `Bonjour ${member.fullName}` })).toBeVisible();
  await logout(page);

  await login(page, member.email, 'pas-le-bon-mot-de-passe');
  await expect(page.getByRole('alert')).toContainText('Adresse ou mot de passe incorrect.');

  await login(page, member.email, PASSWORD);
  await expect(page.getByRole('heading', { name: `Bonjour ${member.fullName}` })).toBeVisible();
});

test('abandonner le paiement laisse le compte sans abonnement', async ({ page }) => {
  await register(page, newMember());
  await page.getByRole('button', { name: 'Souscrire Essentiel' }).click();
  await page.getByRole('button', { name: 'Abandonner' }).click();
  await expect(page.getByText("Paiement annulé. Vous n'avez pas été débité.")).toBeVisible();
  await page.getByRole('link', { name: 'Aller à mon espace' }).click();
  await expect(page.getByText("Vous n'avez pas encore d'abonnement.")).toBeVisible();
});

test('les données de démonstration sont visibles par le compte de démonstration', async ({ page }) => {
  await login(page, 'membre@salle-horizon.test', ADMIN.password);
  await expect(page.getByTestId('abonnement')).toContainText('Confort');
  await expect(page.getByRole('table').getByRole('row')).not.toHaveCount(1);
});

test("l'administration filtre par statut et simule un refus de paiement", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();

  await page.getByLabel('Filtrer par statut').selectOption('canceled');
  const rows = page.getByRole('table', { name: /Abonnements/ }).locator('tbody tr');
  await expect(rows.first()).toContainText('Résilié');

  await page.getByLabel('Filtrer par statut').selectOption('');
  const member = page.locator('tr[data-email="tom.modele@salle-horizon.test"]');
  await member.getByRole('button', { name: 'Refuser un paiement' }).click();
  await expect(member).toContainText('Paiement en retard');
  await member.getByRole('button', { name: 'Renouveler' }).click();
  await expect(member).toContainText('Actif');
});
