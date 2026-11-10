import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 1100 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:3010/dashboard');
  await page.getByRole('button', { name: 'Fechar diálogo' }).click();
  for (const [route, slug, title] of [
    ['/dashboard', 'dashboard', 'Encontre sua modalidade'],
    ['/modalidades/grupo', 'grupo', 'Grupo'],
    ['/modalidades/milhar-invertida', 'invertida', 'Milhar invertida'],
    ['/extracoes', 'extracoes', 'Cinco prêmios. Uma extração verificável.'],
    ['/conferidor', 'conferidor', 'Conferidor de modalidades'],
    ['/meus-bilhetes', 'bilhetes', 'Meus Bilhetes'],
  ]) {
    await page.goto('http://127.0.0.1:3010' + route);
    await page.getByRole('heading', { name: title, exact: true }).first().waitFor();
    await page.locator('.splash').waitFor({ state: 'hidden' });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `artifacts/expanded-${name}-${slug}.png`, fullPage: true });
    console.log(
      JSON.stringify({
        name,
        route,
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        errors,
      }),
    );
  }
  await page.close();
}
await browser.close();
