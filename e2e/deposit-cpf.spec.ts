import {test,expect} from '@playwright/test';
import {testCpf} from './test-cpf';

test('depósito Pix abre sem pedir CPF novamente e não envia documento pelo navegador',async({page})=>{
  const origin='http://127.0.0.1:3011';
  expect((await page.request.post('/api/auth/register',{headers:{origin},data:{name:'Titular Pix',cpf:testCpf(),email:'pix-account-'+Date.now()+'@example.test',password:'pix-local-only-123'}})).ok()).toBeTruthy();
  await page.route('**/api/bootstrap',async route=>{
    const response=await route.fetch();
    const data=await response.json();
    await route.fulfill({json:{...data,mercadoPagoEnabled:true}});
  });
  let payload:Record<string,unknown>|undefined;
  await page.route('**/api/mercadopago/deposits',async route=>{
    if(route.request().method()==='GET') return route.fulfill({json:[]});
    payload=route.request().postDataJSON();
    await route.fulfill({status:201,json:{id:crypto.randomUUID(),externalReference:crypto.randomUUID(),amountCents:1000,status:'pending',paymentMethod:'PIX',qrCode:'pix-local-test-code'}});
  });
  await page.goto('/depositar');
  await expect(page.locator('input[name="cpf"],input[placeholder="000.000.000-00"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Pix',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Pagamento via Pix',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Copiar código Pix',exact:true})).toBeVisible();
  expect(payload).toMatchObject({paymentMethod:'pix'});
  expect(payload).not.toHaveProperty('identificationNumber');
  expect(payload).not.toHaveProperty('cpf');
});

test('API exige corrigir CPF ausente antes de gerar Pix, mesmo com outro documento no pedido',async({page})=>{
  const origin='http://127.0.0.1:3011';
  const email=test.info().project.name==='mobile'?'e2e-admin-mobile@example.test':'e2e-admin@example.test';
  expect((await page.request.post('/api/auth/login',{headers:{origin},data:{email,password:'e2e-local-only-password-123'}})).ok()).toBeTruthy();
  const response=await page.request.post('/api/mercadopago/deposits',{headers:{origin},data:{amountCents:1000,paymentMethod:'pix',identificationType:'CPF',identificationNumber:testCpf()}});
  expect(response.status()).toBe(400);
  expect(await response.text()).toContain('CPF válido');
});
