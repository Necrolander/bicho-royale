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
  await page.request.post('/api/auth/login',{headers:{origin},data:{email:test.info().project.name === 'mobile' ? 'e2e-admin-mobile@example.test' : 'e2e-admin@example.test',password:'e2e-local-only-password-123'}});
  await page.goto('/admin');
  await page.locator('.admin-tabs').getByRole('button',{name:'Saques',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Saques via Pix',exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'CPF / destino Pix'})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Prazo de 24 horas'})).toBeVisible();
});


test('histórico mostra o destino Pix de cada pedido e os cinco mais recentes', async ({page}) => {
  const origin='http://127.0.0.1:3011';
  const response=await page.request.post('/api/auth/register',{headers:{origin},data:{name:'Histórico Pix',cpf:testCpf(),email:`history-${Date.now()}@example.test`,password:'senha-local-de-teste-123'}});
  expect(response.ok()).toBeTruthy();
  const keys=['destino@example.test','11987654321','11144477735','123e4567-e89b-42d3-a456-426614174000','outro@example.test','antigo@example.test'];
  await page.route('**/api/withdrawals',async route => {
    if(route.request().method()!=='GET') return route.continue();
    await route.fulfill({json:keys.map((pix_key,index)=>({id:crypto.randomUUID(),pix_key,amount_cents:2000,status:index===0?'PENDING':index===1?'REJECTED':'APPROVED',created_at:new Date(Date.now()-index*86400000).toISOString(),processed_at:null,admin_note:null}))});
  });
  await page.goto('/saques');
  await expect(page.locator('.withdrawal-item')).toHaveCount(5);
  for(const key of keys.slice(0,5)) await expect(page.locator('.withdrawal-history').getByText(key,{exact:true})).toBeVisible();
  await expect(page.locator('.withdrawal-history')).not.toContainText(keys[5]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
