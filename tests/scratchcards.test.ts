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


describe('chance zero e distribuição exata', () => {
  it.each([0,1,2])('um prêmio com 0% na posição %i nunca sai em nenhum dos 10.000 resultados', (position) => {
    const zero={label:'Prêmio bloqueado',points:10000,chance:0};
    const prizes=[{label:'Sem prêmio',points:0,chance:7500},{label:'Prêmio permitido',points:100,chance:2500}];
    prizes.splice(position,0,zero);
    const counts=new Map<number,number>();
    for(let draw=0;draw<10000;draw++) {
      const result=pickScratchPrize(prizes,draw);
      expect(result).not.toBe(zero);
      counts.set(result.points,(counts.get(result.points)||0)+1);
    }
    expect(counts.get(100)).toBe(2500);
    expect(counts.get(0)).toBe(7500);
    expect(counts.get(10000)||0).toBe(0);
  });
  it('100% sem prêmio e 0% para todos os prêmios nunca paga',()=>{
    const prizes=[{label:'Zero inicial',points:100,chance:0},{label:'Sem prêmio',points:0,chance:10000},{label:'Zero final',points:10000,chance:0}];
    for(let draw=0;draw<10000;draw++) expect(pickScratchPrize(prizes,draw).points).toBe(0);
  });
  it('0,01% corresponde exatamente a um resultado entre 10.000',()=>{
    const prizes=[{label:'Sem prêmio',points:0,chance:9999},{label:'Prêmio raro',points:100,chance:1},{label:'Desativado',points:10000,chance:0}];
    const results=Array.from({length:10000},(_,draw)=>pickScratchPrize(prizes,draw));
    expect(results.filter(p=>p.points===100)).toHaveLength(1);
    expect(results.filter(p=>p.points===10000)).toHaveLength(0);
  });
});
