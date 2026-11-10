export type Animal = { id: number; name: string; icon: string; tens: string[] };
const names = [
  'Avestruz',
  'Águia',
  'Burro',
  'Borboleta',
  'Cachorro',
  'Cabra',
  'Carneiro',
  'Camelo',
  'Cobra',
  'Coelho',
  'Cavalo',
  'Elefante',
  'Galo',
  'Gato',
  'Jacaré',
  'Leão',
  'Macaco',
  'Porco',
  'Pavão',
  'Peru',
  'Touro',
  'Tigre',
  'Urso',
  'Veado',
  'Vaca',
];
const icons = [
  '🪶',
  '🦅',
  '🫏',
  '🦋',
  '🐕',
  '🐐',
  '🐏',
  '🐪',
  '🐍',
  '🐇',
  '🐎',
  '🐘',
  '🐓',
  '🐈',
  '🐊',
  '🦁',
  '🐒',
  '🐖',
  '🦚',
  '🦃',
  '🐂',
  '🐅',
  '🐻',
  '🦌',
  '🐄',
];
export const animals: Animal[] = names.map((name, i) => ({
  id: i + 1,
  name,
  icon: icons[i],
  tens: Array.from({ length: 4 }, (_, j) => String((i * 4 + j + 1) % 100).padStart(2, '0')),
}));
export function animalFor(value: string | number): Animal {
  if (typeof value === 'string' && !/^\d{1,4}$/.test(value)) throw new Error('Número inválido');
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 9999) throw new Error('Número inválido');
  return animals[n % 100 === 0 ? 24 : Math.ceil((n % 100) / 4) - 1];
}
export type ModeId =
  | 'grupo'
  | 'dezena'
  | 'centena'
  | 'milhar'
  | 'milhar-invertida'
  | 'cabeca'
  | 'cercado'
  | 'duque-grupo'
  | 'duque-dezena'
  | 'terno-grupo'
  | 'terno-dezena'
  | 'passe'
  | 'passe-invertido';
export type Mode = {
  id: ModeId;
  name: string;
  kind: 'group' | 'number';
  width: number;
  count: number;
  positions: 'first' | 'all' | 'ordered';
  description: string;
  example: string;
};
export const modes: Mode[] = [
  {
    id: 'grupo',
    name: 'Grupo',
    kind: 'group',
    width: 2,
    count: 1,
    positions: 'all',
    description:
      'Seu grupo em qualquer uma das cinco posições. Na roleta, compara o único grupo sorteado.',
    example: '10 → Coelho em qualquer posição',
  },
  {
    id: 'dezena',
    name: 'Dezena',
    kind: 'number',
    width: 2,
    count: 1,
    positions: 'all',
    description: 'Compara os dois últimos dígitos em qualquer posição.',
    example: '37 → 4837 confere',
  },
  {
    id: 'centena',
    name: 'Centena',
    kind: 'number',
    width: 3,
    count: 1,
    positions: 'all',
    description: 'Compara os três últimos dígitos em qualquer posição.',
    example: '837 → 4837 confere',
  },
  {
    id: 'milhar',
    name: 'Milhar',
    kind: 'number',
    width: 4,
    count: 1,
    positions: 'all',
    description: 'Compara os quatro dígitos, incluindo zeros à esquerda.',
    example: '0037 → apenas 0037 confere',
  },
  {
    id: 'milhar-invertida',
    name: 'Milhar invertida',
    kind: 'number',
    width: 4,
    count: 1,
    positions: 'all',
    description: 'Aceita qualquer permutação dos quatro dígitos, preservando suas repetições.',
    example: '1123 → 3211 confere; 3221 não',
  },
  {
    id: 'cabeca',
    name: 'Grupo na cabeça',
    kind: 'group',
    width: 2,
    count: 1,
    positions: 'first',
    description: 'Compara exclusivamente o grupo do primeiro prêmio.',
    example: '16 → Leão somente no 1º prêmio',
  },
  {
    id: 'cercado',
    name: 'Grupo cercado',
    kind: 'group',
    width: 2,
    count: 1,
    positions: 'all',
    description:
      'Convenção desta demonstração: um grupo em qualquer uma das cinco posições, sem multiplicar acertos.',
    example: '25 → Vaca em uma das cinco posições',
  },
  {
    id: 'duque-grupo',
    name: 'Duque de grupo',
    kind: 'group',
    width: 2,
    count: 2,
    positions: 'all',
    description: 'Dois grupos distintos em duas posições distintas, sem ordem.',
    example: '10,16 → Coelho e Leão em posições diferentes',
  },
  {
    id: 'duque-dezena',
    name: 'Duque de dezena',
    kind: 'number',
    width: 2,
    count: 2,
    positions: 'all',
    description: 'Duas dezenas distintas em posições distintas, sem ordem.',
    example: '37,64 → finais 37 e 64',
  },
  {
    id: 'terno-grupo',
    name: 'Terno de grupo',
    kind: 'group',
    width: 2,
    count: 3,
    positions: 'all',
    description: 'Três grupos distintos em três posições distintas, sem ordem.',
    example: '10,16,14 → Coelho, Leão e Gato',
  },
  {
    id: 'terno-dezena',
    name: 'Terno de dezena',
    kind: 'number',
    width: 2,
    count: 3,
    positions: 'all',
    description: 'Três dezenas distintas em três posições distintas, sem ordem.',
    example: '37,64,52 → três finais diferentes',
  },
  {
    id: 'passe',
    name: 'Passe',
    kind: 'group',
    width: 2,
    count: 2,
    positions: 'ordered',
    description:
      'Convenção local: primeiro grupo no 1º prêmio e segundo no 2º prêmio, nessa ordem.',
    example: '10,16 → Coelho primeiro, Leão segundo',
  },
  {
    id: 'passe-invertido',
    name: 'Passe invertido',
    kind: 'group',
    width: 2,
    count: 2,
    positions: 'ordered',
    description:
      'Convenção local: os dois grupos no 1º e 2º prêmios em qualquer uma das duas ordens.',
    example: '10,16 → Coelho/Leão ou Leão/Coelho',
  },
];
export type RuleConfig = {
  positions: number;
  passeSecond: number;
  modes?: Partial<Record<ModeId, { enabled: boolean; positions: number; passeSecond: number }>>;
};
export const defaultRules: RuleConfig = { positions: 5, passeSecond: 2 };
export function modeRules(id: ModeId, rules: RuleConfig): RuleConfig {
  return { ...rules, ...rules.modes?.[id] };
}
export function allowedPositions(id: ModeId, rules: RuleConfig = defaultRules): number[] {
  const m = modes.find((x) => x.id === id);
  if (!m) throw new Error('Modalidade desconhecida');
  const r = modeRules(id, rules);
  return m.positions === 'first'
    ? [1]
    : m.positions === 'ordered'
      ? [1, r.passeSecond]
      : Array.from({ length: r.positions }, (_, i) => i + 1);
}
export function normalizePositions(id: ModeId, rules: RuleConfig, positions?: number[]): number[] {
  const allowed = allowedPositions(id, rules),
    m = modes.find((x) => x.id === id)!;
  const selected = positions || allowed;
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((p) => !Number.isInteger(p) || !allowed.includes(p))
  )
    throw new Error('Posições inválidas para esta modalidade');
  if (m.positions !== 'all' && JSON.stringify(selected) !== JSON.stringify(allowed))
    throw new Error('Esta modalidade tem posições fixas');
  if (positions && m.positions === 'all' && selected.length < m.count)
    throw new Error(`Selecione pelo menos ${m.count} posições`);
  return [...selected].sort((a, b) => a - b);
}
export function normalizeSelection(modeId: ModeId, input: string[]): string[] {
  const m = modes.find((x) => x.id === modeId);
  if (!m) throw new Error('Modalidade desconhecida');
  if (input.length !== m.count) throw new Error(`Informe ${m.count} seleção(ões)`);
  const values = input.map((x) => x.trim());
  if (values.some((x) => !new RegExp(`^\\d{1,${m.width}}$`).test(x)))
    throw new Error(`Use números de até ${m.width} dígitos`);
  if (m.kind === 'group' && values.some((x) => Number(x) < 1 || Number(x) > 25))
    throw new Error('Grupo deve estar entre 01 e 25');
  const normalized = values.map((x) => x.padStart(m.width, '0'));
  if (new Set(normalized).size !== normalized.length)
    throw new Error('Escolha elementos distintos');
  return normalized;
}
export function evaluate(
  modeId: ModeId,
  input: string[],
  results: string[],
  rules: RuleConfig = defaultRules,
  positions?: number[],
) {
  rules = modeRules(modeId, rules);
  const m = modes.find((x) => x.id === modeId)!;
  const selection = normalizeSelection(modeId, input);
  if (!results.length || results.some((x) => !/^\d{4}$/.test(x)))
    throw new Error('Extração inválida');
  if (
    !Number.isInteger(rules.positions) ||
    rules.positions < 1 ||
    rules.positions > 5 ||
    !Number.isInteger(rules.passeSecond) ||
    rules.passeSecond < 2 ||
    rules.passeSecond > 5
  )
    throw new Error('Configuração inválida');
  const analyzed = normalizePositions(modeId, rules, positions);
  const relevant = analyzed.map((p) => results[p - 1]).filter(Boolean);
  const values = relevant.map((x) =>
    m.kind === 'group' ? String(animalFor(x).id).padStart(2, '0') : x.slice(-m.width),
  );
  let win: boolean;
  if (modeId === 'milhar-invertida')
    win = values.some((x) => [...x].sort().join('') === [...selection[0]].sort().join(''));
  else if (m.positions === 'ordered') {
    const pair = values;
    win =
      pair.length === 2 &&
      ((pair[0] === selection[0] && pair[1] === selection[1]) ||
        (modeId === 'passe-invertido' && pair[0] === selection[1] && pair[1] === selection[0]));
  } else win = selection.every((x) => values.includes(x));
  return {
    win,
    explanation: `${win ? 'Conferiu' : 'Não conferiu'}: ${selection.join(', ')}. ${m.positions === 'ordered' ? `Posições 1 e ${rules.passeSecond}` : `${relevant.length} posição(ões) analisada(s)`}. Valores encontrados: ${values.join(', ')}.`,
    values,
    positions: analyzed,
  };
}
export function wheelTarget(current: number, group: number): number {
  const slice = 360 / 25;
  const target = (360 - (group - 0.5) * slice) % 360;
  const normalized = ((current % 360) + 360) % 360;
  return current + 360 * 6 + ((target - normalized + 360) % 360);
}
