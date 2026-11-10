import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:3011' },
    data: {
      name: 'Pessoa teste',
      email: `roleta-${Date.now()}@example.test`,
      password: 'senha-local-de-teste-123',
    },
  });
  expect(response.ok()).toBeTruthy();
});
test('roleta registra vários animais com débito total', async ({ page }) => {
  await page.goto('/roleta');
  await page
    .locator('#roulette-animal-picker')
    .getByRole('button', { name: 'Coelho 37 · 38 · 39 · 40 Selecionar' })
    .click();
  await expect(page.getByText('2 animal(is) · 10 pontos por animal')).toBeVisible();
  await page.getByRole('button', { name: 'Participar da rodada' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '2 animal(is), 20 pontos' }),
  ).toBeVisible();
  const tickets = await (await page.request.get('/api/tickets')).json();
  expect(tickets.map((t: { selection: string[] }) => t.selection[0]).sort()).toEqual(['10', '16']);
  expect((await (await page.request.get('/api/bootstrap')).json()).user.points).toBe(980);
});
test('o atalho antigo de animais abre a Roleta Vegas com seleção múltipla', async ({ page }) => {
  await page.goto('/animais');
  await expect(page).toHaveURL(/\/roleta$/);
  await page
    .locator('#roulette-animal-picker')
    .getByRole('button', { name: 'Coelho 37 · 38 · 39 · 40 Selecionar' })
    .click();
  await expect(page.getByText('2 animal(is) · 10 pontos por animal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Participar da rodada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'APOSTAR AGORA' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
