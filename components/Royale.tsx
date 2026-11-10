'use client';
import { formatBRL, displayPrizeLabel } from '@/lib/money';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  CircleDot,
  Ticket,
  Home,
  Gift,
  Compass,
  PawPrint,
  Trophy,
  ShieldCheck,
  HelpCircle,
  Settings,
  ChevronRight,
  ChevronDown,
  UserRound,
  LogOut,
  ArrowUpRight,
  Bell,
  Search,
  Star,
  Check,
  Users,
  X,
  Menu,
  ArrowRight,
  Wallet,
  RefreshCw,
  Info,
  CheckCircle2,
  LockKeyhole,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { animals, type ModeId } from '@/lib/game';
import { translations, type Locale } from '@/lib/i18n';
import { AnimalArt } from './AnimalArt';
import { Wheel } from './Wheel';
import Admin from './Admin';
import Scratchcard from './Scratchcard';
import { PrizeImage } from './PrizeImage';
import { usePathname, useRouter } from 'next/navigation';
import { pagePaths, resolvePage, type Page } from '@/lib/navigation';
import { Tickets } from './Traditional';
import type { ScratchConfig } from '@/lib/scratchcards';
import DepositScreen from './Deposit';
import WithdrawalScreen from './Withdrawal';
type User = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  points: number;
  cpf: string | null;
  guest: boolean;
};
export type Round = {
  id: string;
  type: 'ROULETTE' | 'TRADITIONAL';
  state: string;
  opens_at: string;
  locks_at: string;
  published_at: string | null;
  commitment: string;
  seed?: string;
  result: { group: number | null; numbers: string[] } | null;
  source?: 'YOUTUBE' | 'SERVER';
  video_id?: string | null;
  video_url?: string | null;
  rules: import('@/lib/game').RuleConfig;
};
type Entry = {
  id: string;
  round_id: string;
  mode: ModeId;
  selection: string[];
  points: number;
  created_at: string;
  outcome: { win: boolean; explanation: string } | null;
  type: string;
};
type Preferences = {
  sound: boolean;
  accessible: boolean;
  theme: 'dark' | 'light';
  locale: Locale;
  favorites: number[];
  tutorial: boolean;
};
type Content = { slug: string; title: string; body: string };
type Bootstrap = {
  user: User | null;
  paymentsEnabled: boolean;
  mercadoPagoEnabled: boolean;
  rounds: Round[];
  entries: Entry[];
  settings: {
    platform: string;
    paused: boolean;
    duration: number;
    announcement: string;
    logo: string;
    accent: string;
    banner: string;
    locale: Locale;
    sound: boolean;
    animations: boolean;
    scratch: ScratchConfig;
  };
  preferences: Partial<Preferences>;
  notifications: { id: string; message: string; read: number; created_at: string }[];
  content: Content[];
  transactions: { id: string; amount: number; balance: number; created_at: string }[];
  scratchCards: {
    id: string;
    price_points: number;
    prize_points: number;
    prize_label: string;
    created_at: string;
  }[];
  recentWins: {
    game: string;
    label: string;
    points: number;
    image: string;
    created_at: string;
  }[];
};
const navigation = [
  { id: 'roulette', icon: CircleDot },
  { id: 'scratch', icon: Ticket },
  { id: 'deposit', icon: Wallet },
] as const;
export async function api(path: string, body?: unknown) {
  const r = await fetch(
    `/api/${path}`,
    body !== undefined
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  );
  const contentType = r.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      r.ok
        ? 'O servidor respondeu em formato inesperado. Atualize a página e tente novamente.'
        : `O servidor está indisponível no momento (HTTP ${r.status}). Tente novamente em instantes.`,
    );
  }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Não foi possível concluir');
  return data;
}
const date = (s: string) =>
  new Date(s).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
const short = (s: string) => s.slice(0, 8).toUpperCase();
const defaults: Preferences = {
  sound: false,
  accessible: false,
  theme: 'dark',
  locale: 'pt',
  favorites: [],
  tutorial: false,
};
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Compass size={32} />
      <p>{text}</p>
    </div>
  );
}
export default function Royale() {
  const pathname = usePathname(),
    router = useRouter(),
    page = resolvePage(pathname);
  const pageTitle =
    page === 'home'
      ? 'Início'
      : page === 'admin'
      ? 'Administração'
      : page === 'scratch'
        ? 'Raspadinha'
        : page === 'deposit'
          ? 'Depósitos'
        : page === 'withdrawal'
          ? 'Saques'
        : page === 'profile'
          ? 'Minha conta'
          : 'Roleta Vegas';
  const [data, setData] = useState<Bootstrap | null>(null),
    [prefs, setPrefs] = useState<Preferences>(defaults),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [rouletteAnimals, setRouletteAnimals] = useState<number[]>([16]),
    [selectedAnimals, setSelectedAnimals] = useState<number[]>([]),
    [search, setSearch] = useState(''),
    [modal, setModal] = useState<'auth' | 'notifications' | 'tutorial' | null>(null),
    [accountMenuOpen, setAccountMenuOpen] = useState(false),
    [menu, setMenu] = useState(false),
    [now, setNow] = useState(() => Date.now()),
    [tutorialStep, setTutorialStep] = useState(0),
    [wheel, setWheel] = useState<{ group: number | null; id: string | null }>({
      group: null,
      id: null,
    }),
    [splash, setSplash] = useState(true),
    [authMode, setAuthMode] = useState<'login' | 'register'>('login'),
    [passwordVisible, setPasswordVisible] = useState(false),
    [profileCpfInput, setProfileCpfInput] = useState('');
  const initialized = useRef(false),
    previousRounds = useRef(new Set<string>());
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const t = translations[prefs.locale];
  const activePage: Page =
    page === 'home'
      ? 'home'
      : page === 'admin'
      ? 'admin'
      : page === 'scratch'
        ? 'scratch'
        : page === 'deposit'
          ? 'deposit'
        : page === 'withdrawal'
          ? 'withdrawal'
        : page === 'profile'
          ? 'profile'
          : 'roulette';
  const recentPrizeItems = (() => {
    const items: {
      game: string;
      label: string;
      points: number;
      image: string;
      isResult: boolean;
    }[] = [];
    const seen = new Set<string>();
    const addItem = (item: (typeof items)[number]) => {
      const key = `${item.game}:${item.points}:${item.label}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    };

    for (const win of data?.recentWins ?? []) {
      addItem({ ...win, isResult: true });
    }
    if (data?.settings.scratch.enabled) {
      for (const game of data.settings.scratch.games ?? []) {
        if (!game.enabled) continue;
        for (const prize of game.prizes) {
          if (prize.points <= 0) continue;
          addItem({
            game: game.name,
            label: prize.label,
            points: prize.points,
            image: prize.image || '',
            isResult: false,
          });
        }
      }
    }
    return items.slice(0, 24);
  })();
  useEffect(() => {
    if (data && page !== activePage && pathname !== pagePaths[activePage])
      router.replace(pagePaths[activePage]);
  }, [activePage, data, page, pathname, router]);
  const navTitle = (id: Page) =>
    id === 'roulette'
      ? 'Roleta Vegas'
      : id === 'scratch'
        ? 'Raspadinha'
        : id === 'deposit'
          ? 'Depósitos'
        : id === 'withdrawal'
          ? 'Saques'
          : t[id as keyof typeof t];
  const notify = useCallback((s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 5000);
  }, []);
  const load = useCallback(async () => {
    try {
      const b = (await api('bootstrap')) as Bootstrap;
      if (!b.user?.email) {
        setData(b);
        setError('');
        return;
      }
      if (!initialized.current) {
        setPrefs({
          ...defaults,
          locale: b.settings.locale,
          sound: b.settings.sound,
          ...b.preferences,
        });
        const latest = b.rounds.find((r) => r.type === 'ROULETTE' && r.state === 'PUBLISHED');
        if (latest?.result?.group) setWheel({ group: latest.result.group, id: latest.id });
        initialized.current = true;
        previousRounds.current = new Set(
          b.rounds.filter((r) => r.state === 'PUBLISHED').map((r) => r.id),
        );
      } else {
        const fresh = b.rounds.find(
          (r) =>
            r.type === 'ROULETTE' && r.state === 'PUBLISHED' && !previousRounds.current.has(r.id),
        );
        if (fresh?.result?.group) {
          setWheel({ group: fresh.result.group, id: fresh.id });
          notify('Novo resultado publicado. A roleta está revelando o sorteio registrado.');
        }
        b.rounds
          .filter((r) => r.state === 'PUBLISHED')
          .forEach((r) => previousRounds.current.add(r.id));
      }
      setData(b);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void load(), 30000);
    if (sessionStorage.getItem('royale-splash-seen')) setSplash(false);
    else {
      sessionStorage.setItem('royale-splash-seen', '1');
      setTimeout(() => setSplash(false), 1100);
    }
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    return () => {
      clearInterval(timer);
      clearInterval(poll);
    };
  }, [load]);
  const userId = data?.user?.id;
  useEffect(() => {
    if (!userId) return;
    const source = new EventSource('/api/events');
    source.onmessage = () => void load();
    return () => source.close();
  }, [userId, load]);
  useEffect(() => {
    document.documentElement.lang = prefs.locale;
  }, [prefs.locale]);
  useEffect(() => {
    const legacy = () => {
      const hash = window.location.hash.slice(1) as Page;
      if (hash in pagePaths) router.replace(pagePaths[hash]);
    };
    legacy();
    window.addEventListener('hashchange', legacy);
    return () => window.removeEventListener('hashchange', legacy);
  }, [router]);
  const navigate = (p: Page) => {
    router.push(pagePaths[p]);
    setMenu(false);
    setAccountMenuOpen(false);
  };
  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target))
        setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const elements = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
        ) || [],
      );
    elements()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModal(null);
        return;
      }
      if (event.key === 'Tab') {
        const list = elements(),
          first = list[0],
          last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      previous?.focus();
    };
  }, [modal]);
  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const signOut = () => {
    setAccountMenuOpen(false);
    void act(async () => {
      await api('auth/logout', {});
      router.replace(pagePaths.home);
      notify('Sessão encerrada.');
    });
  };
  const savePrefs = async (next: Preferences) => {
    const prior = prefs;
    setPrefs(next);
    try {
      await api('preferences', next);
    } catch (e) {
      setPrefs(prior);
      throw e;
    }
  };
  const favorite = (id: number) =>
    void act(async () => {
      await savePrefs({
        ...prefs,
        favorites: prefs.favorites.includes(id)
          ? prefs.favorites.filter((x) => x !== id)
          : [...prefs.favorites, id],
      });
    });
  const open = data?.rounds.find((r) => r.type === 'ROULETTE' && r.state === 'OPEN');
  const published =
    data?.rounds.filter((r) => r.type === 'ROULETTE' && r.state === 'PUBLISHED') || [];
  const latestRouletteResult = published.find((round) => round.result?.group);
  const enabledScratchGames = data?.settings.scratch.games?.filter((game) => game.enabled).length ?? 0;
  const seconds = open
    ? Math.max(0, Math.ceil((new Date(open.locks_at).getTime() - now) / 1000))
    : 0;
  const countdown = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const rouletteRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const openRegistration = () => {
    setAuthMode('register');
    setModal('auth');
  };
  const participate = () => {
    if (!data?.user?.email) {
      openRegistration();
      return;
    }
    void act(async () => {
      if (!open) throw new Error('Aguarde a próxima rodada aberta');
      if (!rouletteAnimals.length) throw new Error('Selecione pelo menos um animal');
      const body = {
        roundId: open.id,
        mode: 'grupo',
        selection: rouletteAnimals.map(String).sort(),
        points: 10,
      };
      const fingerprint = JSON.stringify(body);
      if (rouletteRetry.current?.fingerprint !== fingerprint)
        rouletteRetry.current = { fingerprint, key: crypto.randomUUID() };
      const receipts = await api('entries/groups', { ...body, key: rouletteRetry.current!.key });
      rouletteRetry.current = null;
      notify(
        `Comprovante(s) registrado(s): ${receipts.length} animal(is), R$ ${(receipts.length * 10 / 100).toFixed(2).replace('.', ',')} utilizados.`,
      );
    });
  };
  const replay = () => {
    const latest = published.find((r) => r.type === 'ROULETTE');
    if (latest?.result?.group) {
      setWheel({ group: latest.result.group, id: `${latest.id}:${Date.now()}` });
      navigate('roulette');
    } else notify('Aguarde o primeiro resultado publicado.');
  };
  const filtered = animals.filter((a) =>
    `${a.name.toLocaleLowerCase()} ${String(a.id).padStart(2, '0')} ${a.tens.join(' ')}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .includes(
        search
          .toLocaleLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''),
      ),
  );
  if (!data || !data.user?.email)
    return (
      <main className="auth-gate">
        <img src="/bichos-vegas-logo.png" alt="Bichos Vegas" className="auth-gate-logo" />
        {!data && !error ? (
          <p>Carregando sua conta…</p>
        ) : (
          <section className="surface auth-gate-card">
            <span className="eyebrow">ACESSO BICHOS VEGAS</span>
            <h1>{authMode === 'register' ? 'Crie sua conta' : 'Entre na sua conta'}</h1>
            <p>
              Cadastre-se ou faça login para abrir o painel. Seus dados, bilhetes e movimentações
              ficam vinculados à sua conta.
            </p>
            {(error || toast) && <p className="auth-feedback" role="alert">{error || toast}</p>}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                void act(async () => {
                  await api(`auth/${authMode}`, {
                    name: values.get('name') || undefined,
                    cpf: values.get('cpf') || undefined,
                    email: values.get('email'),
                    password: values.get('password'),
                  });
                  initialized.current = false;
                });
              }}
            >
              {authMode === 'register' && (
                <>
                  <label className="field">
                    Nome
                    <input name="name" minLength={2} maxLength={60} required autoComplete="name" />
                  </label>
                  <label className="field">
                    CPF vinculado à conta
                    <input
                      name="cpf"
                      type="text"
                      inputMode="numeric"
                      minLength={14}
                      maxLength={14}
                      required
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      onInput={(event) => {
                        const input = event.currentTarget;
                        const digits = input.value.replace(/\D/g, '').slice(0, 11);
                        input.value = digits
                          .replace(/(\d{3})(\d)/, '$1.$2')
                          .replace(/(\d{3})(\d)/, '$1.$2')
                          .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                      }}
                    />
                    <small>Será salvo no seu perfil e usado para identificar sua conta.</small>
                  </label>
                </>
              )}
              <label className="field">
                E-mail
                <input name="email" type="email" required autoComplete="email" />
              </label>
              <label className="field">
                Senha
                <span className="auth-password-row">
                  <input
                    name="password"
                    type={passwordVisible ? 'text' : 'password'}
                    minLength={10}
                    maxLength={128}
                    required
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    className="auth-password-toggle"
                    type="button"
                    aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={passwordVisible}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                  >
                    {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                <small>Mínimo de 10 caracteres</small>
              </label>
              <button className="primary full" disabled={busy}>
                {busy
                  ? 'Aguarde…'
                  : authMode === 'register'
                    ? 'Criar conta e abrir painel'
                    : 'Entrar no painel'}
              </button>
            </form>
            <button
              className="text-link"
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            >
              {authMode === 'login' ? 'Ainda não tem conta? Cadastre-se' : 'Já tem conta? Entre'}
            </button>
          </section>
        )}
      </main>
    );
  return (
    <div
      className={`app ${prefs.theme === 'light' ? 'light-theme' : ''} ${prefs.accessible ? 'accessible' : ''}`}
      style={{ '--gold': data?.settings.accent || '#CBFF00' } as React.CSSProperties}
    >
      <a className="skip-link" href="#main">
        Ir para conteúdo
      </a>
      <AnimatePresence>
        {splash && (
          <motion.div className="splash" exit={{ opacity: 0 }}>
            <img className="splash-logo" src="/bichos-vegas-logo.png" alt="Bichos Vegas" />
            <div className="loading-line" />
          </motion.div>
        )}
      </AnimatePresence>
      <aside inert={!!modal} className={`sidebar ${menu ? 'mobile-open' : ''}`}>
        <button className="brand" onClick={() => navigate('home')} aria-label="Página inicial">
          {data?.settings.logo ? (
            <>
              <span className="brand-icon">
                <img src={data.settings.logo} alt="Logo da plataforma" />
              </span>
              <span>
                {data.settings.platform}
                <small>ROLETAS · RASPADINHA</small>
              </span>
            </>
          ) : (
            <img className="brand-lockup" src="/bichos-vegas-logo.png" alt="Bichos Vegas" />
          )}
        </button>
        <button className="menu-close" onClick={() => setMenu(false)} aria-label="Fechar menu">
          <X />
        </button>
        <div className="sidebar-section">MENU PRINCIPAL</div>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${activePage === n.id ? 'active' : ''}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{navTitle(n.id)}</span>
              {n.id === 'roulette' && <span className="nav-live">AO VIVO</span>}
              {activePage === n.id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <nav>
          {data?.user?.role === 'ADMIN' && (
            <button
              className={`nav-item ${page === 'admin' ? 'active' : ''}`}
              onClick={() => navigate('admin')}
            >
              <Users size={19} />
              {t.admin}
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="safe-note">
            <ShieldCheck size={24} />
            <b>Diversão com transparência</b>
            <p>
              Saldo 100% demonstrativo.
              <br />
              Experiência Bichos Vegas.
            </p>
            <button onClick={() => navigate('rules')}>
              Como funciona a roleta <ArrowUpRight size={13} />
            </button>
          </div>
          <button className="user-mini" onClick={() => navigate('profile')}>
            <span className="avatar">{data?.user?.name.slice(0, 1) || 'R'}</span>
            <span>
              <b>{data?.user?.name || 'Carregando…'}</b>
              <small>{data?.user?.guest ? 'Conta demonstrativa' : 'Membro Vegas'}</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <div className="app-body" inert={!!modal}>
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMenu(true)} aria-label="Abrir menu">
            <Menu />
          </button>
          <button className="top-brand" onClick={() => navigate('home')} aria-label="Bichos Vegas — início">
            <img src="/bichos-vegas-logo.png" alt="Bichos Vegas" />
          </button>
          <nav className="header-nav" aria-label="Navegação principal">
            <button className={activePage === 'home' ? 'active' : ''} onClick={() => navigate('home')}>
              <Home size={15} fill="currentColor" /> Início
            </button>
            <button className={activePage === 'roulette' ? 'active' : ''} onClick={() => navigate('roulette')}>
              <CircleDot size={15} /> Roletinha
            </button>
            <button className={activePage === 'scratch' ? 'active' : ''} onClick={() => navigate('scratch')}>
              <Ticket size={15} fill="currentColor" /> Raspadinhas
            </button>
            <button className="header-referral" onClick={() => notify('O programa de indicação ainda não está disponível.') }>
              <Gift size={16} fill="currentColor" /> Indique e Ganhe
            </button>
            {data?.user?.role === 'ADMIN' && (
              <button className={activePage === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}>
                <ShieldCheck size={15} /> Administração
              </button>
            )}
          </nav>
          <div className="top-actions">
            <button className="balance" onClick={() => navigate('profile')}>
              <b>{data?.user ? formatBRL(data.user.points) : '—'}</b>
              <ChevronRight size={13} />
            </button>
            <button className="header-money-action" onClick={() => navigate('deposit')}>
              <Wallet size={14} /> Depositar
            </button>
            <button className={`header-money-action ${activePage === 'withdrawal' ? 'active' : ''}`} onClick={() => navigate('withdrawal')}>
              <Wallet size={14} /> Sacar
            </button>
            <div className="account-menu-wrap" ref={accountMenuRef}>
              <button
                className="header-account"
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-label="Abrir menu da conta"
                aria-haspopup="true"
                aria-controls="account-dropdown"
                aria-expanded={accountMenuOpen}
              >
                <span className="avatar top-avatar">{data?.user?.name.slice(0, 1) || 'R'}</span>
                <b>{data?.user?.name || 'Minha conta'}</b>
                <ChevronDown size={14} />
              </button>
              {accountMenuOpen && (
                <div className="account-dropdown" id="account-dropdown" aria-label="Menu da conta">
                  <div className="account-dropdown-heading">
                    <span className="avatar account-dropdown-avatar">{data?.user?.name.slice(0, 1) || 'R'}</span>
                    <span><b>{data?.user?.name || 'Minha conta'}</b><small>{data?.user?.email || 'Conta demonstrativa'}</small></span>
                  </div>
                  <button onClick={() => navigate('profile')}>
                    <UserRound size={16} /> Minha conta <ChevronRight size={14} />
                  </button>
                  <button onClick={() => navigate('withdrawal')}>
                    <Wallet size={16} /> Minha carteira <ChevronRight size={14} />
                  </button>
                  {data?.user?.role === 'ADMIN' && (
                    <button onClick={() => navigate('admin')}>
                      <ShieldCheck size={16} /> Administração <ChevronRight size={14} />
                    </button>
                  )}
                  <div className="account-dropdown-divider" />
                  {data?.user?.guest ? (
                    <button className="account-dropdown-signout" onClick={() => { setAccountMenuOpen(false); setAuthMode('login'); setModal('auth'); }}>
                      <UserRound size={16} /> Entrar ou cadastrar <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button className="account-dropdown-signout" onClick={signOut}>
                      <LogOut size={16} /> Sair da conta <LogOut size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        {recentPrizeItems.length > 0 && activePage !== 'admin' && (
          <section
            className="prize-ticker"
            aria-label="Prêmios e resultados demonstrativos da raspadinha"
          >
            <div className="prize-ticker-title">
              <span className="prize-ticker-star" />
              <b>PRÊMIOS</b>
              <small>VIRTUAIS</small>
            </div>
            <div className="prize-ticker-viewport">
              <div className="prize-ticker-track">
                {[...recentPrizeItems, ...recentPrizeItems].map((item, index) => (
                  <article
                    className="prize-ticker-card"
                    key={`${item.game}-${item.label}-${index}`}
                    aria-hidden={index >= recentPrizeItems.length}
                  >
                    {item.image ? (
                      <PrizeImage src={item.image} alt="" />
                    ) : (
                      <Ticket size={22} />
                    )}
                    <span>
                      <small>{item.isResult ? 'RESULTADO DEMO' : item.game}</small>
                      <b>{displayPrizeLabel(item.label, item.points)}</b>
                      <em>{formatBRL(item.points)}</em>
                    </span>
                  </article>
                ))}
              </div>
            </div>
            <small className="prize-ticker-demo">MODO DEMONSTRAÇÃO</small>
          </section>
        )}
        <main id="main">
          {page !== 'home' && <div className="page-title">
            <div>
              <p className="eyebrow">
                {page === 'roulette'
                  ? 'BICHOS VEGAS'
                  : page === 'scratch'
                    ? 'RASPE E DESCUBRA'
                    : page === 'withdrawal'
                      ? 'SAQUES · MODO DEMONSTRAÇÃO'
                    : page === 'profile'
                      ? 'SUA CONTA'
                    : t.tagline.toUpperCase()}
              </p>
              <h1>
                {page === 'roulette' ? (
                  <>
                    Roleta <em>Vegas</em>
                  </>
                ) : (
                  pageTitle
                )}
              </h1>
              <p>
                {page === 'roulette'
                  ? 'Gire, veja os bichos premiados e confira as dezenas de cada grupo.'
                  : page === 'scratch'
                    ? 'Compre seu cartão com saldo e raspe para revelar o resultado.'
                    : page === 'deposit'
                      ? 'Acompanhe depósitos e veja as opções disponíveis para sua conta.'
                      : page === 'withdrawal'
                        ? 'Consulte a disponibilidade e o prazo demonstrativo para solicitações de saque.'
                      : page === 'profile'
                        ? 'Confira os dados da sua conta e acesse sua carteira virtual.'
                      : 'Uma experiência demonstrativa com regras claras e resultados verificáveis.'}
              </p>
            </div>
            <button
              className="subtle-button"
              onClick={() => {
                setTutorialStep(0);
                setModal('tutorial');
              }}
            >
              <HelpCircle size={16} />
              Como funciona <ArrowUpRight size={14} />
            </button>
          </div>}
          <div className="announcement">
            <ShieldCheck size={13} />
            {data?.settings.announcement || t.virtual}
          </div>
          {data?.user?.guest && (
            <div className="info-banner" role="status">
              <ShieldCheck size={19} />
              <span>
                Crie sua conta antes de registrar um bilhete. Seus dados e participações ficarão no
                seu perfil.
              </span>
              <button
                className="secondary"
                onClick={() => {
                  setAuthMode('register');
                  setModal('auth');
                }}
              >
                Cadastrar-se
              </button>
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={() => void load()}>Tentar novamente</button>
            </div>
          )}
          {!data ? (
            <div className="skeleton-grid">
              <div />
              <div />
              <div />
            </div>
          ) : (
            <>
              {page === 'home' && (
                <section className="home-page" aria-labelledby="home-headline">
                  <div className="home-hero">
                    <div className="home-hero-copy">
                      <span className="home-kicker"><Sparkles size={14} /> BICHOS VEGAS <i /> EXPERIÊNCIA DEMONSTRATIVA</span>
                      <h1 id="home-headline">A sorte entra em cena.<br /><em>Você escolhe o jogo.</em></h1>
                      <p>Entre no clima Vegas com a roletinha de 25 animais ou escolha uma raspadinha e descubra o resultado. Tudo em saldo demonstrativo.</p>
                      <div className="home-hero-actions">
                        <button className="primary" onClick={() => navigate('roulette')}>Ir para a roletinha <ArrowRight size={17} /></button>
                        <button className="secondary" onClick={() => navigate('scratch')}>Ver raspadinhas <Ticket size={16} /></button>
                      </div>
                      <small><ShieldCheck size={13} /> Saldo demonstrativo, sem valor de saque.</small>
                    </div>
                    <div className="home-hero-art" aria-label="Último resultado da roleta">
                      <div className="home-art-orbit home-art-orbit-one" />
                      <div className="home-art-orbit home-art-orbit-two" />
                      <span className="home-art-label"><span className="live-dot" /> ÚLTIMO GIRO PUBLICADO</span>
                      {latestRouletteResult?.result?.group ? <>
                        <AnimalArt id={latestRouletteResult.result.group} size={150} />
                        <b>{animals[latestRouletteResult.result.group - 1].name}</b>
                        <span className="home-result-tens">{animals[latestRouletteResult.result.group - 1].tens.join(' · ')}</span>
                        <span className="home-result-group">GRUPO {String(latestRouletteResult.result.group).padStart(2, '0')}</span>
                      </> : <>
                        <img className="home-brand-art" src="/bichos-vegas-logo.png" alt="Bichos Vegas" />
                        <b>O próximo giro vem aí</b>
                        <span className="home-result-tens">Acompanhe os resultados aqui</span>
                      </>}
                    </div>
                  </div>
                  <div className="home-mode-heading">
                    <div><span className="eyebrow">ESCOLHA SUA EXPERIÊNCIA</span><h2>Qual vai ser a sua?</h2></div>
                    <span>Dois jogos. Uma plataforma.</span>
                  </div>
                  <div className="home-mode-cards">
                    <button className="home-mode-card home-mode-roulette" onClick={() => navigate('roulette')}>
                      <span className="home-mode-icon"><CircleDot size={23} /></span>
                      <span className="home-mode-copy"><small>01 · ROLETA VEGAS</small><b>Escolha seus bichos</b><span>25 animais na roleta, com resultados publicados e conferíveis.</span></span>
                      <span className="home-mode-link">ABRIR <ArrowUpRight size={16} /></span>
                    </button>
                    <button className="home-mode-card home-mode-scratch" onClick={() => navigate('scratch')}>
                      <span className="home-mode-icon"><Ticket size={23} /></span>
                      <span className="home-mode-copy"><small>02 · RASPADINHAS</small><b>Raspe para descobrir</b><span>{enabledScratchGames ? `${enabledScratchGames} opções demonstrativas disponíveis` : 'Abra os cartões e veja o que aparece'}.</span></span>
                      <span className="home-mode-link">ABRIR <ArrowUpRight size={16} /></span>
                    </button>
                  </div>
                  <div className="home-trust-row">
                    <div><ShieldCheck size={17} /><span><b>Resultados publicados</b><small>Confira os giros recentes</small></span></div>
                    <div><Wallet size={17} /><span><b>Saldo demonstrativo</b><small>Sem depósitos ou saques reais</small></span></div>
                    <div><Ticket size={17} /><span><b>{data.scratchCards.length} cartões registrados</b><small>Seu histórico fica na conta</small></span></div>
                  </div>
                  {latestRouletteResult?.result?.group && <button className="home-results-link" onClick={() => navigate('roulette')}>Ver todos os resultados da roletinha <ArrowRight size={15} /></button>}
                </section>
              )}
              {page === 'roulette' && (
                <>
                  <section className="arena-grid">
                    <div className="arena">
                      <div className="arena-top">
                        <span className="eyebrow">
                          <CircleDot size={15} /> ROLETINHA VEGAS
                        </span>
                        <span className="badge green">
                          <span className="live-dot" /> AO VIVO
                        </span>
                      </div>
                      <div className="arena-heading">
                        <h2>{t.play}</h2>
                        <p>{data.settings.banner || t.subtitle}</p>
                      </div>
                      <Wheel
                        animations={data.settings.animations}
                        group={wheel.group}
                        roundId={wheel.id}
                        duration={data.settings.duration}
                        sound={prefs.sound}
                        onDone={() =>
                          notify(
                            'Resultado revelado e publicado abaixo em Últimos bichos premiados.',
                          )
                        }
                      />
                      <div className="arena-footer">
                        <span>
                          <ShieldCheck size={15} /> Resultado gerado no servidor
                        </span>
                        <span>25 setores · Distribuição uniforme</span>
                      </div>
                    </div>
                    <aside className="round-panel">
                      <div className="panel-heading">
                        <span className="eyebrow">SUA PRÓXIMA RODADA</span>
                        <CircleDot size={18} />
                      </div>
                      <h2>
                        A roleta está
                        <br />
                        <em>pronta para girar.</em>
                      </h2>
                      <div className="countdown">
                        <span>PARTICIPAÇÕES ENCERRAM EM</span>
                        <b>{open ? countdown : '—:—'}</b>
                        <small>
                          <span className="live-dot" />
                          {open
                            ? 'Rodada aberta'
                            : data.settings.paused
                              ? 'Novas rodadas pausadas'
                              : 'Preparando próxima rodada'}{' '}
                          {open && `· #${short(open.id)}`}
                        </small>
                      </div>
                      <div className="selected-animal">
                        {rouletteAnimals.length > 0 && (
                          <AnimalArt id={rouletteAnimals[0]} size={70} />
                        )}
                        <div>
                          <small>SUA ESCOLHA</small>
                          <b>
                            {rouletteAnimals.length
                              ? rouletteAnimals.map((id) => animals[id - 1].name).join(', ')
                              : 'Selecione seus animais'}
                          </b>
                          <span>{rouletteAnimals.length} animal(is) · R$ 0,10 cada</span>
                        </div>
                        <button
                          className="icon-button"
                          onClick={() =>
                            document
                              .getElementById('roulette-animal-picker')
                              ?.scrollIntoView({ behavior: 'smooth' })
                          }
                          aria-label="Alterar animal"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                      <div className="points-row">
                        <span>Participação demonstrativa</span>
                        <b>
                          {formatBRL(rouletteAnimals.length * 10)} <small>no total</small>
                        </b>
                      </div>
                      <button
                        className="primary full"
                        disabled={busy || !open || !rouletteAnimals.length}
                        onClick={participate}
                      >
                        {data.user?.email ? 'Participar da rodada' : 'Cadastre-se para participar'}{' '}
                        <ArrowRight size={18} />
                      </button>
                      <button className="secondary full" onClick={replay}>
                        <RefreshCw size={15} />
                        Rever último giro publicado
                      </button>
                      <p className="micro">
                        <LockKeyhole size={12} /> Saldo demonstrativo, sem valor de saque
                      </p>
                      <div className="panel-tip">
                        <Info size={17} />
                        <p>
                          O resultado é registrado antes da animação. Cada giro tem uma verificação
                          pública.
                        </p>
                      </div>
                    </aside>
                  </section>
                  <div className="metric-strip">
                    <Metric
                      icon={Wallet}
                      label="Seu saldo demonstrativo"
                      value={formatBRL(data.user?.points ?? 0)}
                      detail="Exclusivamente virtuais"
                    />
                    <Metric
                      icon={Compass}
                      label="Bilhetes na roleta"
                      value={data.entries.length}
                      detail="Acompanhe os bichos premiados"
                    />
                    <Metric
                      icon={Trophy}
                      label="Seleções que conferiram"
                      value={data.entries.filter((e) => e.outcome?.win).length}
                      detail="Conferência automática"
                    />
                    <Metric
                      icon={ShieldCheck}
                      label="Rodadas publicadas"
                      value={published.length}
                      detail="Sorteios verificáveis"
                    />
                  </div>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">SELECIONE NA ROLETA</span>
                      <h2>Quais bichos vão girar?</h2>
                    </div>
                  </div>
                  <div className="animal-grid" id="roulette-animal-picker">
                    {animals.map(({ id }) => (
                      <AnimalCard
                        busy={busy}
                        key={id}
                        id={id}
                        selected={rouletteAnimals.includes(id)}
                        favorite={prefs.favorites.includes(id)}
                        onSelect={() =>
                          setRouletteAnimals((current) =>
                            current.includes(id)
                              ? current.filter((n) => n !== id)
                              : [...current, id],
                          )
                        }
                        onFavorite={() => favorite(id)}
                      />
                    ))}
                  </div>
                  <div className="bottom-grid roulette-bottom-grid">
                    <section className="surface roulette-results">
                      <div className="section-heading tight">
                        <div>
                          <span className="eyebrow">RESULTADOS RECENTES</span>
                          <h2>Últimos bichos premiados</h2>
                        </div>
                        <span className="badge green">GIROS RECENTES</span>
                      </div>
                      {published.slice(0, 6).map((r) => (
                        <div className="recent-row" key={r.id}>
                          <span className="recent-icon">
                            {r.result?.group ? (
                              <AnimalArt id={r.result.group} size={40} />
                            ) : (
                              <Trophy size={19} />
                            )}
                          </span>
                          <div>
                            <b>
                              {r.result?.group
                                ? animals[r.result.group - 1].name
                                : 'Resultado da roleta'}
                            </b>
                            <small>
                              {r.result?.group
                                ? `Dezenas do grupo: ${animals[r.result.group - 1].tens.join(' · ')}`
                                : date(r.published_at!)}
                            </small>
                          </div>
                          <span className="result-number">
                            {r.result?.group
                              ? `GRUPO ${String(r.result.group).padStart(2, '0')}`
                              : r.result?.numbers[0]}
                          </span>
                          <button
                            className="text-link"
                            onClick={() =>
                              void act(async () => {
                                const verification = await api(`verify/${r.id}`);
                                if (!verification.valid)
                                  throw new Error('A verificação deste resultado falhou.');
                                notify('Integridade verificada com sucesso.');
                              })
                            }
                            aria-label="Verificar integridade"
                          >
                            <CheckCircle2 size={16} className="emerald" /> Verificar
                          </button>
                          <small className="recent-date">{date(r.published_at!)}</small>
                        </div>
                      ))}
                      {!published.length && (
                        <Empty text="O primeiro giro premiado aparecerá aqui." />
                      )}
                    </section>
                  </div>
                  <section className="surface roulette-results">
                    <div className="section-heading tight">
                      <div>
                        <span className="eyebrow">SEUS REGISTROS</span>
                        <h2>Meus bilhetes</h2>
                      </div>
                    </div>
                    <Tickets
                      version={JSON.stringify(data.entries.map((e) => [e.id, e.outcome]))}
                      notify={notify}
                    />
                  </section>
                </>
              )}
              {page === 'animals' && (
                <>
                  <div className="toolbar">
                    <label className="search-field">
                      <Search size={18} />
                      <input
                        placeholder="Busque por animal, grupo ou dezena"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <span>{filtered.length} animais encontrados</span>
                  </div>
                  <div className="animal-grid">
                    {filtered.map((a) => (
                      <AnimalCard
                        busy={busy}
                        key={a.id}
                        id={a.id}
                        selected={selectedAnimals.includes(a.id)}
                        favorite={prefs.favorites.includes(a.id)}
                        onSelect={() => {
                          setSelectedAnimals((current) =>
                            current.includes(a.id)
                              ? current.filter((id) => id !== a.id)
                              : [...current, a.id],
                          );
                        }}
                        onFavorite={() => favorite(a.id)}
                      />
                    ))}
                  </div>
                  {!filtered.length && <Empty text="Nenhum animal corresponde à sua busca." />}
                  <div className="sticky-selection">
                    <span>
                      Selecionados:{' '}
                      <b>
                        {selectedAnimals.length
                          ? selectedAnimals.map((id) => animals[id - 1].name).join(', ')
                          : 'Escolha seus animais'}
                      </b>
                    </span>
                    <button
                      className="primary"
                      disabled={!selectedAnimals.length}
                      onClick={() =>
                        router.push(`/modalidades/grupo?grupos=${selectedAnimals.join(',')}`)
                      }
                    >
                      Abrir modalidade de grupo <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              )}
              {page === 'scratch' && data.settings.scratch && (
                <Scratchcard
                  config={data.settings.scratch as ScratchConfig}
                  points={data.user?.points || 0}
                  history={data.scratchCards}
                  registered={!!data.user?.email}
                  request={api}
                  onRefresh={load}
                  onRegister={openRegistration}
                  onDeposit={() => navigate('deposit')}
                  notify={notify}
                />
              )}
              {page === 'deposit' && (
                <DepositScreen
                  pixEnabled={data.paymentsEnabled}
                  mpEnabled={data.mercadoPagoEnabled}
                  registered={!!data.user?.email}
                  points={data.user?.points || 0}
                  payerEmail={data.user?.email || ''}
                  onRegister={openRegistration}
                  onViewAccount={() => navigate('profile')}
                />
              )}
              {page === 'profile' && data.user && (
                <section className="account-profile-page">
                  <article className="surface account-profile-card">
                    <div className="account-profile-identity">
                      <span className="account-profile-avatar">{data.user.name.slice(0, 1).toUpperCase() || 'R'}</span>
                      <div>
                        <span className="eyebrow">PERFIL DA CONTA</span>
                        <h2>{data.user.name}</h2>
                        <p>{data.user.email || 'Sessão demonstrativa sem e-mail cadastrado'}</p>
                      </div>
                      <span className={`account-role ${data.user.role === 'ADMIN' ? 'admin' : ''}`}>
                        {data.user.guest ? 'DEMONSTRAÇÃO' : data.user.role === 'ADMIN' ? 'ADMINISTRADOR' : 'MEMBRO'}
                      </span>
                    </div>
                    <div className="account-profile-actions">
                      {data.user.guest ? (
                        <button className="primary" onClick={() => { setAuthMode('login'); setModal('auth'); }}>
                          Entrar ou criar conta <ArrowRight size={15} />
                        </button>
                      ) : (
                        <button className="secondary" onClick={signOut}>
                          <LogOut size={15} /> Sair da conta
                        </button>
                      )}
                    </div>
                  </article>
                  <article className="surface account-profile-wallet">
                    <div className="account-profile-wallet-icon"><Wallet size={19} /></div>
                    <span className="eyebrow">CARTEIRA VIRTUAL</span>
                    <strong>{formatBRL(data.user.points)} <small>saldo</small></strong>
                    <p>Saldo para usar nas modalidades.</p>
                    <button className="primary" onClick={() => navigate('withdrawal')}>
                      Ver carteira <ArrowRight size={15} />
                    </button>
                  </article>
                  <article className="surface account-profile-settings">
                    <span className="eyebrow">CONFIGURAÇÕES DA CONTA</span>
                    <h3>CPF do perfil</h3>
                    <p>{data.user.cpf ? `CPF atual: ${data.user.cpf}` : 'Nenhum CPF cadastrado ainda.'} Informe um CPF válido para vincular ou atualizar seus dados.</p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void act(async () => {
                          const result = await api('profile', { cpf: profileCpfInput });
                          setProfileCpfInput('');
                          initialized.current = false;
                          await load();
                          notify(result.cpf ? 'CPF da conta atualizado.' : 'CPF atualizado.');
                        });
                      }}
                    >
                      <label className="field">
                        Novo CPF
                        <input
                          value={profileCpfInput}
                          onChange={(event) => {
                            const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
                            const formatted = digits
                              .replace(/(\d{3})(\d)/, '$1.$2')
                              .replace(/(\d{3})(\d)/, '$1.$2')
                              .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                            setProfileCpfInput(formatted);
                          }}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="000.000.000-00"
                          maxLength={14}
                          required
                        />
                      </label>
                      <button className="primary" disabled={busy || profileCpfInput.replace(/\D/g, '').length !== 11}>
                        {busy ? 'Salvando…' : 'Salvar CPF'}
                      </button>
                    </form>
                  </article>
                </section>
              )}
              {page === 'withdrawal' && (
                <WithdrawalScreen registered={!!data.user?.email} />
              )}
              {activePage === 'admin' &&
                (data.user?.role === 'ADMIN' ? (
                  <Admin notify={notify} refresh={load} />
                ) : (
                  <section className="surface prose">
                    <ShieldCheck size={40} />
                    <h2>Acesso administrativo</h2>
                    <p>
                      Entre com uma conta autorizada. As permissões são verificadas no servidor.
                    </p>
                    <button className="primary" onClick={() => setModal('auth')}>
                      Entrar <ArrowRight size={16} />
                    </button>
                  </section>
                ))}
            </>
          )}
          <footer>
            <span>
              ★ BICHOS VEGAS <small>© 2026</small>
            </span>
            <p>{t.virtual}</p>
            <button onClick={() => navigate('rules')}>
              <ShieldCheck size={13} />
              Transparência em cada rodada
            </button>
          </footer>
        </main>
      </div>
      <nav className="mobile-bottom" inert={!!modal}>
        {navigation.map((n) => (
          <button
            key={n.id}
            className={activePage === n.id ? 'active' : ''}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={20} />
            <span>{n.id === 'scratch' ? 'Raspadinha' : 'Roleta'}</span>
          </button>
        ))}
      </nav>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Info size={19} />
            <span>{toast}</span>
            <button onClick={() => setToast('')} aria-label="Fechar aviso">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (modal === 'tutorial') void act(() => savePrefs({ ...prefs, tutorial: true }));
            setModal(null);
          }}
        >
          <section
            className="modal surface"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === 'auth'
                ? 'Acesso à conta'
                : modal === 'notifications'
                  ? 'Notificações'
                  : 'Tutorial'
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Fechar diálogo"
              onClick={() => {
                if (modal === 'tutorial') void act(() => savePrefs({ ...prefs, tutorial: true }));
                setModal(null);
              }}
            >
              <X />
            </button>
            {modal === 'auth' && (
              <>
                <Crown className="gold-text" size={36} />
                <h2>
                  {authMode === 'login' ? 'Bem-vindo de volta.' : 'Sua experiência começa aqui.'}
                </h2>
                <p>
                  {authMode === 'login'
                    ? 'Entre na sua conta Vegas.'
                    : 'Crie uma conta gratuita com saldo demonstrativo.'}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(async () => {
                      await api(`auth/${authMode}`, {
                        name: f.get('name') || undefined,
                        fullName: f.get('fullName') || undefined,
                        cpf: f.get('cpf') || undefined,
                        email: f.get('email'),
                        password: f.get('password'),
                      });
                      initialized.current = false;
                      setModal(null);
                      notify('Acesso realizado com sucesso.');
                    });
                  }}
                >
                  {authMode === 'register' && (
                    <>
                      <label className="field">
                        Nome de exibição
                        <input
                          name="name"
                          minLength={2}
                          maxLength={60}
                          required
                          autoComplete="name"
                          placeholder="Como você quer aparecer"
                        />
                      </label>
                      <label className="field">
                        Nome completo
                        <input
                          name="fullName"
                          minLength={2}
                          maxLength={120}
                          required
                          autoComplete="name"
                          placeholder="Para saques via Pix"
                        />
                      </label>
                      <label className="field">
                        CPF
                        <input
                          name="cpf"
                          type="text"
                          minLength={11}
                          maxLength={14}
                          required
                          autoComplete="off"
                          placeholder="000.000.000-00"
                          onInput={(e) => {
                            const target = e.currentTarget;
                            const v = target.value.replace(/\D/g, '').slice(0, 11);
                            target.value = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                          }}
                        />
                      </label>
                    </>
                  )}
                  <label className="field">
                    E-mail
                    <input name="email" type="email" required autoComplete="email" />
                  </label>
                  <label className="field">
                    Senha
                    <span className="auth-password-row">
                      <input
                        name="password"
                        type={passwordVisible ? 'text' : 'password'}
                        minLength={10}
                        maxLength={128}
                        required
                        autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      />
                      <button
                        className="auth-password-toggle"
                        type="button"
                        aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                        aria-pressed={passwordVisible}
                        onClick={() => setPasswordVisible((visible) => !visible)}
                      >
                        {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </span>
                    <small>Mínimo de 10 caracteres</small>
                  </label>
                  <button className="primary full" disabled={busy} type="submit">
                    {busy ? 'Aguarde…' : authMode === 'login' ? 'Entrar' : 'Criar conta'}
                    <ArrowRight size={16} />
                  </button>
                </form>
                <button
                  className="text-link"
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                >
                  {authMode === 'login'
                    ? 'Ainda não tem conta? Cadastre-se'
                    : 'Já tem conta? Entre'}
                </button>
              </>
            )}
            {modal === 'notifications' && (
              <>
                <h2>Seu centro de notificações</h2>
                <button
                  className="text-link"
                  onClick={() =>
                    void act(async () => {
                      await api('notifications/read', {});
                      notify('Notificações marcadas como lidas.');
                    })
                  }
                >
                  <Check size={16} />
                  Marcar todas como lidas
                </button>
                {data?.notifications.map((n) => (
                  <div className={`notification ${!n.read ? 'unread' : ''}`} key={n.id}>
                    <Bell size={17} />
                    <div>
                      <p>{n.message}</p>
                      <small>{date(n.created_at)}</small>
                    </div>
                  </div>
                ))}
                {!data?.notifications.length && (
                  <Empty text="Seus resultados aparecerão aqui após uma participação." />
                )}
              </>
            )}
            {modal === 'tutorial' && (
              <>
                <span className="eyebrow">PASSO {tutorialStep + 1} DE 3</span>
                <div className="tutorial-art">
                  {tutorialStep === 0 ? (
                    <PawPrint size={56} />
                  ) : tutorialStep === 1 ? (
                    <CircleDot size={56} />
                  ) : (
                    <ShieldCheck size={56} />
                  )}
                </div>
                <h2>
                  {
                    ['Conheça seu animal.', 'Viva cada rodada.', 'Confira com transparência.'][
                      tutorialStep
                    ]
                  }
                </h2>
                <p>
                  {
                    [
                      'Escolha um ou mais bichos para acompanhar no próximo giro.',
                      'Use saldo demonstrativo para registrar uma participação. Aguarde o encerramento: o servidor gera o resultado e a roleta o revela.',
                      'Seu comprovante mostra a conferência. Nos resultados recentes, você verifica a semente e o compromisso criptográfico. Tudo é demonstrativo.',
                    ][tutorialStep]
                  }
                </p>
                <button
                  className="primary full"
                  onClick={() => {
                    if (tutorialStep < 2) setTutorialStep((s) => s + 1);
                    else
                      void act(async () => {
                        await savePrefs({ ...prefs, tutorial: true });
                        setModal(null);
                      });
                  }}
                >
                  {tutorialStep < 2 ? 'Próximo' : 'Começar a explorar'}
                  <ArrowRight size={16} />
                </button>
                <div className="tutorial-dots">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className={i === tutorialStep ? 'active' : ''} />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Wallet;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="metric">
      <span className="metric-icon">
        <Icon size={20} />
      </span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <span>{detail}</span>
      </div>
    </div>
  );
}
function AnimalCard({
  id,
  selected,
  favorite,
  onSelect,
  onFavorite,
  busy = false,
}: {
  busy?: boolean;
  id: number;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onFavorite: () => void;
}) {
  const a = animals[id - 1];
  return (
    <article className={`animal-card ${selected ? 'selected' : ''}`}>
      <div className="animal-card-top">
        <span>{String(id).padStart(2, '0')}</span>
        <button
          className={favorite ? 'favorite active' : 'favorite'}
          disabled={busy}
          onClick={onFavorite}
          aria-label={`${favorite ? 'Remover' : 'Adicionar'} ${a.name} ${favorite ? 'dos' : 'aos'} favoritos`}
        >
          <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <button className="animal-select" onClick={onSelect} aria-pressed={selected}>
        <AnimalArt id={id} size={88} />
        <b>{a.name}</b>
        <span>{a.tens.join(' · ')}</span>
        <small>
          {selected ? (
            <>
              <Check size={12} />
              Selecionado
            </>
          ) : (
            <>
              Selecionar <ChevronRight size={12} />
            </>
          )}
        </small>
      </button>
    </article>
  );
}
