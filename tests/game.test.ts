import { describe, it, expect } from 'vitest';
import { animals, animalFor, evaluate, modes, normalizeSelection, wheelTarget } from '../lib/game';
import { commitment, derive, draw, newSeed } from '../lib/fairness';
import { normalizePositions } from '../lib/game';

describe('Posições de bilhetes tradicionais', () => {
  it('confere somente os prêmios escolhidos', () => {
    const numbers = ['0037', '1052', '0064', '9999', '0000'];
    expect(evaluate('dezena', ['52'], numbers, undefined, [1]).win).toBe(false);
    expect(evaluate('dezena', ['52'], numbers, undefined, [2]).win).toBe(true);
    expect(evaluate('grupo', ['25'], numbers, undefined, [5]).win).toBe(true);
  });
  it('rejeita posições repetidas, fora da regra e combinações insuficientes', () => {
    expect(() => normalizePositions('grupo', { positions: 3, passeSecond: 2 }, [4])).toThrow();
    expect(() =>
      normalizePositions('duque-grupo', { positions: 5, passeSecond: 2 }, [1]),
    ).toThrow();
    expect(() => normalizePositions('grupo', { positions: 5, passeSecond: 2 }, [1, 1])).toThrow();
    expect(() => normalizePositions('cabeca', { positions: 5, passeSecond: 2 }, [2])).toThrow();
  });
  it('aplica a convenção do passe preservada na extração', () => {
    const rules = {
      positions: 5,
      passeSecond: 2,
      modes: { passe: { enabled: true, positions: 5, passeSecond: 3 } },
    };
    expect(
      evaluate('passe', ['10', '16'], ['0037', '1052', '0064', '9999', '0000'], rules).win,
    ).toBe(true);
    expect(
      evaluate('milhar-invertida', ['0011'], ['0101', '1234', '4567', '6789', '9999']).win,
    ).toBe(true);
    expect(
      evaluate('milhar-invertida', ['0011'], ['0111', '1234', '4567', '6789', '9999']).win,
    ).toBe(false);
  });
});
describe('Tabela centralizada', () => {
  it('contém 25 grupos com exatamente 100 dezenas únicas', () => {
    expect(animals).toHaveLength(25);
    expect(new Set(animals.flatMap((a) => a.tens)).size).toBe(100);
    for (const a of animals) expect(a.tens).toHaveLength(4);
  });
  it.each(Array.from({ length: 100 }, (_, i) => i))('mapeia a dezena %i', (n) => {
    expect(animalFor(n).id).toBe(n === 0 ? 25 : Math.ceil(n / 4));
  });
  it('preserva 00, milhares com zeros e limites', () => {
    expect(() => animalFor('')).toThrow();
    expect(() => animalFor(' 00')).toThrow();
    expect(() => animalFor('1e2')).toThrow();
    expect(animalFor('0000').name).toBe('Vaca');
    expect(animalFor('2900').id).toBe(25);
    expect(animalFor('9999').id).toBe(25);
    expect(animalFor('0037').id).toBe(10);
    expect(() => animalFor(-1)).toThrow();
    expect(() => animalFor(10000)).toThrow();
  });
});
const result = ['4837', '7264', '1052', '8831', '2900'];
describe('Conferência didática', () => {
  it.each([
    ['grupo', ['10'], true],
    ['cabeca', ['16'], false],
    ['cabeca', ['10'], true],
    ['cercado', ['25'], true],
    ['dezena', ['00'], true],
    ['centena', ['837'], true],
    ['centena', ['037'], false],
    ['milhar', ['4837'], true],
    ['milhar', ['0037'], false],
    ['milhar-invertida', ['7384'], true],
    ['duque-grupo', ['10', '16'], true],
    ['duque-dezena', ['37', '64'], true],
    ['terno-grupo', ['10', '16', '13'], true],
    ['terno-dezena', ['37', '64', '52'], true],
    ['passe', ['10', '16'], true],
    ['passe', ['16', '10'], false],
    ['passe-invertido', ['16', '10'], true],
  ] as const)('%s %j → %s', (mode, selection, win) => {
    expect(evaluate(mode, [...selection], result).win).toBe(win);
  });
  it('testa permutações e multiplicidade', () => {
    expect(evaluate('milhar-invertida', ['1123'], ['3211']).win).toBe(true);
    expect(evaluate('milhar-invertida', ['1123'], ['3221']).win).toBe(false);
    expect(evaluate('milhar-invertida', ['0001'], ['1000']).win).toBe(true);
  });
  it('impede combinações com repetições', () => {
    expect(() => normalizeSelection('duque-grupo', ['10', '10'])).toThrow();
    expect(() => normalizeSelection('terno-dezena', ['0', '00', '10'])).toThrow();
  });
  it('respeita posições configuradas e passe', () => {
    expect(evaluate('grupo', ['25'], result, { positions: 4, passeSecond: 2 }).win).toBe(false);
    expect(evaluate('passe', ['10', '13'], result, { positions: 5, passeSecond: 3 }).win).toBe(
      true,
    );
    expect(evaluate('duque-grupo', ['10', '16'], ['4837']).win).toBe(false);
  });
  it('valida entradas extremas', () => {
    for (const bad of ['26', '0', '-1', 'abc'])
      expect(() => normalizeSelection('grupo', [bad])).toThrow();
    expect(() => evaluate('dezena', ['100'], result)).toThrow();
    expect(() => evaluate('milhar', ['1234'], ['123'])).toThrow();
    expect(modes).toHaveLength(13);
  });
});
describe('Sorteio verificável', () => {
  it('reproduz os resultados e rejeita semente adulterada', () => {
    const seed = newSeed(),
      id = 'test-round';
    expect(seed).toMatch(/^[a-f0-9]{64}$/);
    expect(commitment(id, seed)).toHaveLength(64);
    expect(commitment(id, seed)).not.toBe(commitment(id, newSeed()));
    expect(draw(seed, id, 'TRADITIONAL')).toEqual(draw(seed, id, 'TRADITIONAL'));
  });
  it('mantém limites e formato da extração', () => {
    for (let i = 0; i < 100; i++) {
      const s = newSeed(),
        r = draw(s, String(i), 'ROULETTE'),
        t = draw(s, String(i), 'TRADITIONAL');
      expect(r.group).toBeGreaterThanOrEqual(1);
      expect(r.group).toBeLessThanOrEqual(25);
      expect(t.numbers).toHaveLength(5);
      for (const n of t.numbers) expect(n).toMatch(/^\d{4}$/);
    }
    expect(derive('0'.repeat(64), 'x', 25, 1000).every((n) => n >= 0 && n < 25)).toBe(true);
  });
  it.each(animals)('para a roda exatamente no setor $id', (a) => {
    for (const current of [0, 35, 178, 2160, 10000]) {
      const angle = wheelTarget(current, a.id);
      const relative = (((angle + (a.id - 0.5) * (360 / 25)) % 360) + 360) % 360;
      expect(Math.min(relative, 360 - relative)).toBeLessThan(0.000001);
      expect(angle - current).toBeGreaterThanOrEqual(2160);
    }
  });
});
