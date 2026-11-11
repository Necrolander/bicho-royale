'use client';
import { formatBRL } from '@/lib/money';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Ticket, Sparkles, Clock, ShieldCheck, Search } from 'lucide-react';
import {
  animals,
  animalFor,
  modes,
  allowedPositions,
  normalizeSelection,
  type ModeId,
  type RuleConfig,
} from '@/lib/game';
import { modePath } from '@/lib/navigation';
import { AnimalArt } from './AnimalArt';
import { api, type Round } from './Royale';
const date = (s: string) => new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const short = (s: string) => s.slice(0, 8).toUpperCase();
const state = (s: string) =>
  ({
    OPEN: 'Aberta',
    SCHEDULED: 'Agendada',
    LOCKED: 'Encerrada',
    DRAWING: 'Publicando',
    PUBLISHED: 'Publicada',
    CANCELLED: 'Cancelada',
  })[s] || s;
type Notice = (s: string) => void;
type Act = (fn: () => Promise<void>) => Promise<void>;
export type TicketData = {
  id: string;
  mode: ModeId;
  selection: string[];
  points: number;
  created_at: string;
  positions: number[];
  rules: RuleConfig;
  status: string;
  outcome: { win: boolean; explanation: string; values: string[] } | null;
  round: Round;
};

export function ModeCatalog({ compact = false }: { compact?: boolean }) {
  return (
    <div className="mode-catalog">
      {(compact ? modes.slice(0, 6) : modes).map((m, i) => (
        <Link key={m.id} className="surface mode-card" href={modePath(m.id)}>
          <span className="eyebrow">
            {m.kind === 'group' ? 'ANIMAIS & GRUPOS' : 'NÚMEROS'} · {String(i + 1).padStart(2, '0')}
          </span>
          <ArrowUpRight size={18} />
          <h2>{m.name}</h2>
          <p>{m.description}</p>
          <small>{m.example}</small>
          <b>Explorar modalidade →</b>
        </Link>
      ))}
    </div>
  );
}
function Positions({
  id,
  rules,
  value,
  onChange,
}: {
  id: ModeId;
  rules: RuleConfig;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const m = modes.find((m) => m.id === id)!,
    available = allowedPositions(id, rules);
  return (
    <fieldset className="position-picker">
      <legend>Prêmios analisados</legend>
      {available.map((p) => (
        <label key={p}>
          <input
            type="checkbox"
            checked={value.includes(p)}
            disabled={m.positions !== 'all'}
            onChange={() =>
              onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p].sort())
            }
          />
          {p}º prêmio
        </label>
      ))}
      <small>
        {m.positions === 'ordered'
          ? `Ordem: 1º → ${available[1]}º prêmio. ${id === 'passe-invertido' ? 'As duas ordens de grupos conferem.' : 'A ordem dos grupos é obrigatória.'}`
          : m.positions === 'first'
            ? 'Grupo na cabeça considera somente o primeiro prêmio.'
            : `Escolha pelo menos ${m.count} posição(ões).`}
      </small>
    </fieldset>
  );
}
function Selection({
  id,
  value,
  onChange,
  multiple = false,
}: {
  id: ModeId;
  value: string[];
  onChange: (v: string[]) => void;
  multiple?: boolean;
}) {
  const m = modes.find((m) => m.id === id)!;
  const toggle = (v: string) =>
    onChange(
      value.includes(v)
        ? value.filter((x) => x !== v)
        : value.length < (multiple ? 25 : m.count)
          ? [...value, v]
          : m.count === 1
            ? [v]
            : value,
    );
  return (
    <div className="selection-builder">
      <div className="selection-slots">
        {Array.from({ length: multiple ? Math.max(1, value.length) : m.count }, (_, i) => (
          <div key={i}>
            <small>
              {m.positions === 'ordered' ? `Grupo ${i + 1} · ordem ${i + 1}` : `Seleção ${i + 1}`}
            </small>
            <strong>{value[i] || '—'}</strong>
            {value[i] && (
              <button
                type="button"
                aria-label={`Remover seleção ${i + 1}`}
                onClick={() => onChange(value.filter((_, n) => n !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {m.kind === 'group' ? (
        <div className="group-picker">
          {animals.map((a) => (
            <button
              key={a.id}
              type="button"
              className={value.includes(String(a.id).padStart(2, '0')) ? 'selected' : ''}
              aria-pressed={value.includes(String(a.id).padStart(2, '0'))}
              onClick={() => toggle(String(a.id).padStart(2, '0'))}
            >
              <AnimalArt id={a.id} />
              <b>
                {String(a.id).padStart(2, '0')} · {a.name}
              </b>
              <small>{a.tens.join(' · ')}</small>
            </button>
          ))}
        </div>
      ) : m.width === 2 ? (
        <div className="tens-picker">
          {Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')).map((v) => (
            <button
              type="button"
              key={v}
              aria-pressed={value.includes(v)}
              className={value.includes(v) ? 'selected' : ''}
              onClick={() => toggle(v)}
            >
              {v}
            </button>
          ))}
        </div>
      ) : (
        <div className="number-builder">
          {Array.from({ length: m.count }, (_, i) => (
            <label key={i}>
              {m.name} {m.count > 1 ? i + 1 : ''}
              <input
                aria-label={`Número ${i + 1}`}
                inputMode="numeric"
                maxLength={m.width}
                placeholder={'0'.repeat(m.width)}
                value={value[i] || ''}
                onChange={(e) => {
                  const next = Array.from({ length: m.count }, (_, n) => value[n] || '');
                  next[i] = e.target.value.replace(/\D/g, '').slice(0, m.width);
                  onChange(next);
                }}
                onBlur={() => {
                  if (value[i]) {
                    const next = [...value];
                    next[i] = next[i].padStart(m.width, '0');
                    onChange(next);
                  }
                }}
              />
              <small>{m.width} dígitos; zeros à esquerda preservados.</small>
            </label>
          ))}
        </div>
      )}
      {id === 'milhar-invertida' && value[0]?.length === 4 && (
        <div className="permutation-box">
          <b>Permutações únicas da sua milhar</b>
          <p>{permutations(value[0]).join(' · ')}</p>
          <small>Dígitos repetidos não geram combinações duplicadas.</small>
        </div>
      )}
    </div>
  );
}
function permutations(s: string): string[] {
  if (s.length <= 1) return [s];
  return [
    ...new Set(
      [...s].flatMap((c, i) =>
        permutations(s.slice(0, i) + s.slice(i + 1)).map((rest) => c + rest),
      ),
    ),
  ].sort();
}
export function ModeScreen({
  id,
  rounds,
  busy,
  act,
  notify,
  registered,
  onRegister,
  initialGroup,
  initialGroups,
}: {
  id: ModeId;
  rounds: Round[];
  busy: boolean;
  act: Act;
  notify: Notice;
  registered: boolean;
  onRegister: () => void;
  initialGroup?: number;
  initialGroups?: number[];
}) {
  const m = modes.find((m) => m.id === id)!,
    open = rounds.filter((r) => r.type === 'TRADITIONAL' && r.state === 'OPEN');
  const multiple = m.kind === 'group' && m.count === 1;
  const [roundId, setRoundId] = useState(''),
    [selection, setSelection] = useState<string[]>(
      multiple && initialGroups?.length
        ? [...new Set(initialGroups.filter((g) => Number.isInteger(g) && g >= 1 && g <= 25))].map(
            (g) => String(g).padStart(2, '0'),
          )
        : m.kind === 'group' && m.count === 1 && initialGroup
          ? [String(initialGroup).padStart(2, '0')]
          : [],
    ),
    [points, setPoints] = useState(10),
    [positions, setPositions] = useState<number[] | null>(null),
    [receipts, setReceipts] = useState<TicketData[]>([]);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const round = open.find((r) => r.id === roundId) || open[0],
    rules = round?.rules || { positions: 5, passeSecond: 2 };
  const selectedPositions = positions || allowedPositions(id, rules);
  const submit = () => {
    if (!registered) { onRegister(); return; }
    void act(async () => {
      if (!round) throw new Error('Aguarde uma extração tradicional aberta');
      if (multiple && !selection.length) throw new Error('Selecione pelo menos um animal');
      const normalized = multiple
        ? selection.map((g) => normalizeSelection(id, [g])[0]).sort()
        : normalizeSelection(id, selection);
      const body = {
        roundId: round.id,
        mode: id,
        selection: normalized,
        points,
        positions: selectedPositions,
      };
      const fingerprint = JSON.stringify(body);
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, key: crypto.randomUUID() };
      const ticket = await api(multiple ? 'entries/groups' : 'entries', {
        ...body,
        key: retry.current!.key,
      });
      setReceipts(multiple ? ticket : [ticket]);
      retry.current = null;
      notify(
        `${multiple ? ticket.length : 1} bilhete(s) salvo(s). A conferência acontecerá automaticamente após a extração.`,
      );
    });
  };
  return (
    <div className="traditional-layout">
      <section className="surface mode-workspace">
        <span className="eyebrow">EXTRAÇÃO TRADICIONAL · {multiple ? 'ATÉ 25 ANIMAIS' : `${m.count} SELEÇÃO(ÕES)`}</span>
        <h2>{m.name}</h2>
        <p>{m.description}</p>
        <p className="mode-example">Exemplo: {m.example}</p>
        {multiple && (
          <p>Selecione um ou vários animais. Cada animal gera um bilhete independente.</p>
        )}
        <Selection id={id} value={selection} onChange={setSelection} multiple={multiple} />
      </section>
      <aside className="surface ticket-builder">
        <Ticket size={26} />
        <h2>Seu bilhete</h2>
        <label>
          Extração
          <select
            value={round?.id || ''}
            onChange={(e) => {
              setRoundId(e.target.value);
              setPositions(null);
            }}
          >
            {!open.length && <option value="">Aguardando abertura</option>}
            {open.map((r) => (
              <option key={r.id} value={r.id}>
                {short(r.id)} · até {date(r.locks_at)}
              </option>
            ))}
          </select>
        </label>
        <Positions id={id} rules={rules} value={selectedPositions} onChange={setPositions} />
        <label>
          {multiple ? 'Valor por animal (R$)' : 'Valor (R$)'}
          <input
            type="number"
            min={0.01}
            max={1}
            step={0.01}
            value={points / 100}
            onChange={(e) => setPoints(Math.round(Number(e.target.value) * 100))}
          />
        </label>
        {multiple && (
          <p role="status">
            <b>
              {selection.length} animal(is) × {formatBRL(points)} = {formatBRL(selection.length * points)}
              no total
            </b>
          </p>
        )}
        <p>Sem valor monetário. A seleção e as regras ficam registradas no comprovante.</p>
        {round?.rules.modes?.[id]?.enabled === false && (
          <p role="alert">Modalidade desativada nesta extração.</p>
        )}
        <button
          className="primary"
          disabled={
            busy ||
            !round ||
            (multiple && !selection.length) ||
            round.rules.modes?.[id]?.enabled === false
          }
          onClick={submit}
        >
          {busy ? 'Registrando…' : registered ? 'Registrar bilhete' : 'Cadastre-se para registrar bilhete'}
        </button>
        <Link href="/extracoes">Ver agenda de extrações →</Link>
      </aside>
      {receipts.map((receipt) => (
        <Receipt key={receipt.id} ticket={receipt} />
      ))}
    </div>
  );
}
function PrizeTable({ round }: { round: Round }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Prêmio</th>
            <th>Milhar</th>
            <th>Centena</th>
            <th>Dezena</th>
            <th>Grupo / animal</th>
          </tr>
        </thead>
        <tbody>
          {round.result?.numbers.map((n, i) => (
            <tr key={i}>
              <td>{i + 1}º</td>
              <td>
                <b>{n}</b>
              </td>
              <td>{n.slice(-3)}</td>
              <td>{n.slice(-2)}</td>
              <td>
                {String(animalFor(n).id).padStart(2, '0')} · {animalFor(n).name}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Extractions({
  rounds,
  now,
  notify,
}: {
  rounds: Round[];
  now: number;
  notify: Notice;
}) {
  const list = rounds.filter((r) => r.type === 'TRADITIONAL'),
    upcoming = list.filter((r) => ['OPEN', 'SCHEDULED', 'LOCKED', 'DRAWING'].includes(r.state)),
    published = list.filter((r) => r.state === 'PUBLISHED');
  const [selected, setSelected] = useState('');
  const chosen = published.find((r) => r.id === selected) || published[0];
  return (
    <div className="extraction-page">
      <section className="surface">
        <span className="eyebrow">AGENDA TRADICIONAL</span>
        <h2>Cinco prêmios. Uma extração verificável.</h2>
        <p>
          Sorteios independentes da roleta. Cada prêmio registra milhar, centena,
          dezena e animal.
        </p>
        <div className="extraction-agenda">
          {upcoming.map((r) => {
            const end = r.state === 'SCHEDULED' ? r.opens_at : r.locks_at;
            return (
              <article key={r.id}>
                <span className="badge">{state(r.state)}</span>
                <h3>Extração {short(r.id)}</h3>
                <p>
                  {date(r.opens_at)} → {date(r.locks_at)}
                </p>
                <strong>
                  <Clock size={18} />{' '}
                  {Math.max(0, Math.ceil((new Date(end).getTime() - now) / 1000))}s
                </strong>
                <small>Compromisso publicado: {r.commitment}</small>
                <Link href="/modalidades">Selecionar modalidade →</Link>
              </article>
            );
          })}
          {!upcoming.length && <p>Nenhuma extração agendada. Consulte novamente em instantes.</p>}
        </div>
      </section>
      <section className="surface">
        <span className="eyebrow">RESULTADO REGISTRADO</span>
        <h2>Extrações publicadas</h2>
        {chosen ? (
          <>
            <label>
              Escolha uma extração
              <select value={chosen.id} onChange={(e) => setSelected(e.target.value)}>
                {published.map((r) => (
                  <option key={r.id} value={r.id}>
                    {short(r.id)} · {date(r.published_at!)}
                  </option>
                ))}
              </select>
            </label>
            <PrizeTable round={chosen} />
            <p>
              ID: <code>{chosen.id}</code>
            </p>
            <div className="button-row">
              <button
                className="subtle-button"
                onClick={() =>
                  void api(`verify/${chosen.id}`)
                    .then((v) =>
                      notify(
                        v.valid ? 'Compromisso e resultado verificados.' : 'Verificação falhou.',
                      ),
                    )
                    .catch((e) => notify(e.message))
                }
              >
                <ShieldCheck size={16} /> Verificar integridade
              </button>
              <Link className="primary" href={`/conferidor?extracao=${chosen.id}`}>
                Conferir uma seleção →
              </Link>
            </div>
          </>
        ) : (
          <p>A primeira extração ainda não foi publicada.</p>
        )}
      </section>
    </div>
  );
}
export function Receipt({ ticket }: { ticket: TicketData }) {
  return (
    <section className="surface full-receipt">
      <span className="eyebrow">COMPROVANTE PERSISTIDO · {ticket.status}</span>
      <h2>Bilhete {short(ticket.id)}</h2>
      <dl>
        <dt>ID completo</dt>
        <dd>
          <code>{ticket.id}</code>
        </dd>
        <dt>Modalidade</dt>
        <dd>{modes.find((m) => m.id === ticket.mode)?.name}</dd>
        <dt>Seleções</dt>
        <dd>
          {ticket.selection
            .map((s) =>
              ticket.mode.includes('grupo') ||
              ['grupo', 'cabeca', 'cercado', 'passe', 'passe-invertido'].includes(ticket.mode)
                ? `${s} · ${animals[Number(s) - 1]?.name}`
                : s,
            )
            .join(' / ')}
        </dd>
        <dt>Valor</dt>
        <dd>{formatBRL(ticket.points)}</dd>
        <dt>Registrado em</dt>
        <dd>{date(ticket.created_at)}</dd>
        <dt>Extração / rodada</dt>
        <dd>
          {ticket.round.type === 'TRADITIONAL' ? 'Tradicional' : 'Roleta'} ·{' '}
          <code>{ticket.round.id}</code> · {state(ticket.round.state)}
        </dd>
        <dt>Posições registradas</dt>
        <dd>{ticket.positions.join(', ')}</dd>
        <dt>Regra preservada</dt>
        <dd>
          {ticket.rules.positions} prêmios; passe entre 1º e{' '}
          {ticket.rules.modes?.[ticket.mode]?.passeSecond || ticket.rules.passeSecond}º
        </dd>
        <dt>Conferência</dt>
        <dd>{ticket.outcome?.explanation || 'Aguardando publicação automática'}</dd>
      </dl>
      {ticket.round.result?.numbers.length ? (
        <PrizeTable round={ticket.round} />
      ) : ticket.round.result?.group ? (
        <p>Resultado da roleta: {animals[ticket.round.result.group - 1].name}</p>
      ) : null}
      <Link href={`/conferidor?bilhete=${ticket.id}`}>Consultar no conferidor →</Link>
    </section>
  );
}
export function Tickets({ version, notify }: { version: string; notify: Notice }) {
  const [tickets, setTickets] = useState<TicketData[] | null>(null),
    [query, setQuery] = useState(''),
    [statusFilter, setStatus] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [selected, setSelected] = useState<TicketData | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('tickets')
      .then((d) => {
        if (active) {
          setTickets(d);
          setError('');
          setSelected((previous) =>
            previous ? d.find((t: TicketData) => t.id === previous.id) || null : null,
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [version]);
  const list = tickets?.filter(
    (t) =>
      t.round.type === 'ROULETTE' &&
      (!statusFilter || t.status === statusFilter) &&
      (!from || t.created_at >= new Date(`${from}T00:00:00-03:00`).toISOString()) &&
      (!to || t.created_at <= new Date(`${to}T23:59:59-03:00`).toISOString()) &&
      `${t.id} ${t.selection.join(' ')} ${t.round.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <section className="surface">
        <span className="eyebrow">SUA CONTA · HISTÓRICO PERSISTIDO</span>
        <h2>Meus Bilhetes</h2>
        <div className="ticket-filters">
          <label>
            <Search size={15} />
            <input
              aria-label="Buscar bilhetes"
              placeholder="ID do bilhete ou bicho escolhido"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Status dos bilhetes"
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            {['AGUARDANDO', 'CONFERIDO', 'CANCELADO'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label>
            De
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        {!tickets ? (
          <p>Carregando bilhetes…</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Bilhete</th>
                  <th>Bicho escolhido</th>
                  <th>Valor</th>
                  <th>Data</th>
                  <th>Status / resultado</th>
                </tr>
              </thead>
              <tbody>
                {list?.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <button
                        className="subtle-button"
                        onClick={() =>
                          void api(`tickets/${t.id}`)
                            .then(setSelected)
                            .catch((e) => notify(e.message))
                        }
                      >
                        {short(t.id)} →
                      </button>
                    </td>
                    <td>{t.selection.map((group) => `${String(Number(group)).padStart(2, '0')} · ${animals[Number(group) - 1]?.name || 'Animal'}`).join(' / ')}</td>
                    <td>{formatBRL(t.points)}</td>
                    <td>{date(t.created_at)}</td>
                    <td>{t.outcome ? (t.outcome.win ? 'Conferiu' : 'Não conferiu') : t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list?.length && (
              <p>
                Nenhum bilhete encontrado.{' '}
                <Link href="/modalidades">Criar um bilhete →</Link>
              </p>
            )}
          </div>
        )}
      </section>
      {selected && <Receipt ticket={selected} />}
    </>
  );
}
export function Checker({ rounds, notify }: { rounds: Round[]; notify: Notice }) {
  const [id, setId] = useState<ModeId>('grupo'),
    [selection, setSelection] = useState<string[]>([]),
    [roundId, setRoundId] = useState(''),
    [numbers, setNumbers] = useState(['', '', '', '', '']),
    [positions, setPositions] = useState<number[] | null>(null),
    [result, setResult] = useState<{ explanation: string; win: boolean } | null>(null),
    [ticketId, setTicketId] = useState(''),
    [ticket, setTicket] = useState<TicketData | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('extracao')) setRoundId(q.get('extracao')!);
    if (q.get('bilhete')) {
      setTicketId(q.get('bilhete')!);
      void api(`tickets/${q.get('bilhete')}`)
        .then(setTicket)
        .catch((e) => notify(e.message));
    }
  }, [notify]);
  const published = rounds.filter((r) => r.type === 'TRADITIONAL' && r.state === 'PUBLISHED'),
    round = published.find((r) => r.id === roundId),
    rules = round?.rules || { positions: 5, passeSecond: 2 };
  const check = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(
        await api('check', {
          mode: id,
          selection: normalizeSelection(id, selection),
          ...(roundId ? { roundId } : { numbers }),
          positions: positions || allowedPositions(id, rules),
        }),
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="surface checker-lookup">
        <span className="eyebrow">CONSULTA PRIVADA</span>
        <h2>Consultar bilhete por ID</h2>
        <div className="button-row">
          <input
            aria-label="ID do bilhete"
            placeholder="Cole o ID completo do seu bilhete"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
          />
          <button
            className="primary"
            disabled={busy || !ticketId}
            onClick={async () => {
              setBusy(true);
              setTicket(null);
              try {
                setTicket(await api(`tickets/${ticketId.trim()}`));
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Consultar bilhete
          </button>
        </div>
      </section>
      {ticket && <Receipt ticket={ticket} />}
      <section className="surface">
        <span className="eyebrow">CONFERÊNCIA INDEPENDENTE · SEM DÉBITO</span>
        <h2>Conferidor de modalidades</h2>
        <div className="checker-controls">
          <label>
            Modalidade
            <select
              value={id}
              onChange={(e) => {
                setId(e.target.value as ModeId);
                setSelection([]);
                setPositions(null);
                setResult(null);
              }}
            >
              {modes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Extração
            <select
              value={roundId}
              onChange={(e) => {
                setRoundId(e.target.value);
                setPositions(null);
                setResult(null);
              }}
            >
              <option value="">Informar cinco milhares manualmente</option>
              {published.map((r) => (
                <option key={r.id} value={r.id}>
                  {short(r.id)} · {date(r.published_at!)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>{modes.find((m) => m.id === id)?.description}</p>
        <Selection
          key={id}
          id={id}
          value={selection}
          onChange={(v) => {
            setSelection(v);
            setResult(null);
          }}
        />
        {round ? (
          <PrizeTable round={round} />
        ) : (
          <div className="manual-prizes">
            {numbers.map((n, i) => (
              <label key={i}>
                {i + 1}º prêmio
                <input
                  aria-label={`${i + 1}º prêmio`}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="0000"
                  value={n}
                  onChange={(e) => {
                    const next = [...numbers];
                    next[i] = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setNumbers(next);
                    setResult(null);
                  }}
                  onBlur={() => {
                    if (numbers[i]) {
                      const next = [...numbers];
                      next[i] = next[i].padStart(4, '0');
                      setNumbers(next);
                    }
                  }}
                />
              </label>
            ))}
          </div>
        )}
        <Positions
          id={id}
          rules={rules}
          value={positions || allowedPositions(id, rules)}
          onChange={(v) => {
            setPositions(v);
            setResult(null);
          }}
        />
        <button className="primary" disabled={busy} onClick={() => void check()}>
          {busy ? 'Conferindo…' : 'Conferir seleção'}
        </button>
        {result && (
          <div role="status" className={`check-result ${result.win ? 'win' : ''}`}>
            <h3>{result.win ? 'Seleção conferiu' : 'Seleção não conferiu'}</h3>
            <p>{result.explanation}</p>
          </div>
        )}
      </section>
    </>
  );
}
export function Dashboard({
  rounds,
  entries,
  favorites,
  now,
}: {
  rounds: Round[];
  entries: {
    id: string;
    mode: ModeId;
    selection: string[];
    points: number;
    created_at: string;
    outcome: { win: boolean } | null;
  }[];
  favorites: number[];
  now: number;
}) {
  const next = rounds.find((r) => r.type === 'TRADITIONAL' && r.state === 'OPEN'),
    last = rounds.find((r) => r.type === 'TRADITIONAL' && r.state === 'PUBLISHED');
  return (
    <>
      <section className="surface dashboard-welcome">
        <div>
          <span className="eyebrow">SEU UNIVERSO DE MODALIDADES</span>
          <h2>A tradição em cada escolha.</h2>
          <p>
            Explore grupos, números e combinações. Acompanhe cinco prêmios, consulte seus bilhetes e
            confira cada resultado.
          </p>
          <div className="button-row">
            <Link className="primary" href="/modalidades">
              Explorar modalidades <ArrowUpRight size={17} />
            </Link>
            <Link href="/conferidor">Abrir conferidor →</Link>
          </div>
        </div>
        <Sparkles size={80} />
      </section>
      <div className="dashboard-summary">
        <Link className="surface" href="/extracoes">
          <Clock />
          <small>PRÓXIMA EXTRAÇÃO</small>
          <strong>
            {next
              ? `${Math.max(0, Math.ceil((new Date(next.locks_at).getTime() - now) / 1000))}s`
              : 'Aguardando'}
          </strong>
          <span>{next ? short(next.id) : 'Consulte a agenda'} →</span>
        </Link>
        <Link className="surface" href="/meus-bilhetes">
          <Ticket />
          <small>MEUS BILHETES</small>
          <strong>{entries.length}</strong>
          <span>{entries.filter((e) => !e.outcome).length} aguardando conferência →</span>
        </Link>
        <Link className="surface" href="/estatisticas">
          <ShieldCheck />
          <small>RESULTADOS PUBLICADOS</small>
          <strong>{rounds.filter((r) => r.state === 'PUBLISHED').length}</strong>
          <span>Explorar estatísticas →</span>
        </Link>
      </div>
      <div className="section-heading">
        <h2>Encontre sua modalidade</h2>
        <Link href="/modalidades">Ver todas as 13 →</Link>
      </div>
      <ModeCatalog compact />
      <section className="surface" style={{ marginBottom: 20 }}>
        <div className="section-heading">
          <h2>Seus bilhetes recentes</h2>
          <Link href="/meus-bilhetes">Ver todos →</Link>
        </div>
        <div className="favorite-shortcuts">
          {entries.slice(0, 3).map((e) => (
            <Link key={e.id} href={`/conferidor?bilhete=${e.id}`}>
              <b>
                {short(e.id)} · {modes.find((m) => m.id === e.mode)?.name}
              </b>
              <p>
                {e.selection.join(' · ')} · {formatBRL(e.points)}
              </p>
              <small>
                {date(e.created_at)} ·{' '}
                {e.outcome ? (e.outcome.win ? 'Conferiu' : 'Não conferiu') : 'Aguardando'}
              </small>
            </Link>
          ))}
          {!entries.length && (
            <p>
              Seu primeiro bilhete começa em <Link href="/modalidades">Modalidades</Link>.
            </p>
          )}
        </div>
      </section>
        <section className="surface draw-channels">
          <span className="eyebrow">DUAS FORMAS DE SORTEIO</span>
          <h2>Roletinha ou transmissão ao vivo</h2>
          <p>Na roletinha, o servidor sorteia e revela um grupo. Na transmissão externa, acompanhe a live do YouTube e confira os cinco milhares publicados pelo administrador.</p>
          <div className="draw-channel-links">
            <Link className="primary" href="/roleta">Ver roletinha →</Link>
            <Link className="secondary" href="/sorteio-youtube">Ver sorteio no YouTube →</Link>
          </div>
        </section>
      <div className="dashboard-bottom">
        <section className="surface">
          <span className="eyebrow">ÚLTIMA EXTRAÇÃO</span>
          <h2>Cinco prêmios publicados</h2>
          {last ? <PrizeTable round={last} /> : <p>Aguardando a primeira publicação.</p>}
          <Link href="/resultados">Ver todos os resultados →</Link>
        </section>
        <section className="surface dashboard-wheel">
          <span className="eyebrow">ROLETINHA VEGAS</span>
          <div className="mini-wheel">♛</div>
          <h2>25 animais. Um giro.</h2>
          <p>Acompanhe a animação dos sorteios registrados.</p>
          <Link className="primary" href="/roleta">
            Entrar na roleta →
          </Link>
        </section>
      </div>
      <section className="surface">
        <h2>Seus animais favoritos</h2>
        <div className="favorite-shortcuts">
          {favorites.length ? (
            favorites.map((id) => (
              <Link key={id} href={`/modalidades/grupo?grupo=${id}`}>
                <AnimalArt id={id} />
                <b>{animals[id - 1].name}</b>
                <small>{animals[id - 1].tens.join(' · ')}</small>
              </Link>
            ))
          ) : (
            <p>
              Marque estrelas em <Link href="/animais">Os 25 animais</Link> para criar seus atalhos.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
export function AdminModes({ notify }: { notify: Notice }) {
  type Config = { enabled: boolean; positions: number; passeSecond: number };
  const [config, setConfig] = useState<Partial<Record<ModeId, Config>>>({}),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void api('admin/modes')
      .then((c) => {
        setConfig(c);
        setLoaded(true);
      })
      .catch((e) => notify(e.message));
  }, [notify]);
  if (!loaded) return <p>Carregando configurações das modalidades…</p>;
  return (
    <section className="surface">
      <h2>Modalidades e convenções</h2>
      <p>
        As alterações valem para novas extrações. Rodadas e bilhetes existentes preservam suas
        regras. Grupo na cabeça usa o 1º prêmio; passe usa o 1º e a posição configurada.
      </p>
      <div className="admin-mode-list">
        {modes.map((m) => {
          const c = config[m.id] || { enabled: true, positions: 5, passeSecond: 2 };
          const update = (v: Partial<Config>) => setConfig({ ...config, [m.id]: { ...c, ...v } });
          return (
            <article key={m.id}>
              <h3>{m.name}</h3>
              <p>{m.description}</p>
              <label>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => update({ enabled: e.target.checked })}
                />{' '}
                Habilitada em novas extrações
              </label>
              {m.positions === 'all' && (
                <label>
                  Prêmios abrangidos (1 até N)
                  <input
                    type="number"
                    min={m.count}
                    max={5}
                    value={c.positions}
                    onChange={(e) => update({ positions: Number(e.target.value) })}
                  />
                </label>
              )}
              {m.positions === 'ordered' && (
                <label>
                  Segundo prêmio do passe
                  <input
                    type="number"
                    min={2}
                    max={5}
                    value={c.passeSecond}
                    onChange={(e) => update({ passeSecond: Number(e.target.value) })}
                  />
                </label>
              )}
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('admin/modes', { mode: m.id, ...c });
                    notify(`${m.name}: configuração salva para novas extrações.`);
                  } catch (e) {
                    notify((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Salvar modalidade
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
