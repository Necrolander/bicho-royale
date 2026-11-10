import { test, expect } from '@playwright/test';

test('a Roleta Vegas substitui o acesso tradicional de apostas', async ({ page }) => {
  const response = await page.request.post('/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:3011' },
    data: {
      name: 'Pessoa teste',
      email: `roleta-${Date.now()}@example.test`,
      password: 'senha-local-de-teste-123',
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto('/apostar');
  await expect(page).toHaveURL(/\/roleta$/);
  await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'APOSTAR AGORA' })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/roulette-only-nav.png', fullPage: true });

  for (const path of [
    '/apostar?tipo=numero',
    '/modalidades',
    '/modalidades/grupo',
    '/extracoes',
    '/conferidor',
    '/animais',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/roleta$/);
    await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
  }
});
