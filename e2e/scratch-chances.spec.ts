import {test,expect} from '@playwright/test';
import {testCpf} from './test-cpf';

test('painel salva 0% e o backend nunca paga o prêmio zerado',async ({page})=>{
  const origin='http://127.0.0.1:3011';
  const adminEmail=test.info().project.name==='mobile'?'e2e-admin-mobile@example.test':'e2e-admin@example.test';
  const loginAdmin=()=>page.request.post('/api/auth/login',{headers:{origin},data:{email:adminEmail,password:'e2e-local-only-password-123'}});
  expect((await loginAdmin()).ok()).toBeTruthy();
  const initial=await (await page.request.get('/api/admin')).json();
  const game=initial.settings.scratch.games[0];
  const loseIndex=game.prizes.findIndex((prize:{points:number})=>prize.points===0);
  expect(loseIndex).toBeGreaterThanOrEqual(0);
  try {
    await page.goto('/admin');
    await page.locator('.admin-tabs').getByRole('button',{name:'Raspadinha',exact:true}).click();
    for(let index=0;index<game.prizes.length;index++) {
      await page.getByRole('spinbutton',{name:game.name+': chance do prêmio '+(index+1),exact:true}).fill(index===loseIndex?'100':'0');
    }
    await page.getByRole('button',{name:'Salvar raspadinhas',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Operação administrativa'})).toBeVisible();
    const saved=await (await page.request.get('/api/admin')).json();
    const savedGame=saved.settings.scratch.games.find((item:{id:string})=>item.id===game.id);
    expect(savedGame.prizes.map((prize:{chance:number})=>prize.chance)).toEqual(game.prizes.map((_:unknown,index:number)=>index===loseIndex?10000:0));
    const invalid=structuredClone(saved.settings);
    invalid.scratch.games[0].prizes[loseIndex].chance=9999;
    expect((await page.request.post('/api/admin/settings',{headers:{origin},data:invalid})).status()).toBe(400);
    const register=await page.request.post('/api/auth/register',{headers:{origin},data:{name:'Teste chance zero',cpf:testCpf(),email:'chance-zero-'+Date.now()+'@example.test',password:'chance-zero-local-123'}});
    expect(register.ok()).toBeTruthy();
    const before=(await (await page.request.get('/api/bootstrap')).json()).user.points;
    for(let attempt=0;attempt<4;attempt++) {
      const response=await page.request.post('/api/scratchcards',{headers:{origin},data:{gameId:game.id,key:crypto.randomUUID()}});
      expect(response.ok()).toBeTruthy();
      expect((await response.json()).prize_points).toBe(0);
    }
    const after=await (await page.request.get('/api/bootstrap')).json();
    expect(after.user.points).toBe(before-4*game.price);
    expect(after.scratchCards).toHaveLength(4);
    expect(after.scratchCards.every((card:{prize_points:number})=>card.prize_points===0)).toBe(true);
  } finally {
    expect((await loginAdmin()).ok()).toBeTruthy();
    expect((await page.request.post('/api/admin/settings',{headers:{origin},data:initial.settings})).ok()).toBeTruthy();
  }
});
