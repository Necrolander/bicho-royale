import { describe, expect, it } from 'vitest';
import { resolvePage } from '../lib/navigation';

describe('navegação pública focada na Roleta Vegas', () => {
  it('mantém a Raspadinha em página própria', () => {
    expect(resolvePage('/raspadinha')).toBe('scratch');
    expect(resolvePage('/depositar')).toBe('deposit');
  });
  it.each([
    '/',
    '/dashboard',
    '/apostar',
    '/modalidades',
    '/modalidades/grupo',
    '/modalidades/dezena',
    '/extracoes',
    '/conferidor',
    '/animais',
    '/sorteio-youtube',
  ])('%s abre a roleta', (path) => {
    expect(resolvePage(path)).toBe('roulette');
  });

  it('does not expose traditional and live-draw routes', () => {
    expect(resolvePage('/sorteio-youtube')).toBe('roulette');
    expect(resolvePage('/extracoes')).toBe('roulette');
  });
});
