'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, Hash, PawPrint, Ticket } from 'lucide-react';
import { animals, type ModeId } from '@/lib/game';
import { AnimalArt } from './AnimalArt';
import { api, type Round } from './Royale';

type BetMode = 'animal' | 'number';
type NumberMode = 'dezena' | 'centena' | 'milhar';
type Receipt = { id: string };

export function SimpleHome({ entries }: { entries: { id: string }[] }) {
  return <div className="simple-home">
    <section className="surface simple-home-hero">
      <span className="eyebrow">COMECE POR AQUI</span>
      <h2>Faça seu jogo em 3 passos.</h2>
      <p>Escolha um bicho ou um número, diga quantos R$ quer usar e confirme. Seu bilhete aparece na sua conta.</p>
      <Link className="primary simple-home-cta" href="/apostar">Apostar no bicho ou número <ArrowRight size={20} /></Link>
      <small>Jogo demonstrativo com R$ fictícios, sem valor em dinheiro.</small>
    </section>
    <div className="simple-home-options">
      <Link className="surface" href="/apostar"><PawPrint size={30} /><b>Jogar no bicho</b><span>Escolha um ou mais dos 25 animais.</span><strong>Escolher bicho →</strong></Link>
      <Link className="surface" href="/apostar?tipo=numero"><Hash size={30} /><b>Jogar no número</b><span>Digite uma dezena, centena ou milhar.</span><strong>Digitar número →</strong></Link>
      <Link className="surface" href="/roleta"><Ticket size={30} /><b>Jogar na roleta</b><span>Veja o giro dos 25 animais.</span><strong>Abrir roleta →</strong></Link>
    </div>
    <section className="surface simple-home-history">
      <div><h2>Seus bilhetes</h2><p>{entries.length ? `Você tem ${entries.length} bilhete(s) salvo(s).` : 'Você ainda não fez seu primeiro jogo.'}</p></div>
      <Link className="secondary" href="/meus-bilhetes">Ver meus bilhetes <ArrowRight size={16} /></Link>
    </section>
  </div>;
}

export function SimpleBet({ rounds, balance, busy, act, notify, initialMode }: {
  rounds: Round[];
  balance: number;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  notify: (message: string) => void;
  initialMode: BetMode;
}) {
  const [mode, setMode] = useState<BetMode>(initialMode);
  const [groups, setGroups] = useState<number[]>([]);
  const [numberMode, setNumberMode] = useState<NumberMode>('dezena');
  const [digits, setDigits] = useState('');
  const [points, setPoints] = useState(10);
  const [receipt, setReceipt] = useState<Receipt[] | null>(null);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const selectedMode: ModeId = mode === 'animal' ? 'grupo' : numberMode;
  const round = rounds.find((item) => item.type === 'TRADITIONAL' && item.state === 'OPEN' && item.rules.modes?.[selectedMode]?.enabled !== false);
  const width = numberMode === 'dezena' ? 2 : numberMode === 'centena' ? 3 : 4;
  const count = mode === 'animal' ? groups.length : 1;
  const total = count * points;
  const selectionReady = mode === 'animal' ? groups.length > 0 : digits.length === width;
  const canSubmit = Boolean(round && selectionReady && points >= 1 && points <= 100 && total <= balance);
  const submit = () => void act(async () => {
    if (!round) throw new Error('Aguarde a abertura da próxima extração.');
    if (!selectionReady) throw new Error(mode === 'animal' ? 'Escolha pelo menos um bicho.' : `Digite os ${width} dígitos do número.`);
    if (!Number.isInteger(points) || points < 1 || points > 100 || total > balance) throw new Error('Confira os R$ disponíveis.');
    const body = { roundId: round.id, mode: selectedMode, selection: mode === 'animal' ? groups.map((id) => String(id).padStart(2, '0')) : [digits], points };
    const fingerprint = JSON.stringify(body);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    const result = await api(mode === 'animal' ? 'entries/groups' : 'entries', { ...body, key: retry.current.key });
    setReceipt(Array.isArray(result) ? result : [result]);
    retry.current = null;
    notify('Bilhete salvo na sua conta.');
  });
  return <div className="simple-bet">
    <div className="simple-steps"><span><b>1</b> Escolha</span><span><b>2</b> Pontos</span><span><b>3</b> Confirme</span></div>
    <section className="surface simple-bet-choice">
      <span className="eyebrow">PASSO 1</span>
      <h2>O que você quer jogar?</h2>
      <p>Toque em bicho ou número. Você pode mudar antes de confirmar.</p>
      <div className="simple-type-picker">
        <button className={mode === 'animal' ? 'selected' : ''} aria-pressed={mode === 'animal'} onClick={() => { setMode('animal'); setReceipt(null); }}><PawPrint size={26} /><b>Bicho</b><small>Escolha um ou mais animais</small></button>
        <button className={mode === 'number' ? 'selected' : ''} aria-pressed={mode === 'number'} onClick={() => { setMode('number'); setReceipt(null); }}><Hash size={26} /><b>Número</b><small>Digite 2, 3 ou 4 dígitos</small></button>
      </div>
      {mode === 'animal' ? <>
        <p className="simple-hint">Toque no animal desejado. Pode escolher vários.</p>
        <div className="simple-animal-grid">
          {animals.map((animal) => <button key={animal.id} aria-pressed={groups.includes(animal.id)} className={groups.includes(animal.id) ? 'selected' : ''} onClick={() => { setGroups((previous) => previous.includes(animal.id) ? previous.filter((id) => id !== animal.id) : [...previous, animal.id]); setReceipt(null); }}>
            <AnimalArt id={animal.id} size={40} /><b>{animal.name}</b><small>Grupo {String(animal.id).padStart(2, '0')}</small>
          </button>)}
        </div>
      </> : <>
        <div className="simple-number-tabs">
          {(['dezena', 'centena', 'milhar'] as const).map((kind) => <button key={kind} className={numberMode === kind ? 'selected' : ''} aria-pressed={numberMode === kind} onClick={() => { setNumberMode(kind); setDigits(''); setReceipt(null); }}>
            {kind === 'dezena' ? 'Dezena · 2 dígitos' : kind === 'centena' ? 'Centena · 3 dígitos' : 'Milhar · 4 dígitos'}
          </button>)}
        </div>
        <label className="field simple-number-input">Digite seu número
          <input inputMode="numeric" pattern={`[0-9]{${width}}`} maxLength={width} value={digits} placeholder={'0'.repeat(width)} onChange={(event) => { setDigits(event.target.value.replace(/\D/g, '').slice(0, width)); setReceipt(null); }} />
        </label>
        <p className="simple-hint">Exemplo: {numberMode === 'dezena' ? '37' : numberMode === 'centena' ? '837' : '0837'}. Digite todos os {width} dígitos, incluindo zeros no início.</p>
      </>}
      {selectionReady && <button className="simple-mobile-next" onClick={() => document.getElementById('simple-bet-summary')?.scrollIntoView({ behavior: 'smooth' })}>Ver meu bilhete · {total} R$ <ArrowRight size={17} /></button>}
    </section>
    <aside className="surface simple-bet-summary" id="simple-bet-summary">
      <span className="eyebrow">PASSOS 2 E 3</span>
      <h2>Confira seu jogo</h2>
      <div className="simple-summary-line"><span>Sua escolha</span><b>{mode === 'animal' ? groups.length ? groups.map((id) => animals[id - 1].name).join(', ') : 'Escolha um bicho acima' : digits.length === width ? `${numberMode}: ${digits}` : `Digite ${width} dígitos acima`}</b></div>
      <label className="field">Valor {mode === 'animal' ? 'por bicho' : 'no número'} (R$)
        <input type="number" min={1} max={100} step={1} value={points} onChange={(event) => { setPoints(Number(event.target.value)); setReceipt(null); }} />
      </label>
      <div className="simple-summary-line"><span>Total</span><strong>{total} R$</strong></div>
      <div className="simple-summary-line"><span>Disponível</span><b>{balance} R$</b></div>
      {total > balance && <p role="alert">Você não tem R$ suficientes para este jogo.</p>}
      <p className="simple-round-info"><Clock3 size={16} /> {round ? `Aceita jogos até ${new Date(round.locks_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}. O resultado aparece em Meus Bilhetes.` : 'Aguarde a próxima extração aberta.'}</p>
      <button className="primary full simple-confirm" disabled={busy || !canSubmit} onClick={submit}>{busy ? 'Salvando…' : 'Confirmar meu bilhete'} <ArrowRight size={18} /></button>
      <small>Jogo demonstrativo com R$ fictícios. Sem depósito ou prêmio em dinheiro.</small>
      {receipt && <div className="simple-success" role="status"><CheckCircle2 size={25} /><b>{receipt.length} bilhete(s) salvo(s)!</b><p>Você pode acompanhar o resultado na sua conta.</p><Link href="/meus-bilhetes">Ver meus bilhetes →</Link></div>}
    </aside>
  </div>;
}
