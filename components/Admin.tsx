'use client';
import { formatBRL as brl, displayPrizeLabel } from '@/lib/money';

const historyMoneyFields: Record<string, string> = {
  points: 'valor',
  amount: 'movimentação',
  amount_cents: 'valor',
  balance: 'saldo',
  price_points: 'preço',
  prize_points: 'prêmio',
  pricePoints: 'preço',
  costPoints: 'custo',
  prizePoints: 'prêmio',
  balanceAfter: 'saldo após movimentação',
};

function formatHistoryValue(_key: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(row).map(([key, item]) => {
    if (key === 'prize_label' && typeof item === 'string' && typeof row.prize_points === 'number')
      return ['resultado', displayPrizeLabel(item, row.prize_points)];
    if (Object.hasOwn(historyMoneyFields, key) && typeof item === 'number')
      return [historyMoneyFields[key], brl(item)];
    return [key, item];
  }));
}
import { useEffect, useState } from 'react';
import {
  Users,
  CalendarDays,
  ShieldCheck,
  Settings,
  FileText,
  Search,
  Activity,
  ArrowRight,
  CheckCircle2,
  Wallet,
  Ticket,
  Plus,
  Trash2,
  RefreshCw,
  CircleDot,
} from 'lucide-react';
import { api, type Round } from './Royale';
import { animals } from '@/lib/game';
import { AnimalArt } from './AnimalArt';
import type { ScratchConfig } from '@/lib/scratchcards';
type User = {
  id: string;
  name: string;
  email: string | null;
  role: 'USER' | 'ADMIN';
  blocked: number;
  points: number;
  created_at: string;
};
type SettingsData = {
  platform: string;
  paused: boolean;
  duration: number;
  announcement: string;
  scheduleSeconds: number;
  logo: string;
  accent: string;
  banner: string;
  locale: 'pt' | 'en' | 'es';
  sound: boolean;
  animations: boolean;
  rules: { positions: number; passeSecond: number };
  scratch: ScratchConfig;
};
type AdminData = {
  users: User[];
  rounds: Round[];
  audit: {
    seq: number;
    action: string;
    actor: string | null;
    detail: string;
    created_at: string;
    hash: string;
  }[];
  auditValid: boolean | null;
  counts: {
    users: number;
    registered: number;
    active: number;
    entries: number;
    rounds: number;
    scheduled: number;
    errors: number;
  };
  settings: SettingsData;
};
type PixDeposit = {
  id: string;
  txid: string;
  amount_cents: number;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  e2e_id: string | null;
  name: string;
  email: string | null;
};
type MPDeposit = {
  id: string;
  external_reference: string;
  amount_cents: number;
  payment_method: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  payment_id: string | null;
  qr_code?: string;
  qr_code_base64?: string;
  ticket_url?: string;
  name: string;
  email: string | null;
};
type AdminReport = {
  roulette: { entries: number; pointsWagered: number; winningEntries: number; prizePoints: number };
  scratch: { cards: number; pointsSpent: number; prizePoints: number; netPoints: number };
  pix: { confirmedCents: number; pendingCents: number; confirmedCount: number; pendingCount: number; otherCount: number };
  withdrawals: { count: number; amountCents: number; configured: boolean };
  events: {
    id: string;
    category: 'ROULETTE' | 'SCRATCH' | 'PIX' | 'CREDITOS';
    action: string;
    created_at: string;
    user_id: string;
    name: string;
    email: string | null;
    detail: Record<string, unknown>;
  }[];
  limited: boolean;
};

export default function Admin({
  notify,
  refresh,
}: {
  notify: (s: string) => void;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState('overview'),
    [data, setData] = useState<AdminData | null>(null),
    [config, setConfig] = useState<SettingsData | null>(null),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [inspect, setInspect] = useState<unknown>(null),
    [error, setError] = useState(''),
    [report, setReport] = useState<AdminReport | null>(null),
    [reportFrom, setReportFrom] = useState(''),
    [reportTo, setReportTo] = useState(''),
    [reportSearch, setReportSearch] = useState(''),
    [reportFilter, setReportFilter] = useState(''),
    [reportReload, setReportReload] = useState(0),
    [reportLoading, setReportLoading] = useState(false);
  const [auditStatus, setAuditStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'error'>('idle');
  const [pixStatus, setPixStatus] = useState<{
    configured: boolean;
    environment?: string;
    pixKeyHint?: string;
    paymentsEnabled: boolean;
  } | null>(null);
  const [pixDeposits, setPixDeposits] = useState<PixDeposit[]>([]);
  const [mpStatus, setMpStatus] = useState<{
    configured: boolean;
    environment?: string;
    paymentsEnabled: boolean;
  } | null>(null);
  const [mpDeposits, setMpDeposits] = useState<MPDeposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const load = async () => {
    try {
      const d = await api('admin');
      setData(d);
      setConfig(d.settings);
      setError('');
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    // Optional payment data must not hold the entire admin dashboard hostage.
    // This keeps core admin sections available even when Pix setup is absent or
    // its provider/database query is temporarily unavailable.
    const [status, deposits, mpStatus, mpDeposits, withdrawalsResult] = await Promise.allSettled([
      api('admin/efi'),
      api('admin/pix-deposits'),
      api('admin/mercadopago'),
      api('admin/mercadopago-deposits'),
      api('admin/withdrawals'),
    ]);
    if (status.status === 'fulfilled') setPixStatus(status.value);
    if (deposits.status === 'fulfilled') setPixDeposits(deposits.value);
    if (mpStatus.status === 'fulfilled') setMpStatus(mpStatus.value);
    if (mpDeposits.status === 'fulfilled') setMpDeposits(mpDeposits.value);
    if (withdrawalsResult.status === 'fulfilled') setWithdrawals(withdrawalsResult.value);
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (tab !== 'audit' || auditStatus !== 'idle') return;
    setAuditStatus('checking');
    void api('admin/audit-verify')
      .then((result) => setAuditStatus(result.valid ? 'valid' : 'invalid'))
      .catch(() => setAuditStatus('error'));
  }, [tab, auditStatus]);
  useEffect(() => {
    if (tab !== 'reports' && tab !== 'overview' && tab !== 'withdrawals') return;
    const query = new URLSearchParams();
    if (reportFrom) query.set('from', reportFrom);
    if (reportTo) query.set('to', reportTo);
    if (reportFilter.trim()) query.set('q', reportFilter.trim());
    setReportLoading(true);
    void api(`admin/reports${query.size ? `?${query.toString()}` : ''}`)
      .then(setReport)
      .catch((e) => setError((e as Error).message))
      .finally(() => setReportLoading(false));
  }, [tab, reportFrom, reportTo, reportFilter, reportReload]);
  const action = async (path: string, body: unknown) => {
    if (busy) return;
    setBusy(true);
    try {
      await api(path, body);
      await load();
      await refresh();
      notify('Operação administrativa registrada em auditoria.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-layout">
      <div className="admin-banner">
        <ShieldCheck size={27} />
        <div>
          <b>
            VEGAS CONTROL <span>ADMIN</span>
          </b>
          <small>Gestão, operação e integridade em um só lugar.</small>
        </div>
        <span className="badge green">RBAC ATIVO</span>
      </div>
      <nav className="admin-tabs">
        {[
          { id: 'overview', label: 'Visão geral', icon: Activity },
          { id: 'users', label: 'Usuários', icon: Users },
          { id: 'rounds', label: 'Rodadas e agendamentos', icon: CalendarDays },
          { id: 'pix', label: 'Pix Efí', icon: Wallet },
          { id: 'mercadopago', label: 'Mercado Pago', icon: Wallet },
          { id: 'withdrawals', label: 'Saques', icon: Wallet },
          { id: 'reports', label: 'Vendas e movimentações', icon: Activity },
          { id: 'scratch', label: 'Raspadinha', icon: Ticket },
          { id: 'results', label: 'Bichos premiados', icon: ShieldCheck },
          { id: 'settings', label: 'Configurações', icon: Settings },
          { id: 'content', label: 'Conteúdo', icon: FileText },
          { id: 'audit', label: 'Auditoria', icon: ShieldCheck },
        ].map((x) => (
          <button
            key={x.id}
            onClick={() => {
              setTab(x.id);
              setInspect(null);
            }}
            className={tab === x.id ? 'active' : ''}
          >
            <x.icon size={17} />
            {x.label}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {!data || !config ? (
        <div className="surface" role="status">
          <p>Não foi possível carregar os dados da administração.</p>
          <button onClick={() => void load()} disabled={busy}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {tab === 'overview' && (
            <>
              <header className="admin-overview-heading">
                <div>
                  <span className="admin-eyebrow">PAINEL DE CONTROLE</span>
                  <h2>Resumo da operação</h2>
                  <p>Veja o movimento da plataforma e acesse cada área sem precisar adivinhar.</p>
                </div>
                <button className="secondary" disabled={busy || reportLoading} onClick={() => {
                  void load();
                  setReportReload((value) => value + 1);
                }}>
                  <RefreshCw size={15} className={reportLoading ? 'admin-spinning' : ''} />
                  Atualizar dados
                </button>
              </header>
              <div className="admin-metrics admin-overview-metrics">
                <article className="surface admin-stat-card admin-stat-users">
                  <span className="admin-stat-icon"><Users size={19} /></span>
                  <small>APOSTADORES</small>
                  <strong>{data.counts.registered.toLocaleString('pt-BR')}</strong>
                  <p>{data.counts.active} com sessão ativa agora · {data.counts.users} contas no total</p>
                </article>
                <article className="surface admin-stat-card admin-stat-roulette">
                  <span className="admin-stat-icon"><CircleDot size={19} /></span>
                  <small>ROLETINHA</small>
                  <strong>{report ? report.roulette.entries.toLocaleString('pt-BR') : '—'}</strong>
                  <p>{report ? `${brl(report.roulette.pointsWagered)} movimentados` : 'Carregando movimentação…'}</p>
                </article>
                <article className="surface admin-stat-card admin-stat-scratch">
                  <span className="admin-stat-icon"><Ticket size={19} /></span>
                  <small>RASPADINHAS</small>
                  <strong>{report ? report.scratch.cards.toLocaleString('pt-BR') : '—'}</strong>
                  <p>{report ? `${brl(report.scratch.pointsSpent)} usados` : 'Carregando movimentação…'}</p>
                </article>
                <article className="surface admin-stat-card admin-stat-rounds">
                  <span className="admin-stat-icon"><CalendarDays size={19} /></span>
                  <small>RODADAS</small>
                  <strong>{data.counts.rounds.toLocaleString('pt-BR')}</strong>
                  <p>{data.counts.scheduled} abertas ou agendadas · {data.counts.entries} participações</p>
                </article>
              </div>
              {reportLoading && !report && <p className="admin-inline-loading" role="status">Buscando o resumo dos jogos…</p>}
              <div className="admin-game-summaries">
                <section className="surface admin-game-summary">
                  <div className="admin-section-title">
                    <span className="admin-stat-icon"><CircleDot size={18} /></span>
                    <div><h3>Roletinha</h3><p>Atividade registrada na roleta</p></div>
                    <button className="text-link" onClick={() => setTab('reports')}>Ver detalhes <ArrowRight size={14} /></button>
                  </div>
                  {report ? <div className="admin-game-numbers">
                    <div><small>Participações</small><b>{report.roulette.entries.toLocaleString('pt-BR')}</b></div>
                    <div><small>R$ usados</small><b>{brl(report.roulette.pointsWagered)}</b></div>
                    <div><small>Resultados conferidos</small><b>{report.roulette.winningEntries.toLocaleString('pt-BR')}</b></div>
                  </div> : <p className="admin-inline-loading">O resumo será exibido assim que carregar.</p>}
                  <p className="admin-help-text">Abra “Vendas e movimentações” para filtrar por data e apostador.</p>
                </section>
                <section className="surface admin-game-summary">
                  <div className="admin-section-title">
                    <span className="admin-stat-icon"><Ticket size={18} /></span>
                    <div><h3>Raspadinhas</h3><p>Compras e prêmios registrados</p></div>
                    <button className="text-link" onClick={() => setTab('scratch')}>Administrar <ArrowRight size={14} /></button>
                  </div>
                  {report ? <div className="admin-game-numbers">
                    <div><small>Cartões comprados</small><b>{report.scratch.cards.toLocaleString('pt-BR')}</b></div>
                    <div><small>Valor usado</small><b>{brl(report.scratch.pointsSpent)}</b></div>
                    <div><small>Valor em prêmios</small><b>{brl(report.scratch.prizePoints)}</b></div>
                  </div> : <p className="admin-inline-loading">O resumo será exibido assim que carregar.</p>}
                  <p className="admin-help-text">Altere preço, prêmios, chances e disponibilidade na aba “Raspadinha”.</p>
                </section>
              </div>
              <div className="admin-overview-bottom">
                <section className="surface admin-activity-card">
                  <div className="admin-section-title">
                    <span className="admin-stat-icon"><Activity size={18} /></span>
                    <div><h3>Atividade recente</h3><p>Últimas ações de jogadores</p></div>
                    <button className="text-link" onClick={() => setTab('reports')}>Abrir histórico <ArrowRight size={14} /></button>
                  </div>
                  {report?.events.slice(0, 6).map((event) => <div className="admin-event-row" key={`${event.category}-${event.id}`}>
                    <span className={`admin-event-dot admin-event-${event.category.toLowerCase()}`} />
                    <div><b>{event.name}</b><small>{event.action.replaceAll('_', ' ')} · {event.category === 'PIX' ? 'Pix' : event.category === 'SCRATCH' ? 'Raspadinha' : event.category === 'ROULETTE' ? 'Roletinha' : 'Saldo'}</small></div>
                    <time>{new Date(event.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
                    <button className="text-link" aria-label={`Ver evento de ${event.name}`} onClick={() => setInspect(event)}>Ver</button>
                  </div>)}
                  {report && !report.events.length && <p className="admin-empty-state">Ainda não há movimentações para mostrar. Quando alguém jogar, os eventos aparecerão aqui.</p>}
                  {!report && <p className="admin-empty-state">Carregando atividade…</p>}
                </section>
                <aside className="surface admin-status-card">
                  <div className="admin-section-title"><span className="admin-stat-icon"><ShieldCheck size={18} /></span><div><h3>Situação do sistema</h3><p>Integridade e recebimentos</p></div></div>
                  <div className="admin-status-line"><span className={`admin-status-dot ${auditStatus === 'valid' ? 'is-ok' : auditStatus === 'invalid' ? 'is-error' : ''}`} /><span>Auditoria</span><b>{auditStatus === 'valid' ? 'Íntegra' : auditStatus === 'invalid' ? 'Revisar' : 'Sob demanda'}</b></div>
                  <div className="admin-status-line"><span className={`admin-status-dot ${pixStatus?.paymentsEnabled ? 'is-ok' : ''}`} /><span>Pix Efí</span><b>{pixStatus?.paymentsEnabled ? 'Ativo' : pixStatus?.configured ? 'Configurado · pausado' : 'Não configurado'}</b></div>
                  <div className="admin-status-line"><span className={`admin-status-dot ${mpStatus?.paymentsEnabled ? 'is-ok' : ''}`} /><span>Mercado Pago</span><b>{mpStatus?.paymentsEnabled ? 'Ativo' : mpStatus?.configured ? 'Configurado · pausado' : 'Não configurado'}</b></div>
                  <div className="admin-status-line"><span className="admin-status-dot" /><span>Depósitos confirmados</span><b>{report ? `${brl(report.pix.confirmedCents)} · ${report.pix.confirmedCount}` : '—'}</b></div>
                  <div className="admin-status-line"><span className="admin-status-dot" /><span>Depósitos pendentes</span><b>{report ? `${brl(report.pix.pendingCents)} · ${report.pix.pendingCount}` : '—'}</b></div>
                  <div className="admin-status-line"><span className="admin-status-dot" /><span>Saques</span><b>Não configurados</b></div>
                  <div className="admin-status-line"><span className="admin-status-dot" /><span>Falhas de login</span><b>{data.counts.errors}</b></div>
                  <p className="admin-help-text">Valores usados na roleta e nas raspadinhas.</p>
                  <button className="secondary admin-status-action" onClick={() => setTab('audit')}>Consultar auditoria <ArrowRight size={14} /></button>
                </aside>
              </div>
            </>
          )}
          {tab === 'users' && (
            <section className="surface">
              <label className="search-field">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar nome ou e-mail"
                />
              </label>
              <div className="scroll-table">
                <table>
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Cadastro</th>
                      <th>Função</th>
                      <th>R$</th>
                      <th>Estado</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users
                      .filter((u) =>
                        `${u.name} ${u.email || ''}`.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((u) => (
                        <tr key={u.id}>
                          <td>
                            <b>{u.name}</b>
                            <small>{u.email || 'Visitante'}</small>
                          </td>
                          <td>
                            {u.email ? (
                              <span className="badge green">Cadastrado</span>
                            ) : (
                              <span className="badge">Visitante</span>
                            )}
                          </td>
                          <td>
                            <select
                              aria-label={`Permissão de ${u.name}`}
                              disabled={busy}
                              value={u.role}
                              onChange={(e) =>
                                void action('admin/users', {
                                  id: u.id,
                                  blocked: !!u.blocked,
                                  role: e.target.value,
                                })
                              }
                            >
                              <option value="USER">Usuário</option>
                              <option value="ADMIN">Administrador</option>
                            </select>
                          </td>
                          <td>{brl(u.points)}</td>
                          <td>
                            <span className={`badge ${u.blocked ? '' : 'green'}`}>
                              {u.blocked ? 'Bloqueado' : 'Ativo'}
                            </span>
                          </td>
                          <td>
                            <button
                              className="text-link"
                              disabled={busy}
                              onClick={() =>
                                void action('admin/users', {
                                  id: u.id,
                                  role: u.role,
                                  blocked: !u.blocked,
                                })
                              }
                            >
                              {u.blocked ? 'Reativar' : 'Bloquear'}
                            </button>
                            <button
                              className="text-link"
                              onClick={() =>
                                void api(`admin/user-history?id=${u.id}`)
                                  .then(setInspect)
                                  .catch((e) => notify(e.message))
                              }
                            >
                              Histórico / logs
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {tab === 'rounds' && (
            <>
              <section className="surface">
                <h2>Agendar giro da roleta</h2>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action('admin/rounds', {
                      action: 'schedule',
                      type: 'ROULETTE',
                      opensAt: new Date(String(f.get('opens'))).toISOString(),
                      seconds: Number(f.get('seconds')),
                    });
                  }}
                >
                  <label className="field">
                    Abertura
                    <input type="datetime-local" name="opens" required />
                  </label>
                  <label className="field">
                    Duração das inscrições (s)
                    <input
                      name="seconds"
                      type="number"
                      min={15}
                      max={86400}
                      defaultValue={90}
                      required
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Agendar <ArrowRight size={15} />
                  </button>
                </form>
              </section>
              <section className="surface">
                <div className="scroll-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Rodada</th>
                        <th>Abertura</th>
                        <th>Estado</th>
                        <th>Operações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rounds
                        .filter((r) => r.type === 'ROULETTE')
                        .map((r) => (
                          <tr key={r.id}>
                            <td>#{r.id.slice(0, 8)}</td>
                            <td>{new Date(r.opens_at).toLocaleString('pt-BR')}</td>
                            <td>{r.state}</td>
                            <td>
                              {r.state === 'SCHEDULED' && (
                                <button
                                  className="text-link"
                                  disabled={busy}
                                  onClick={() =>
                                    void action('admin/rounds', { action: 'cancel', id: r.id })
                                  }
                                >
                                  Cancelar
                                </button>
                              )}
                              {r.state === 'OPEN' && (
                                <button
                                  className="text-link"
                                  disabled={busy}
                                  onClick={() =>
                                    void action('admin/rounds', { action: 'lock', id: r.id })
                                  }
                                >
                                  Encerrar e publicar
                                </button>
                              )}
                              {r.state === 'PUBLISHED' && (
                                <button
                                  className="text-link"
                                  onClick={() =>
                                    void api(`verify/${r.id}`)
                                      .then(setInspect)
                                      .catch((e) => notify(e.message))
                                  }
                                >
                                  Verificar
                                </button>
                              )}
                              <button
                                className="text-link"
                                onClick={() =>
                                  void api(`admin/participants?id=${r.id}`)
                                    .then(setInspect)
                                    .catch((e) => notify(e.message))
                                }
                              >
                                Participantes
                              </button>
                              <button
                                className="text-link"
                                onClick={() =>
                                  setInspect(data.audit.filter((x) => x.detail.includes(r.id)))
                                }
                              >
                                Logs
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === 'pix' && (
            <>
              <section className="surface">
                <h2>Recebimentos Pix · Efí Bank</h2>
                <p>
                  Cadastre as credenciais da sua aplicação Efí e a chave Pix da conta recebedora. Os
                  dados são criptografados no servidor; depois de salvos, aparecem apenas o ambiente
                  e parte da chave.
                </p>
                <div className="info-banner">
                  <ShieldCheck size={19} />
                  {pixStatus?.configured
                    ? `Configurado: ${pixStatus.environment} · chave ${pixStatus.pixKeyHint}. ${pixStatus.paymentsEnabled ? 'Cobranças habilitadas.' : 'Cobranças ainda desabilitadas.'}`
                    : 'Efí ainda não configurada.'}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const file = f.get('certificate');
                    if (!(file instanceof File) || !file.size || file.size > 180000) {
                      notify('Selecione um certificado P12 de até 180 KB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      void action('admin/efi', {
                        clientId: f.get('clientId'),
                        clientSecret: f.get('clientSecret'),
                        pixKey: f.get('pixKey'),
                        certificateP12: String(reader.result).split(',')[1],
                        certificatePassword: f.get('certificatePassword'),
                        environment: f.get('environment'),
                      });
                    reader.readAsDataURL(file);
                  }}
                >
                  <div className="form-grid">
                    <label className="field">
                      Ambiente
                      <select name="environment">
                        <option value="homologation">Homologação</option>
                        <option value="production">Produção</option>
                      </select>
                    </label>
                    <label className="field">
                      Client ID
                      <input name="clientId" autoComplete="off" required />
                    </label>
                    <label className="field">
                      Client Secret
                      <input name="clientSecret" type="password" autoComplete="off" required />
                    </label>
                    <label className="field">
                      Chave Pix recebedora
                      <input name="pixKey" autoComplete="off" required />
                    </label>
                    <label className="field">
                      Certificado P12
                      <input
                        name="certificate"
                        type="file"
                        accept=".p12,.pfx,application/x-pkcs12"
                        required
                      />
                    </label>
                    <label className="field">
                      Senha do certificado, se houver
                      <input name="certificatePassword" type="password" autoComplete="off" />
                    </label>
                  </div>
                  <button className="primary" disabled={busy}>
                    Salvar configuração Efí
                  </button>
                </form>
                {pixStatus?.configured && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void action('admin/efi-test', {})}
                  >
                    Testar conexão OAuth
                  </button>
                )}
                <p>
                  A confirmação de pagamento consulta a cobrança diretamente na Efí. A plataforma
                  não confia em comprovantes enviados pelo usuário.
                </p>
              </section>
              <section className="surface">
                <h2>Depósitos Pix</h2>
                <p>
                  Últimos 200 pedidos. A confirmação só ocorre após consulta ao banco; o
                  administrador não pode marcar um Pix como pago manualmente.
                </p>
                <div className="scroll-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Solicitado em</th>
                        <th>Usuário</th>
                        <th>Valor</th>
                        <th>Status</th>
                        <th>Identificador</th>
                        <th>Confirmação</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pixDeposits.map((deposit) => (
                        <tr key={deposit.id}>
                          <td>{new Date(deposit.created_at).toLocaleString('pt-BR')}</td>
                          <td>
                            {deposit.name}
                            <br />
                            <small>{deposit.email}</small>
                          </td>
                          <td>
                            {(deposit.amount_cents / 100).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                          <td>
                            <span
                              className={`badge ${deposit.status === 'CONFIRMED' ? 'green' : ''}`}
                            >
                              {deposit.status}
                            </span>
                          </td>
                          <td>
                            <code title={deposit.txid}>{deposit.txid.slice(0, 12)}…</code>
                          </td>
                          <td>
                            {deposit.confirmed_at
                              ? new Date(deposit.confirmed_at).toLocaleString('pt-BR')
                              : '—'}
                          </td>
                          <td>
                            {deposit.status === 'PENDING' && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => void action('admin/pix-refresh', { id: deposit.id })}
                              >
                                Consultar Efí
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!pixDeposits.length && <p>Nenhum depósito solicitado.</p>}
              </section>
            </>
          )}
          {tab === 'mercadopago' && (
            <>
              <section className="surface">
                <h2>Recebimentos · Mercado Pago</h2>
                <p>
                  Cadastre as credenciais da sua aplicação Mercado Pago. Os
                  dados são criptografados no servidor; depois de salvos, aparecem apenas o ambiente
                  e a configuração.
                </p>
                <div className="info-banner">
                  <ShieldCheck size={19} />
                  {mpStatus?.configured
                    ? `Configurado: ${mpStatus.environment}. ${mpStatus.paymentsEnabled ? 'Pagamentos habilitados.' : 'Pagamentos ainda desabilitados.'}`
                    : 'Mercado Pago ainda não configurado.'}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action('admin/mercadopago', {
                      accessToken: f.get('accessToken'),
                      publicKey: f.get('publicKey'),
                      webhookSecret: f.get('webhookSecret'),
                      environment: f.get('environment'),
                    });
                  }}
                >
                  <div className="form-grid">
                    <label className="field">
                      Ambiente
                      <select name="environment">
                        <option value="sandbox">Sandbox (testes)</option>
                        <option value="production">Produção</option>
                      </select>
                    </label>
                    <label className="field">
                      Access Token
                      <input name="accessToken" autoComplete="off" required />
                    </label>
                    <label className="field">
                      Public Key
                      <input name="publicKey" autoComplete="off" required />
                    </label>
                    <label className="field">
                      Webhook Secret (opcional)
                      <input name="webhookSecret" type="password" autoComplete="off" />
                    </label>
                  </div>
                  <button className="primary" disabled={busy}>
                    Salvar configuração Mercado Pago
                  </button>
                </form>
                {mpStatus?.configured && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void action('admin/mercadopago-test', {})}
                  >
                    Testar conexão
                  </button>
                )}
                <p>
                  A confirmação de pagamento consulta a transação diretamente no Mercado Pago via webhook e consulta administrativa. A plataforma
                  não confia em comprovantes enviados pelo usuário.
                </p>
              </section>
              <section className="surface">
                <h2>Depósitos Mercado Pago</h2>
                <p>
                  Últimos 200 pedidos. A confirmação só ocorre após consulta ao Mercado Pago; o
                  administrador não pode marcar um pagamento como pago manualmente.
                </p>
                <div className="scroll-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Solicitado em</th>
                        <th>Usuário</th>
                        <th>Valor</th>
                        <th>Método</th>
                        <th>Status</th>
                        <th>Referência</th>
                        <th>PIX / Boleto</th>
                        <th>Confirmação</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mpDeposits.map((deposit) => (
                        <tr key={deposit.id}>
                          <td>{new Date(deposit.created_at).toLocaleString('pt-BR')}</td>
                          <td>
                            {deposit.name}
                            <br />
                            <small>{deposit.email}</small>
                          </td>
                          <td>
                            {(deposit.amount_cents / 100).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </td>
                          <td>{deposit.payment_method}</td>
                          <td>
                            <span
                              className={`badge ${deposit.status === 'CONFIRMED' ? 'green' : ''}`}
                            >
                              {deposit.status}
                            </span>
                          </td>
                          <td>
                            <code title={deposit.external_reference}>{deposit.external_reference.slice(0, 12)}…</code>
                          </td>
                          <td>
                            {deposit.qr_code_base64 && (
                              <img src={`data:image/png;base64,${deposit.qr_code_base64}`} alt="QR Code PIX" style={{ maxWidth: 120, cursor: 'pointer' }} onClick={() => window.open(deposit.ticket_url || '', '_blank', 'noopener,noreferrer')} />
                            )}
                            {deposit.qr_code && !deposit.qr_code_base64 && (
                              <div style={{ maxWidth: 200 }}>
                                <textarea readOnly value={deposit.qr_code} rows={2} style={{ width: '100%', fontSize: '0.7rem' }} />
                                <button className="secondary" style={{ fontSize: '0.7rem', marginTop: 4 }} onClick={() => navigator.clipboard.writeText(deposit.qr_code || '')}>Copiar</button>
                              </div>
                            )}
                            {deposit.ticket_url && !deposit.qr_code_base64 && !deposit.qr_code && (
                              <a href={deposit.ticket_url} target="_blank" rel="noopener noreferrer" className="text-link">Ver boleto</a>
                            )}
                          </td>
                          <td>
                            {deposit.confirmed_at
                              ? new Date(deposit.confirmed_at).toLocaleString('pt-BR')
                              : '—'}
                          </td>
                          <td>
                            {(deposit.status === 'PENDING' || deposit.status === 'CREATING') && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => void action('admin/mercadopago-refresh', { id: deposit.id })}
                              >
                                Consultar Mercado Pago
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!mpDeposits.length && <p>Nenhum depósito solicitado.</p>}
              </section>
            </>
          )}
          {tab === 'withdrawals' && (
            <div className="withdrawal-admin-layout">
              <section className="surface">
                <h2>Solicitações de Saque via Pix</h2>
                <p>O saldo para jogar não pode ser pago via Pix. Rejeite solicitações pendentes para devolver o valor ao saldo.</p>
              </section>
              <section className="surface">
                <div className="scroll-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Solicitado em</th>
                        <th>Usuário</th>
                        <th>CPF</th>
                        <th>Chave Pix</th>
                        <th>Valor</th>
                        <th>Status</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.map((w: any) => (
                        <tr key={w.id}>
                          <td>{new Date(w.created_at).toLocaleString('pt-BR')}</td>
                          <td>
                            {w.name}
                            <br />
                            <small>{w.email}</small>
                          </td>
                          <td>
                            <code>{w.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</code>
                            <button className="secondary" style={{fontSize: '0.7rem', marginTop: 4}} onClick={() => navigator.clipboard.writeText(w.cpf)}>Copiar CPF</button>
                          </td>
                          <td>
                            <code>{w.pix_key || w.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</code>
                            <button className="secondary" style={{fontSize: '0.7rem', marginTop: 4}} onClick={() => navigator.clipboard.writeText(w.pix_key || w.cpf)}>Copiar Chave</button>
                          </td>
                          <td>
                            {(w.amount_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td>
                            <span className={`badge ${w.status === 'APPROVED' ? 'green' : w.status === 'REJECTED' ? '' : ''}`}>
                              {w.status}
                            </span>
                          </td>
                          <td>
                            {w.status === 'PENDING' && (
                              <div style={{display: 'flex', gap: 4}}>
                                <button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() => {
                                    const note = prompt('Motivo da rejeição:');
                                    if (note) void action('admin/withdrawals', { id: w.id, action: 'reject', adminNote: note });
                                  }}
                                >
                                  Rejeitar
                                </button>
                              </div>
                            )}
                            {w.status === 'APPROVED' && <span style={{ color: 'var(--success)' }}>✓ Pix enviado</span>}
                            {w.status === 'REJECTED' && <span style={{ color: 'var(--danger)' }}>✕ Rejeitado</span>}
                            {w.admin_note && <small style={{color: 'var(--muted)'}}>{w.admin_note}</small>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!withdrawals.length && <p>Nenhuma solicitação de saque registrada.</p>}
              </section>
            </div>
          )}
          {tab === 'results' && <AdminRouletteResults rounds={data.rounds} notify={notify} />}
          {tab === 'reports' && (
            <>
              <section className="surface">
                <h2>Financeiro e atividade dos apostadores</h2>
                <p>
                  Os valores de jogo aparecem neste relatório. Depósitos
                  Pix aparecem separados em reais, e não há fluxo de saque configurado.
                </p>
                <div className="report-filters">
                  <label className="field">De<input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></label>
                  <label className="field">Até<input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></label>
                  <label className="field">Apostador<input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Nome ou e-mail" /></label>
                  <button className="primary" onClick={() => setReportFilter(reportSearch)}>Filtrar</button>
                  {(reportFrom || reportTo || reportFilter) && <button className="secondary" onClick={() => { setReportFrom(''); setReportTo(''); setReportSearch(''); setReportFilter(''); }}>Limpar filtros</button>}
                </div>
              </section>
              {!report ? <p>Carregando relatório…</p> : <>
                <div className="admin-metrics report-metrics">
                  <section className="surface"><small>ROULETA · apostas</small><strong>{report.roulette.entries}</strong><p>{brl(report.roulette.pointsWagered)} apostados</p><small>{report.roulette.winningEntries} apostas conferiram · prêmios pagos: R$ 0,00</small></section>
                  <section className="surface"><small>RASPADINHA · jogadas</small><strong>{report.scratch.cards}</strong><p>{brl(report.scratch.pointsSpent)} gastos</p><small>{brl(report.scratch.prizePoints)} em prêmios · saldo líquido {brl(report.scratch.netPoints)}</small></section>
                  <section className="surface"><small>PIX · depósitos confirmados</small><strong>{brl(report.pix.confirmedCents)}</strong><p>{report.pix.confirmedCount} depósitos confirmados</p><small>Pendentes: {brl(report.pix.pendingCents)} ({report.pix.pendingCount}) · outros estados: {report.pix.otherCount}</small></section>
                  <section className="surface"><small>SAQUES · não configurados</small><strong>{brl(report.withdrawals.amountCents)}</strong><p>{report.withdrawals.count} saques registrados</p><small>Não há fluxo de saque configurado nesta plataforma.</small></section>
                </div>
                <section className="surface">
                  <h2>Histórico detalhado</h2>
                  {report.limited && <p>Há mais registros para este filtro. Restrinja o período ou o apostador para consultar os eventos anteriores.</p>}
                  <div className="scroll-table"><table>
                    <thead><tr><th>Data e hora</th><th>Apostador</th><th>Área</th><th>Evento e detalhes</th></tr></thead>
                    <tbody>{report.events.map((event) => {
                      const detail = event.detail;
                      const summary = event.category === 'ROULETTE'
                        ? `Rodada #${String(detail.roundId || '').slice(0, 8)} · ${String(detail.mode || '')} · ${Array.isArray(detail.selection) ? detail.selection.join(', ') : ''} · R$ ${(Number(detail.points || 0) / 100).toFixed(2).replace('.', ',')}${detail.outcome && typeof detail.outcome === 'object' && 'win' in detail.outcome && detail.outcome.win ? ' · conferida' : ''}`
                        : event.category === 'SCRATCH'
                          ? `${String(detail.gameName || 'Raspadinha')} · custo R$ ${(Number(detail.costPoints || 0) / 100).toFixed(2).replace('.', ',')} · prêmio R$ ${(Number(detail.prizePoints || 0) / 100).toFixed(2).replace('.', ',')} · ${displayPrizeLabel(String(detail.prize || ''), Number(detail.prizePoints || 0))}`
                          : event.category === 'PIX'
                            ? `${brl(Number(detail.amountCents || 0))} · ${String(detail.status || '')}${detail.endToEndId ? ` · E2E ${String(detail.endToEndId)}` : ''}`
                            : `${Number(detail.points || 0) > 0 ? '+' : ''}R$ ${(Number(detail.points || 0) / 100).toFixed(2).replace('.', ',')} · saldo R$ ${(Number(detail.balanceAfter || 0) / 100).toFixed(2).replace('.', ',')}`;
                      return <tr key={`${event.category}-${event.id}`}>
                        <td>{new Date(event.created_at).toLocaleString('pt-BR')}</td>
                        <td><b>{event.name}</b><small>{event.email || 'Visitante'}</small><button className="text-link" onClick={() => void api(`admin/user-history?id=${event.user_id}`).then(setInspect).catch((e) => notify(e.message))}>Abrir histórico completo</button></td>
                        <td><span className={`badge ${event.category === 'PIX' ? 'green' : ''}`}>{event.category === 'CREDITOS' ? 'SALDO' : event.category}</span></td>
                        <td><b>{event.action}</b><small>{summary}</small><button className="text-link" onClick={() => setInspect(event)}>Ver detalhes do evento</button></td>
                      </tr>;
                    })}</tbody>
                  </table></div>
                  {!report.events.length && <p>Nenhuma movimentação encontrada para os filtros.</p>}
                </section>
              </>}
            </>
          )}
          {tab === 'settings' && (
            <section className="surface">
              <h2>Configurações da plataforma</h2>
              <p>Alterações de regras afetam apenas rodadas criadas posteriormente.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action('admin/settings', config);
                }}
              >
                <div className="form-grid">
                  <label className="field">
                    Logo (PNG ou WebP)
                    <input
                      type="file"
                      accept="image/png,image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          if (
                            !['image/png', 'image/webp'].includes(file.type) ||
                            file.size > 2000000
                          )
                            throw new Error('Use PNG/WebP de até 2 MB');
                          const bitmap = await createImageBitmap(file),
                            canvas = document.createElement('canvas');
                          canvas.width = 64;
                          canvas.height = 64;
                          const ctx = canvas.getContext('2d')!;
                          const scale = Math.min(64 / bitmap.width, 64 / bitmap.height),
                            w = bitmap.width * scale,
                            h = bitmap.height * scale;
                          ctx.drawImage(bitmap, (64 - w) / 2, (64 - h) / 2, w, h);
                          bitmap.close();
                          const logo = canvas.toDataURL('image/webp', 0.8);
                          if (logo.length > 12000)
                            throw new Error('A imagem reduzida excedeu o tamanho permitido');
                          setConfig({ ...config, logo });
                        } catch (error) {
                          notify((error as Error).message);
                        }
                      }}
                    />
                    {config.logo && (
                      <>
                        <img src={config.logo} alt="Prévia do logo" className="logo-preview" />
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => setConfig({ ...config, logo: '' })}
                        >
                          Restaurar coroa original
                        </button>
                      </>
                    )}
                  </label>
                  <label className="field">
                    Cor de destaque
                    <input
                      type="color"
                      value={config.accent}
                      onChange={(e) => setConfig({ ...config, accent: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Banner da roleta
                    <input
                      value={config.banner}
                      maxLength={200}
                      placeholder="Mensagem de destaque"
                      onChange={(e) => setConfig({ ...config, banner: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Inscrições de novas rodadas (segundos)
                    <input
                      type="number"
                      min={15}
                      max={3600}
                      value={config.scheduleSeconds}
                      onChange={(e) =>
                        setConfig({ ...config, scheduleSeconds: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="field">
                    Idioma inicial
                    <select
                      value={config.locale}
                      onChange={(e) =>
                        setConfig({ ...config, locale: e.target.value as SettingsData['locale'] })
                      }
                    >
                      <option value="pt">Português</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </label>
                  <label className="field">
                    Nome
                    <input
                      value={config.platform}
                      onChange={(e) => setConfig({ ...config, platform: e.target.value })}
                      minLength={3}
                      maxLength={40}
                      required
                    />
                  </label>
                  <label className="field">
                    Giro da roleta (6 a 10 s)
                    <input
                      type="number"
                      min={6}
                      max={10}
                      value={config.duration}
                      onChange={(e) => setConfig({ ...config, duration: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    Posições na conferência
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={config.rules.positions}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          rules: { ...config.rules, positions: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Segunda posição do passe
                    <input
                      type="number"
                      min={2}
                      max={5}
                      value={config.rules.passeSecond}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          rules: { ...config.rules, passeSecond: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  Mensagem do sistema
                  <textarea
                    value={config.announcement}
                    maxLength={500}
                    onChange={(e) => setConfig({ ...config, announcement: e.target.value })}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={config.sound}
                    onChange={(e) => setConfig({ ...config, sound: e.target.checked })}
                  />
                  Som ativado por padrão em novas contas
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={config.animations}
                    onChange={(e) => setConfig({ ...config, animations: e.target.checked })}
                  />
                  Animações da roleta
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={config.paused}
                    onChange={(e) => setConfig({ ...config, paused: e.target.checked })}
                  />
                  Pausar criação automática de novas rodadas
                </label>
                <button className="primary" disabled={busy}>
                  Salvar configurações <CheckCircle2 size={16} />
                </button>
              </form>
            </section>
          )}
          {tab === 'scratch' && (
            <section className="surface">
              <h2>Configurar Raspadinha Vegas</h2>
              <p>
                Esta versão usa saldo em R$ sem valor de saque. As chances
                somadas devem dar 100%.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action('admin/settings', config);
                }}
              >
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={config.scratch.enabled}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        scratch: { ...config.scratch, enabled: e.target.checked },
                      })
                    }
                  />
                  Ativar raspadinha para os jogadores
                </label>
                {(config.scratch.games ?? []).map((game, gameIndex) => (
                  <article className="scratch-admin-game" key={game.id}>
                    <div className="scratch-admin-title">
                      <h3>
                        {game.icon} {game.name}
                      </h3>
                      <button
                        className="secondary"
                        type="button"
                        aria-label={`Excluir ${game.name}`}
                        onClick={() =>
                          setConfig({
                            ...config,
                            scratch: {
                              ...config.scratch,
                              games: (config.scratch.games ?? []).filter(
                                (_, index) => index !== gameIndex,
                              ),
                            },
                          })
                        }
                      >
                        <Trash2 size={15} /> Excluir
                      </button>
                    </div>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={game.enabled}
                        onChange={(e) => {
                          const games = [...(config.scratch.games ?? [])];
                          games[gameIndex] = { ...game, enabled: e.target.checked };
                          setConfig({ ...config, scratch: { ...config.scratch, games } });
                        }}
                      />{' '}
                      Exibir este cartão no catálogo
                    </label>
                    <div className="scratch-admin-fields">
                      <label className="field">
                        Nome
                        <input
                          value={game.name}
                          maxLength={30}
                          onChange={(e) => {
                            const games = [...(config.scratch.games ?? [])];
                            games[gameIndex] = { ...game, name: e.target.value };
                            setConfig({ ...config, scratch: { ...config.scratch, games } });
                          }}
                        />
                      </label>
                      <label className="field">
                        Ícone
                        <input
                          value={game.icon}
                          maxLength={12}
                          onChange={(e) => {
                            const games = [...(config.scratch.games ?? [])];
                            games[gameIndex] = { ...game, icon: e.target.value };
                            setConfig({ ...config, scratch: { ...config.scratch, games } });
                          }}
                        />
                      </label>
                      <label className="field">
                        Preço (R$)
                        <input
                          aria-label={`Preço da raspadinha ${game.name}`}
                          type="number"
                          min={0.01}
                          max={10}
                          step={0.01}
                          value={game.price / 100}
                          onChange={(e) => {
                            const games = [...(config.scratch.games ?? [])];
                            games[gameIndex] = { ...game, price: Math.round(Number(e.target.value) * 100) };
                            setConfig({ ...config, scratch: { ...config.scratch, games } });
                          }}
                        />
                      </label>
                      <label className="field">
                        Descrição
                        <input
                          value={game.tagline}
                          maxLength={80}
                          onChange={(e) => {
                            const games = [...(config.scratch.games ?? [])];
                            games[gameIndex] = { ...game, tagline: e.target.value };
                            setConfig({ ...config, scratch: { ...config.scratch, games } });
                          }}
                        />
                      </label>
                      <label className="field">
                        Imagem da capa
                        <input
                          type="text"
                          placeholder="https://... ou /imagem.webp"
                          value={game.image ?? ''}
                          onChange={(e) => {
                            const games = [...(config.scratch.games ?? [])];
                            games[gameIndex] = { ...game, image: e.target.value };
                            setConfig({ ...config, scratch: { ...config.scratch, games } });
                          }}
                        />
                      </label>
                    </div>
                    <div className="scroll-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Imagem do prêmio</th>
                            <th>Nome do prêmio</th>
                            <th>R$</th>
                            <th>Chance (%)</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {game.prizes.map((prize, index) => (
                            <tr key={index}>
                              <td>
                                <input
                                  aria-label={`${game.name}: imagem do prêmio ${index + 1}`}
                                  type="text"
                                  placeholder="https://... ou /imagem.webp"
                                  value={prize.image ?? ''}
                                  onChange={(e) => {
                                    const games = [...(config.scratch.games ?? [])];
                                    const prizes = [...game.prizes];
                                    prizes[index] = { ...prize, image: e.target.value };
                                    games[gameIndex] = { ...game, prizes };
                                    setConfig({ ...config, scratch: { ...config.scratch, games } });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`${game.name}: nome do prêmio ${index + 1}`}
                                  value={displayPrizeLabel(prize.label, prize.points)}
                                  maxLength={40}
                                  onChange={(e) => {
                                    const games = [...(config.scratch.games ?? [])];
                                    const prizes = [...game.prizes];
                                    prizes[index] = { ...prize, label: e.target.value };
                                    games[gameIndex] = { ...game, prizes };
                                    setConfig({ ...config, scratch: { ...config.scratch, games } });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`${game.name}: R$ do prêmio ${index + 1}`}
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  value={prize.points / 100}
                                  onChange={(e) => {
                                    const games = [...(config.scratch.games ?? [])];
                                    const prizes = [...game.prizes];
                                    prizes[index] = { ...prize, points: Math.round(Number(e.target.value) * 100) };
                                    games[gameIndex] = { ...game, prizes };
                                    setConfig({ ...config, scratch: { ...config.scratch, games } });
                                  }}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`${game.name}: chance do prêmio ${index + 1}`}
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  value={prize.chance / 100}
                                  onChange={(e) => {
                                    const games = [...(config.scratch.games ?? [])];
                                    const prizes = [...game.prizes];
                                    prizes[index] = {
                                      ...prize,
                                      chance: Math.round(Number(e.target.value) * 100),
                                    };
                                    games[gameIndex] = { ...game, prizes };
                                    setConfig({ ...config, scratch: { ...config.scratch, games } });
                                  }}
                                />
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  type="button"
                                  aria-label={`Remover prêmio ${prize.label}`}
                                  disabled={game.prizes.length <= 2}
                                  onClick={() => {
                                    const games = [...(config.scratch.games ?? [])];
                                    games[gameIndex] = {
                                      ...game,
                                      prizes: game.prizes.filter(
                                        (_, prizeIndex) => prizeIndex !== index,
                                      ),
                                    };
                                    setConfig({ ...config, scratch: { ...config.scratch, games } });
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      className="secondary"
                      type="button"
                      disabled={game.prizes.length >= 12}
                      onClick={() => {
                        const games = [...(config.scratch.games ?? [])];
                        games[gameIndex] = {
                          ...game,
                          prizes: [
                            ...game.prizes,
                            { label: 'Novo prêmio', points: 10, chance: 0, image: '' },
                          ],
                        };
                        setConfig({ ...config, scratch: { ...config.scratch, games } });
                      }}
                    >
                      <Plus size={15} /> Adicionar prêmio
                    </button>
                    <p className="scratch-chances-total">
                      Chances:{' '}
                      {(
                        game.prizes.reduce((sum, prize) => sum + prize.chance, 0) / 100
                      ).toLocaleString('pt-BR')}
                      % (deve fechar em 100%)
                    </p>
                  </article>
                ))}
                <button
                  className="secondary"
                  type="button"
                  disabled={(config.scratch.games ?? []).length >= 10}
                  onClick={() => {
                    const games = [...(config.scratch.games ?? [])];
                    const id = `raspadinha-${Date.now().toString(36)}`;
                    games.push({
                      id,
                      name: 'Nova raspadinha',
                      tagline: 'Encontre três símbolos iguais',
                      icon: '🎟️',
                      image: '',
                      price: 50,
                      enabled: false,
                      prizes: [
                        { label: 'Não foi desta vez', points: 0, chance: 7000, image: '' },
                        { label: brl(25), points: 25, chance: 2400, image: '' },
                        { label: brl(100), points: 100, chance: 550, image: '' },
                        { label: brl(250), points: 250, chance: 50, image: '' },
                      ],
                    });
                    setConfig({ ...config, scratch: { ...config.scratch, games } });
                  }}
                >
                  <Plus size={16} /> Criar raspadinha
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    (config.scratch.games ?? []).some(
                      (game) => game.prizes.reduce((sum, prize) => sum + prize.chance, 0) !== 10000,
                    )
                  }
                >
                  Salvar raspadinhas <CheckCircle2 size={16} />
                </button>{' '}
              </form>
            </section>
          )}
          {tab === 'content' && (
            <section className="surface">
              <h2>Central de conteúdo</h2>
              <p>
                Edite a FAQ ou publique um aviso interno. O conteúdo é renderizado como texto, sem
                HTML executável.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action('admin/content', {
                    slug: f.get('slug'),
                    title: f.get('title'),
                    body: f.get('body'),
                  });
                }}
              >
                <label className="field">
                  Identificador
                  <select name="slug">
                    <option value="faq">Central de ajuda</option>
                    <option value="tutorial">Tutorial</option>
                    <option value="notice">Aviso interno</option>
                    <option value="news">Notícias internas</option>
                  </select>
                </label>
                <label className="field">
                  Título
                  <input name="title" required minLength={2} maxLength={80} />
                </label>
                <label className="field">
                  Texto
                  <textarea name="body" rows={8} required maxLength={8000} />
                </label>
                <button className="primary" disabled={busy}>
                  Salvar conteúdo <CheckCircle2 size={16} />
                </button>
              </form>
            </section>
          )}
          {tab === 'audit' && (
            <section className="surface">
              <h2>Auditoria encadeada</h2>
              <div className="info-banner">
                <ShieldCheck size={19} />
                {auditStatus === 'checking'
                  ? 'Conferindo toda a cadeia de auditoria. Isso pode levar alguns segundos.'
                  : auditStatus === 'valid'
                    ? 'Todos os hashes e vínculos estão íntegros.'
                    : auditStatus === 'invalid'
                      ? 'Inconsistência detectada na cadeia.'
                      : auditStatus === 'error'
                        ? 'Não foi possível concluir a verificação.'
                        : 'A verificação completa começa ao abrir esta aba.'}
                {auditStatus === 'error' && (
                  <button className="text-link" onClick={() => setAuditStatus('idle')}>
                    Tentar novamente
                  </button>
                )}
              </div>
              <label className="search-field">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar ação, ator ou detalhe"
                />
              </label>
              <div className="scroll-table">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Data</th>
                      <th>Ação</th>
                      <th>Ator</th>
                      <th>Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit
                      .filter((x) =>
                        `${x.action} ${x.actor} ${x.detail}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((x) => (
                        <tr key={x.seq}>
                          <td>{x.seq}</td>
                          <td>{new Date(x.created_at).toLocaleString('pt-BR')}</td>
                          <td>{x.action}</td>
                          <td>{x.actor?.slice(0, 8) || 'Sistema'}</td>
                          <td>
                            <button className="text-link" onClick={() => setInspect(x)}>
                              Inspecionar
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {inspect !== null && (
            <section className="surface inspect">
              <button className="secondary" onClick={() => setInspect(null)}>
                Fechar inspeção
              </button>
              <pre>{JSON.stringify(inspect, formatHistoryValue, 2)}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function AdminRouletteResults({
  rounds,
  notify,
}: {
  rounds: Round[];
  notify: (message: string) => void;
}) {
  const published = rounds.filter(
    (round) => round.type === 'ROULETTE' && round.state === 'PUBLISHED' && round.result?.group,
  );
  return (
    <section className="surface">
      <span className="eyebrow">HISTÓRICO DA ROLETA</span>
      <h2>Últimos bichos premiados</h2>
      {published.slice(0, 30).map((round) => {
        const animal = animals[round.result!.group! - 1];
        return (
          <div className="recent-row" key={round.id}>
            <span className="recent-icon">
              <AnimalArt id={animal.id} size={42} />
            </span>
            <div>
              <b>
                {animal.name} · Grupo {String(animal.id).padStart(2, '0')}
              </b>
              <small>Dezenas do grupo: {animal.tens.join(' · ')}</small>
              <small>{new Date(round.published_at!).toLocaleString('pt-BR')}</small>
            </div>
            <button
              className="text-link"
              onClick={() =>
                void api(`verify/${round.id}`)
                  .then((result) =>
                    notify(
                      result.valid
                        ? 'Resultado e integridade confirmados.'
                        : 'A verificação falhou.',
                    ),
                  )
                  .catch((error) => notify(error.message))
              }
            >
              Verificar
            </button>
          </div>
        );
      })}
      {!published.length && <p>Ainda não há bichos premiados publicados.</p>}
    </section>
  );
}
