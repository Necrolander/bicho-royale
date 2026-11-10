import { test, expect } from '@playwright/test';
import { commitment, draw } from '../lib/fairness';
import { modes } from '../lib/game';
import { modePath } from '../lib/navigation';
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

test('rotas tradicionais encaminham para a Roleta Vegas', async ({ page }) => {
  for (const mode of modes) {
    await page.goto(modePath(mode.id));
    await expect(page).toHaveURL(/\/roleta$/);
    await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
  }
});
test('cabeçalho horizontal navega entre Início, Roletinha e Raspadinhas', async ({ page }) => {
  await page.goto('/roleta');
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav.getByRole('button', { name: 'Início' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Roletinha' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Raspadinhas' })).toBeVisible();
  await page.getByRole('button', { name: 'Raspadinhas' }).click();
  await expect(page).toHaveURL(/\/raspadinha$/);
  await expect(page.getByRole('heading', { name: 'Raspadinha Vegas' })).toBeVisible();
  await nav.getByRole('button', { name: 'Roletinha' }).click();
  await expect(page).toHaveURL(/\/roleta$/);
  await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
});
test('raspadinha tem página própria, cobra créditos fictícios e revela o resultado ao raspar', async ({
  page,
}) => {
  await page.goto('/raspadinha');
  await expect(page).toHaveURL(/\/raspadinha$/);
  await expect(page.getByRole('heading', { name: 'Raspadinha Vegas' })).toBeVisible();
  await expect(page.locator('.prize-ticker-card:not([aria-hidden="true"])')).toHaveCount(24);
  await expect(page.locator('.prize-ticker-card img').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ver raspadinha' }).first().click();
  await expect(page.getByRole('heading', { name: 'Ouro Vegas' })).toBeVisible();
  await expect(page.locator('.scratch-grid-nine').first()).toBeVisible();
  await page.getByRole('button', { name: /Comprar por \d+ créditos/ }).click();
  await expect(page.getByRole('heading', { name: 'Ouro Vegas' }).last()).toBeVisible();
  const prizePhotos = page.locator('.scratch-match-cell img[src*="vegas-prize-"]');
  await expect(prizePhotos).toHaveCount(9);
  await expect(prizePhotos.first()).toHaveJSProperty('naturalWidth', 320);
  const coveredPrizes = await page.locator('.scratch-match-cell').allTextContents();
  expect(coveredPrizes).toHaveLength(9);
  expect(coveredPrizes.join(' ')).not.toContain('BICHOS VEGAS');
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
  });
  await page
    .locator('.scratch-canvas')
    .evaluate((canvas) => canvas.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const scratchArea = await page.locator('.scratch-canvas').boundingBox();
  expect(scratchArea).not.toBeNull();
  for (let row = 0; row < 16; row++) {
    const y = scratchArea!.y + 6 + (row * (scratchArea!.height - 12)) / 15;
    await page.mouse.move(scratchArea!.x + 5, y);
    await page.mouse.down();
    for (let step = 1; step <= 18; step++) {
      await page.mouse.move(scratchArea!.x + (step * (scratchArea!.width - 10)) / 18, y);
    }
    await page.mouse.up();
  }
  await expect(page.locator('.scratch-confirm')).toContainText('Resultado:');
  const data = await (await page.request.get('/api/bootstrap')).json();
  expect(data.scratchCards).toHaveLength(1);
  await expect(page.locator('.prize-ticker')).toBeVisible();
  await expect(page.locator('.prize-ticker')).toContainText('créditos virtuais');
  expect(data.recentWins.every((item: Record<string, unknown>) => !('name' in item))).toBeTruthy();
  expect(data.user.points).toBe(
    1000 - data.scratchCards[0].price_points + data.scratchCards[0].prize_points,
  );
});
test('depósitos abrem em uma página própria e informam o status do Pix', async ({ page }) => {
  await page.goto('/depositar');
  await expect(page).toHaveURL(/\/depositar$/);
  await expect(page.getByRole('heading', { name: 'Depósitos' })).toBeVisible();
  await expect(page.getByText(/Depósitos ainda não estão disponíveis/)).toBeVisible();
});
test('jornada completa, persistência, permissões e publicação', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
  await page.goto('/roleta');
  await expect(page.getByRole('button', { name: 'Participar da rodada' })).toBeEnabled();
  const denied = await page.request.get('/api/admin');
  expect(denied.status()).toBe(403);
  const bootstrap = await page.request.get('/api/bootstrap');
  const data = await bootstrap.json();
  expect(data.animals).toHaveLength(25);
  const round = data.rounds.find(
    (r: { type: string; state: string }) => r.type === 'ROULETTE' && r.state === 'OPEN',
  );
  expect(round.seed).toBeUndefined();
  await page.getByRole('button', { name: 'Participar da rodada' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Comprovante' })).toBeVisible();
  await page.goto('/meus-bilhetes');
  await expect(
    page.getByRole('heading', { name: 'Meus Bilhetes', exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'AGUARDANDO', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('cell', { name: 'AGUARDANDO', exact: true })).toBeVisible();
  const receipt = (await (await page.request.get('/api/bootstrap')).json()).entries[0];
  const origin = 'http://127.0.0.1:3011';
  const wrongOrigin = await page.request.post('/api/entries', {
    headers: { origin: 'https://evil.example' },
    data: {},
  });
  expect(wrongOrigin.status()).toBe(403);
  const admin = await request.post('/api/auth/login', {
    headers: { origin },
    data: { email: 'e2e-admin@example.test', password: 'e2e-local-only-password-123' },
  });
  expect(admin.ok()).toBeTruthy();
  const publish = await request.post('/api/admin/rounds', {
    headers: { origin },
    data: { action: 'lock', id: round.id },
  });
  expect(publish.ok()).toBeTruthy();
  const proof = await (await page.request.get(`/api/verify/${round.id}`)).json();
  expect(proof.valid).toBe(true);
  expect(proof.seed).toHaveLength(64);
  expect(commitment(round.id, proof.seed)).toBe(proof.commitment);
  expect(draw(proof.seed, round.id, 'ROULETTE')).toEqual(proof.result);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/roleta');
  await expect(page.locator('.wheel-stage')).toHaveAttribute(
    'data-winning-group',
    String(proof.result.group),
    { timeout: 12000 },
  );
  const rotation = await page
    .locator('.wheel-canvas')
    .evaluate((el) =>
      Number((el as HTMLElement).style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1]),
    );
  const alignment = (rotation + ((proof.result.group - 0.5) * 360) / 25) % 360;
  expect(Math.min(alignment, 360 - alignment)).toBeLessThan(0.001);
  const history = await (await page.request.get('/api/bootstrap')).json();
  expect(history.entries.find((e: { id: string }) => e.id === receipt.id).outcome).not.toBeNull();
  expect(history.user.points).toBe(990);
  await page.goto('/resultados');
  await expect(page.getByRole('heading', { name: 'Resultados', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/roleta$/);
  await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
  await page.getByRole('button', { name: 'Verificar integridade' }).first().click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Integridade verificada com sucesso.' }),
  ).toBeVisible();
  await page.goto('/conferidor');
  await expect(page).toHaveURL(/\/roleta$/);
  await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('cadastro, login e isolamento da conta', async ({ page }) => {
  const email = `royale-${Date.now()}@example.test`;
  const registered = await page.request.post('/api/auth/register', {
    headers: { origin: 'http://127.0.0.1:3011' },
    data: { name: 'Membro de teste', email, password: 'local-test-password-123' },
  });
  expect(registered.ok()).toBeTruthy();
  const denied = await page.request.get('/api/admin');
  expect(denied.status()).toBe(403);
  const b = await (await page.request.get('/api/bootstrap')).json();
  expect(b.user.points).toBe(1000);
  expect(b.entries).toHaveLength(0);
});
test('relatórios administrativos separam depósitos Pix e créditos demonstrativos', async ({ page }) => {
  const origin = 'http://127.0.0.1:3011';
  const login = await page.request.post('/api/auth/login', {
    headers: { origin },
    data: { email: 'e2e-admin@example.test', password: 'e2e-local-only-password-123' },
  });
  expect(login.ok()).toBeTruthy();
  const response = await page.request.get('/api/admin/reports');
  expect(response.ok()).toBeTruthy();
  const reports = await response.json();
  expect(reports.roulette).toMatchObject({ entries: expect.any(Number), pointsWagered: expect.any(Number) });
  expect(reports.scratch).toMatchObject({ cards: expect.any(Number), pointsSpent: expect.any(Number), prizePoints: expect.any(Number) });
  expect(reports.pix).toMatchObject({ confirmedCents: expect.any(Number), pendingCents: expect.any(Number) });
  expect(reports.withdrawals).toEqual({ count: 0, amountCents: 0, configured: false });
  expect(reports.events).toEqual(expect.any(Array));
  const filtered = await (await page.request.get('/api/admin/reports?q=e2e-admin')).json();
  expect(filtered.events.every((event: { name: string }) => event.name.toLowerCase().includes('admin'))).toBe(true);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Vendas e movimentações', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Financeiro e atividade dos apostadores' })).toBeVisible();
  await expect(page.getByText('PIX · depósitos confirmados')).toBeVisible();
  await expect(page.getByText('SAQUES · não configurados')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('painel administrativo, regras congeladas, conteúdo e cancelamento', async ({ page }) => {
  const origin = 'http://127.0.0.1:3011';
  await page.request.post('/api/auth/login', {
    headers: { origin },
    data: { email: 'e2e-admin@example.test', password: 'e2e-local-only-password-123' },
  });
  await page.goto('/admin');
  await expect(page.getByText('RBAC ATIVO', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Banner da roleta' })
    .fill('Banner de teste — apenas simulação');
  await page.getByRole('spinbutton', { name: 'Posições na conferência' }).fill('3');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Operação administrativa' }),
  ).toBeVisible();
  const admin = await (await page.request.get('/api/admin')).json();
  expect(admin.settings.rules.positions).toBe(3);
  const old = admin.rounds.find((r: { state: string }) => r.state === 'OPEN');
  expect(old.rules.positions).toBe(5);
  const schedule = await page.request.post('/api/admin/rounds', {
    headers: { origin },
    data: {
      action: 'schedule',
      type: 'ROULETTE',
      opensAt: new Date(Date.now() + 3600000).toISOString(),
      seconds: 60,
    },
  });
  expect(schedule.ok()).toBe(true);
  const created = await schedule.json();
  const cancel = await page.request.post('/api/admin/rounds', {
    headers: { origin },
    data: { action: 'cancel', id: created.id },
  });
  expect(cancel.ok()).toBe(true);
  const config = (await (await page.request.get('/api/admin')).json()).settings;
  await page.request.post('/api/admin/settings', {
    headers: { origin },
    data: { ...config, rules: { positions: 5, passeSecond: 2 } },
  });
  await page
    .locator('.admin-tabs')
    .getByRole('button', { name: 'Raspadinha', exact: true })
    .click();
  await page.getByRole('spinbutton', { name: 'Preço da raspadinha Ouro Vegas' }).fill('60');
  await page.getByRole('button', { name: 'Criar raspadinha' }).click();
  const newScratch = page.locator('.scratch-admin-game').last();
  await newScratch.getByLabel('Nome', { exact: true }).fill('Cartão de teste');
  await newScratch.getByLabel('Imagem da capa').fill('/cartao-teste.webp');
  await newScratch.getByRole('checkbox', { name: 'Exibir este cartão no catálogo' }).check();
  await newScratch.getByRole('button', { name: 'Adicionar prêmio' }).click();
  await newScratch.getByLabel('Cartão de teste: imagem do prêmio 1').fill('/premio-teste.webp');
  await page.getByRole('button', { name: 'Salvar raspadinhas' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Operação administrativa' }),
  ).toBeVisible();
  expect(
    (await (await page.request.get('/api/admin')).json()).settings.scratch.games[0].price,
  ).toBe(60);
  const savedScratch = (await (await page.request.get('/api/admin')).json()).settings.scratch
    .games[3];
  expect(savedScratch.name).toBe('Cartão de teste');
  expect(savedScratch.image).toBe('/cartao-teste.webp');
  expect(savedScratch.prizes).toHaveLength(5);
  expect(savedScratch.prizes[0].image).toBe('/premio-teste.webp');
  await page.getByRole('button', { name: 'Conteúdo', exact: true }).click();
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Ajuda E2E');
  await page
    .getByRole('textbox', { name: 'Texto', exact: true })
    .fill('Somente pontos fictícios. Conteúdo persistente de teste.');
  await page.getByRole('button', { name: 'Salvar conteúdo' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Operação administrativa' }),
  ).toBeVisible();
  await page.goto('/ajuda');
  await expect(page).toHaveURL(/\/roleta$/);
  await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('visão geral administrativa explica os indicadores e separa os dois jogos', async ({ page }) => {
  await page.request.post('/api/auth/login', {
    headers: { origin: 'http://127.0.0.1:3011' },
    data: { email: 'e2e-admin@example.test', password: 'e2e-local-only-password-123' },
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Resumo da operação' })).toBeVisible();
  await expect(page.locator('.admin-overview-metrics .admin-stat-card')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Roletinha', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Raspadinhas', exact: true })).toBeVisible();
  await expect(page.getByText('Esta tela não representa saldo em dinheiro.')).toBeVisible();
  await expect(page.getByText('Atividade recente')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Ver detalhes' }).first().click();
  await expect(page.getByRole('heading', { name: 'Financeiro e atividade dos apostadores' })).toBeVisible();
  await page.getByRole('button', { name: 'Saques', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Solicitações de saque' })).toBeVisible();
  await expect(page.getByText('Pedidos registrados')).toBeVisible();
  await expect(page.getByText('CPF não coletado.')).toBeVisible();
});

test('botão Sacar abre uma página demonstrativa com prazo e aviso de privacidade', async ({ page }) => {
  await page.goto('/roleta');
  await page.getByRole('button', { name: 'Sacar' }).click();
  await expect(page).toHaveURL(/\/saques$/);
  await expect(page.getByRole('heading', { name: 'Solicitações de saque' })).toBeVisible();
  await expect(page.getByText('Até 24 horas')).toBeVisible();
  await expect(page.getByText('Não solicitados')).toBeVisible();
  await expect(page.getByText('Nenhuma solicitação enviada')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
});
test('rotas e acessibilidade da conta', async ({ page }) => {
  await page.goto('/animais');
  await expect(page).toHaveURL(/\/roleta$/);
  await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
  await page.goto('/sorteio-youtube');
  await expect(page).toHaveURL(/\/roleta$/);
  await expect(page.getByRole('button', { name: /YouTube/i })).toHaveCount(0);
  await page.goto('/perfil');
  await expect(page).toHaveURL(/\/roleta$/);
  await expect(page.getByRole('heading', { name: 'Roleta Vegas' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('idempotência concorrente e saldo', async ({ page }) => {
  await page.goto('/roleta');
  await expect(page.getByRole('button', { name: 'Participar da rodada' })).toBeEnabled();
  const b = await (await page.request.get('/api/bootstrap')).json();
  const r = b.rounds.find(
    (x: { type: string; state: string }) => x.type === 'ROULETTE' && x.state === 'OPEN',
  );
  const key = await page.evaluate(() => crypto.randomUUID());
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      page.request.post('/api/entries', {
        headers: { origin: 'http://127.0.0.1:3011' },
        data: { roundId: r.id, mode: 'grupo', selection: ['16'], points: 10, key },
      }),
    ),
  );
  const bodies = await Promise.all(responses.map((x) => x.json()));
  expect(responses.every((x) => x.status() === 201)).toBe(true);
  expect(new Set(bodies.map((x) => x.id)).size).toBe(1);
  const after = await (await page.request.get('/api/bootstrap')).json();
  expect(after.user.points).toBe(990);
  expect(after.entries).toHaveLength(1);
});
