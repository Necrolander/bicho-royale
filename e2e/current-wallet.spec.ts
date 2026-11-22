import { test, expect } from '@playwright/test';
import { testCpf } from './test-cpf';

test('carteira, indicações, navegação e permissões atuais', async ({page, isMobile}) => {
  const origin='http://127.0.0.1:3011';
  const response=await page.request.post('/api/auth/register',{headers:{origin},data:{name:'Validação atual',cpf:testCpf(),email:`current-${Date.now()}@example.test`,password:'senha-local-de-teste-123'}});
  expect(response.ok()).toBeTruthy();
  await page.goto('/inicio');
  await expect(page.locator('.balance')).toContainText('R$');
  if (isMobile) await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.getByRole('button',{name:'Indique e Ganhe',exact:true}).filter({visible:true}).click();
  await expect(page.getByRole('heading',{name:'Convide amigos. Ganhe saldo.'})).toBeVisible();
  await expect(page.locator('.referral-metrics')).toContainText('R$');
  await expect(page.getByRole('button',{name:'Copiar link de convite'})).toBeVisible();
  await page.getByRole('button',{name:'Fechar diálogo'}).click();
  await page.goto('/depositar');
  await expect(page.locator('.deposit-balance-card')).toContainText('R$');
  await page.goto('/saques');
  await expect(page.getByRole('heading',{name:'Transferir via Pix'})).toBeVisible();
  await expect(page.locator('.withdrawal-balance')).toContainText('R$');
  await expect(page.getByRole('button',{name:'Solicitar saque',exact:true})).toBeDisabled();
  const tooSmall=await page.request.post('/api/withdrawals',{headers:{origin},data:{amountCents:1999,requestId:crypto.randomUUID()}});
  expect(tooSmall.status()).toBe(400);
  for(const url of ['/roleta','/raspadinha','/perfil']) {
    await page.goto(url);
    await expect(page.locator('.balance')).toContainText('R$');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect((await page.request.get('/api/admin/withdrawals')).status()).toBe(403);
  await page.request.post('/api/auth/login',{headers:{origin},data:{email:'e2e-admin@example.test',password:'e2e-local-only-password-123'}});
  await page.goto('/admin');
  await page.locator('.admin-tabs').getByRole('button',{name:'Saques',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Saques via Pix',exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'CPF / destino Pix'})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Prazo de 24 horas'})).toBeVisible();
});
