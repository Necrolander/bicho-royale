import { modes } from './game';
export const pagePaths = {
  home: '/inicio',
  overview: '/dashboard',
  bet: '/apostar',
  roulette: '/roleta',
  scratch: '/raspadinha',
  deposit: '/depositar',
  withdrawal: '/saques',
  simulator: '/modalidades',
  animals: '/animais',
  results: '/resultados',
  history: '/meus-bilhetes',
  stats: '/estatisticas',
  rules: '/regras',
  help: '/ajuda',
  profile: '/perfil',
  admin: '/admin',
  extractions: '/extracoes',
  checker: '/conferidor',
  mode: '/modalidades/grupo',
} as const;
export type Page = keyof typeof pagePaths;
export const modePath = (id: string) =>
  `/modalidades/${id === 'cercado' ? 'grupo-cercado' : id === 'cabeca' ? 'grupo-na-cabeca' : id}`;
export const validPaths = [...Object.values(pagePaths), ...modes.map((m) => modePath(m.id))];
export function resolvePage(path: string): Page {
  if (path === pagePaths.home) return 'home';
  if (path === pagePaths.admin || path.startsWith(`${pagePaths.admin}/`)) return 'admin';
  if (path === pagePaths.scratch) return 'scratch';
  if (path === pagePaths.deposit) return 'deposit';
  if (path === pagePaths.withdrawal) return 'withdrawal';
  return 'roulette';
}
export function resolveMode(path: string) {
  return modes.find((m) => modePath(m.id) === path)?.id || 'grupo';
}
