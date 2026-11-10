const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number) {
  return brl.format(cents / 100);
}

export function displayPrizeLabel(label: string, cents: number) {
  return /^\s*[\d.,]+\s*(?:créditos?|pontos?|R\$)\s*$/i.test(label)
    ? formatBRL(cents)
    : label;
}
