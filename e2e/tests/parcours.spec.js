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
  await page.getByRole('button', { name: 'Creer mon compte' }).click();
  await expect(page.getByRole('heading', { name: `Bonjour ${member.fullName}` })).toBeVisible();
}

async function login(page, email, password) {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

async function logout(page) {
  await page.getByRole('button', { name: 'Se deconnecter' }).click();
  await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
}

async function subscribeAndPay(page, planName) {
  await page.getByRole('button', { name: `Souscrire ${planName}` }).click();
  await expect(page.getByRole('heading', { name: 'Paiement simule' })).toBeVisible();
  await page.getByRole('button', { name: 'Payer', exact: true }).click();
  await expect(page.getByText('Paiement confirme, votre abonnement est actif.')).toBeVisible();
  await page.getByRole('link', { name: 'Aller a mon espace' }).click();
}

test('la page publique presente les trois formules', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trois formules, sans engagement' })).toBeVisible();
  await expect(page.locator('.plan-card')).toHaveCount(3);
  await expect(page.locator('[data-plan=confort]')).toContainText('45,00');
});

test('parcours complet : inscription, refus, paiement, resiliation, fin de periode, reabonnement', async ({
  page,
  browser,
}) => {
  const member = newMember();

  await test.step('inscription', async () => {
    await register(page, member);
    await expect(page.getByText("Vous n'avez pas encore d'abonnement.")).toBeVisible();
    await expect(page.getByText('Aucun paiement pour le moment.')).toBeVisible();
  });

  await test.step('un paiement refuse ne donne pas d abonnement actif', async () => {
    await page.getByRole('button', { name: 'Souscrire Confort' }).click();
    await page.getByRole('button', { name: 'Simuler un refus' }).click();
    await expect(page.getByText('Paiement refuse par la banque simulee.')).toBeVisible();
  });

  await test.step('le paiement reussi active l abonnement et remplit l historique', async () => {
    await page.getByRole('button', { name: 'Payer', exact: true }).click();
    await expect(page.getByText('Paiement confirme, votre abonnement est actif.')).toBeVisible();
    await page.getByRole('link', { name: 'Aller a mon espace' }).click();

    const summary = page.getByTestId('abonnement');
    await expect(summary).toContainText('Confort');
    await expect(summary).toContainText('Actif');
    const history = page.getByRole('table');
    await expect(history.getByRole('row')).toHaveCount(3);
    await expect(history).toContainText('45,00');
    await expect(history).toContainText('Paye');
    await expect(history).toContainText('Refuse');
  });

  await test.step('la resiliation est programmee, l acces reste ouvert', async () => {
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Resilier mon abonnement' }).click();
    const summary = page.getByTestId('abonnement');
    await expect(summary).toContainText('Resiliation programmee');
    await expect(summary).toContainText('Actif');
    await expect(page.getByRole('button', { name: 'Resilier mon abonnement' })).toHaveCount(0);
  });

  await test.step('le membre n a pas acces a l administration', async () => {
    await page.goto('/admin');
    await expect(page.getByRole('alert')).toContainText("reservee a l'administration");
    const response = await page.request.get('/api/admin/stats');
    expect(response.status()).toBe(403);
  });

  await test.step('l administration voit le membre et termine la periode', async () => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, ADMIN.email, ADMIN.password);
    await expect(adminPage.getByRole('heading', { name: 'Administration' })).toBeVisible();
    await expect(adminPage.getByText('Abonnements actifs')).toBeVisible();

    const row = adminPage.locator(`tr[data-email="${member.email}"]`);
    await expect(row).toContainText('resiliation programmee');
    await row.getByRole('button', { name: 'Terminer la periode' }).click();
    await expect(row).toContainText('Resilie');
    await adminContext.close();
  });

  await test.step('le membre voit la resiliation et peut se reabonner', async () => {
    await page.goto('/espace');
    await expect(page.getByTestId('abonnement')).toContainText('Resilie');
    await subscribeAndPay(page, 'Integral');
    await expect(page.getByTestId('abonnement')).toContainText('Integral');
    await expect(page.getByTestId('abonnement')).toContainText('Actif');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(4);
  });

  await test.step('apres deconnexion, l espace n est plus accessible', async () => {
    await logout(page);
    await page.goto('/espace');
    await expect(page).toHaveURL(/\/connexion$/);
  });
});

test('la session survit a un rechargement et la connexion refuse un mauvais mot de passe', async ({ page }) => {
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
  await expect(page.getByText("Paiement annule. Vous n'avez pas ete debite.")).toBeVisible();
  await page.getByRole('link', { name: 'Aller a mon espace' }).click();
  await expect(page.getByText("Vous n'avez pas encore d'abonnement.")).toBeVisible();
});

test('les donnees de demonstration sont visibles par le compte de demonstration', async ({ page }) => {
  await login(page, 'membre@salle-horizon.test', ADMIN.password);
  await expect(page.getByTestId('abonnement')).toContainText('Confort');
  await expect(page.getByRole('table').getByRole('row')).not.toHaveCount(1);
});

test('l administration filtre par statut et simule un refus de paiement', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();

  await page.getByLabel('Filtrer par statut').selectOption('canceled');
  const rows = page.getByRole('table', { name: /Abonnements/ }).locator('tbody tr');
  await expect(rows.first()).toContainText('Resilie');

  await page.getByLabel('Filtrer par statut').selectOption('');
  const member = page.locator('tr[data-email="tom.modele@salle-horizon.test"]');
  await member.getByRole('button', { name: 'Refuser un paiement' }).click();
  await expect(member).toContainText('Paiement en retard');
  await member.getByRole('button', { name: 'Renouveler' }).click();
  await expect(member).toContainText('Actif');
});
