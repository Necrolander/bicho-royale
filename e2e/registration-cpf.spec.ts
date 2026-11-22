import {test,expect} from '@playwright/test';
import {testCpf} from './test-cpf';

test('cadastro exige CPF válido, bloqueia duplicado e mantém vínculo após novo login',async ({page})=>{
  const origin='http://127.0.0.1:3011';
  const email='cpf-registration-'+Date.now()+'@example.test';
  const password='cpf-registration-local-123';
  const body={name:'Cadastro CPF',email,password};
  for(const cpf of [undefined,'00000000000','12345678900']) {
    const response=await page.request.post('/api/auth/register',{headers:{origin},data:{...body,cpf}});
    expect(response.status()).toBe(400);
  }
  await page.goto('/inicio');
  await page.getByRole('button',{name:'Ainda não tem conta? Cadastre-se',exact:true}).click();
  const cpfInput=page.getByRole('textbox',{name:'CPF vinculado à conta'});
  await expect(cpfInput).toHaveAttribute('required','');
  expect(await cpfInput.evaluate((node:HTMLInputElement)=>node.checkValidity())).toBe(false);
  const cpf=testCpf();
  const formatted=cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
  await page.getByRole('textbox',{name:'Nome',exact:true}).fill(body.name);
  await cpfInput.fill(cpf);
  await expect(cpfInput).toHaveValue(formatted);
  await page.getByRole('textbox',{name:'E-mail',exact:true}).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button',{name:'Criar conta e abrir painel',exact:true}).click();
  await expect(page.locator('.balance')).toContainText('R$');
  const initial=await (await page.request.get('/api/bootstrap')).json();
  const masked='***.***.***-'+cpf.slice(-2);
  expect(initial.user.cpf).toBe(masked);
  await page.goto('/perfil');
  await expect(page.getByText('CPF atual: '+masked,{exact:false})).toBeVisible();
  const duplicate=await page.request.post('/api/auth/register',{headers:{origin},data:{...body,email:'duplicate-'+email,cpf:formatted}});
  expect(duplicate.status()).toBe(409);
  expect((await page.request.post('/api/auth/logout',{headers:{origin},data:{}})).ok()).toBeTruthy();
  expect((await page.request.post('/api/auth/login',{headers:{origin},data:{email,password}})).ok()).toBeTruthy();
  const persisted=await (await page.request.get('/api/bootstrap')).json();
  expect(persisted.user.id).toBe(initial.user.id);
  expect(persisted.user.cpf).toBe(masked);
  await page.goto('/saques');
  await expect(page.locator('.withdrawal-destination')).toContainText(masked);
  await expect(page.getByRole('combobox',{name:'Destino',exact:true})).toHaveValue('cpf');
});
