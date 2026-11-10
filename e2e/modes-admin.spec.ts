import { test, expect } from '@playwright/test';
test('administração de modalidades persiste e preserva extrações existentes', async ({ page }) => {
  const origin = 'http://127.0.0.1:3011';
  const user = await page.request.post('/api/auth/register', {
    headers: { origin },
    data: {
      name: 'Pessoa teste',
      email: `modalidades-${Date.now()}@example.test`,
      password: 'senha-local-de-teste-123',
    },
  });
  expect(user.ok()).toBeTruthy();
  expect(
    (
      await page.request.post('/api/admin/modes', {
        headers: { origin },
        data: { mode: 'dezena', enabled: false, positions: 3, passeSecond: 2 },
      })
    ).status(),
  ).toBe(403);
  await page.request.post('/api/auth/login', {
    headers: { origin },
    data: { email: 'e2e-admin@example.test', password: 'e2e-local-only-password-123' },
  });
  await page.goto('/admin');
  await page
    .locator('.admin-tabs')
    .getByRole('button', { name: 'Modalidades', exact: true })
    .click();
  const card = page
    .locator('.admin-mode-list article')
    .filter({ has: page.getByRole('heading', { name: 'Dezena', exact: true }) });
  await card.getByRole('checkbox').uncheck();
  await card.getByRole('spinbutton').fill('3');
  await card.getByRole('button', { name: 'Salvar modalidade' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Dezena: configuração salva' }),
  ).toBeVisible();
  const config = await (await page.request.get('/api/admin/modes')).json();
  expect(config.dezena).toEqual({ enabled: false, positions: 3, passeSecond: 2 });
  const scheduled = await (
    await page.request.post('/api/admin/rounds', {
      headers: { origin },
      data: {
        action: 'schedule',
        type: 'TRADITIONAL',
        opensAt: new Date(Date.now() + 3600000).toISOString(),
        seconds: 60,
      },
    })
  ).json();
  const before = await (await page.request.get('/api/bootstrap')).json();
  expect(
    before.rounds.find((r: { id: string }) => r.id === scheduled.id).rules.modes.dezena.enabled,
  ).toBe(false);
  await card.getByRole('checkbox').check();
  await card.getByRole('button', { name: 'Salvar modalidade' }).click();
  await expect
    .poll(async () => (await (await page.request.get('/api/admin/modes')).json()).dezena.enabled)
    .toBe(true);
  const after = await (await page.request.get('/api/bootstrap')).json();
  expect(
    after.rounds.find((r: { id: string }) => r.id === scheduled.id).rules.modes.dezena.enabled,
  ).toBe(false);
  expect(
    (
      await page.request.post('/api/admin/rounds', {
        headers: { origin },
        data: { action: 'cancel', id: scheduled.id },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post('/api/admin/modes', {
        headers: { origin },
        data: { mode: 'dezena', enabled: true, positions: 5, passeSecond: 2 },
      })
    ).ok(),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
