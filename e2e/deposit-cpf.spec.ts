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


for(const method of ['Cartão','Boleto']) {
  test(method+' usa CPF da conta sem campo para redigitar o documento',async({page})=>{
    const origin='http://127.0.0.1:3011';
    const cpf=testCpf();
    expect((await page.request.post('/api/auth/register',{headers:{origin},data:{name:'Titular Checkout',cpf,email:'document-'+Date.now()+'@example.test',password:'checkout-local-only-123'}})).ok()).toBeTruthy();
    await page.route('**/api/bootstrap',async route=>{
      const data=await (await route.fetch()).json();
      await route.fulfill({json:{...data,mercadoPagoEnabled:true}});
    });
    await page.route('**/api/mercadopago/public-key',route=>route.fulfill({json:{publicKey:'TEST-local-only',environment:'sandbox'}}));
    await page.route('https://sdk.mercadopago.com/js/v2',route=>route.fulfill({contentType:'text/javascript',body:`
      window.MercadoPago=class {
        cardForm(options) {
          const form=document.getElementById(options.form.id);
          form.addEventListener('submit',event=>options.callbacks.onSubmit(event));
          return {
            mount(){options.callbacks.onFormMounted(null);},
            getCardFormData(){return {token:'card-token-local',installments:'1',paymentMethodId:'visa',issuerId:'1',identificationNumber:document.getElementById('form-checkout__identificationNumber').value,identificationType:document.getElementById('form-checkout__identificationType').value};}
          };
        }
      };
    `}));
    let payload:Record<string,unknown>|undefined;
    await page.route('**/api/mercadopago/deposits',async route=>{
      if(route.request().method()==='GET') return route.fulfill({json:[]});
      payload=route.request().postDataJSON();
      await route.fulfill({status:201,json:{id:crypto.randomUUID(),externalReference:crypto.randomUUID(),amountCents:1000,status:'pending',paymentMethod:method==='Cartão'?'CREDIT_CARD':'BOLETO',ticketUrl:method==='Boleto'?'https://www.mercadopago.com.br/test-boleto':undefined}});
    });
    await page.goto('/depositar');
    await page.getByRole('button',{name:method,exact:true}).click();
    await expect(page.getByRole('textbox',{name:'CPF',exact:true})).toHaveCount(0);
    if(method==='Cartão') {
      await expect(page.locator('#form-checkout__identificationNumber')).toHaveValue(cpf);
      await expect(page.locator('#form-checkout__identificationNumber')).toBeHidden();
      await expect(page.locator('#form-checkout__identificationType')).toHaveValue('CPF');
      await page.getByRole('button',{name:'Continuar para pagar',exact:true}).click();
      await expect.poll(()=>payload?.paymentMethod).toBe('credit_card');
      expect(payload?.token).toBe('card-token-local');
    } else {
      for(const [name,value] of Object.entries({zip_code:'01001000',federal_unit:'SP',street_name:'Praça da Sé',street_number:'1',neighborhood:'Sé',city:'São Paulo'})) await page.locator('input[name="'+name+'"]').fill(value);
      await page.getByRole('button',{name:'Gerar boleto',exact:true}).click();
      await expect(page.getByRole('link',{name:'Abrir boleto',exact:true})).toBeVisible();
      expect(payload?.paymentMethod).toBe('boleto');
    }
    expect(payload).not.toHaveProperty('identificationNumber');
    expect(payload).not.toHaveProperty('cpf');
  });
}
