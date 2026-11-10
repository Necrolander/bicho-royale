import { describe, expect, it } from 'vitest';
import { defaultScratchConfig, pickScratchPrize } from '../lib/scratchcards';

describe('sorteio demonstrativo da raspadinha', () => {
  it('distribui os limites exatamente conforme as chances em pontos-base', () => {
    const prizes = defaultScratchConfig.prizes;
    let start = 0;
    for (const prize of prizes) {
      expect(pickScratchPrize(prizes, start).points).toBe(prize.points);
      expect(pickScratchPrize(prizes, start + prize.chance - 1).points).toBe(prize.points);
      start += prize.chance;
    }
    expect(start).toBe(10_000);
  });

  it('mantém a tabela de cada cartão em 100% e oferece vários níveis de prêmio', () => {
    for (const game of defaultScratchConfig.games ?? []) {
      expect(game.prizes.reduce((total, prize) => total + prize.chance, 0)).toBe(10_000);
      expect(game.prizes.filter((prize) => prize.points > 0)).toHaveLength(9);
      expect(Math.max(...game.prizes.map((prize) => prize.points))).toBe(10_000);
    }
  });

  it('rejects draws or chance tables outside the exact 100% range', () => {
    expect(() => pickScratchPrize(defaultScratchConfig.prizes, 10_000)).toThrow();
    expect(() => pickScratchPrize(defaultScratchConfig.prizes.slice(1), 0)).toThrow();
  });
});
