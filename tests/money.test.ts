import { expect, it } from 'vitest';
import { displayPrizeLabel, formatBRL } from '../lib/money';

const readable = (value: string) => value.replace(/\s/g, ' ');

it('exibe o saldo em reais com duas casas e mantém o valor em centavos', () => {
  expect(readable(formatBRL(685))).toBe('R$ 6,85');
  expect(readable(formatBRL(0))).toBe('R$ 0,00');
  expect(readable(formatBRL(123456))).toBe('R$ 1.234,56');
});

it('formata descrições antigas de prêmios sem alterar nomes personalizados', () => {
  expect(readable(displayPrizeLabel('1.000 créditos', 1000))).toBe('R$ 10,00');
  expect(readable(displayPrizeLabel('25 R$', 25))).toBe('R$ 0,25');
  expect(displayPrizeLabel('Prêmio Ouro', 1000)).toBe('Prêmio Ouro');
});
