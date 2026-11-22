'use client';
import { useEffect, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { api } from './Royale';
import { Gift, Copy, Users, Wallet, CheckCircle2 } from 'lucide-react';

type Summary = {
  code: string;
  rewardCents: number;
  count: number;
  totalCents: number;
  history: { invitee_id: string; reward_cents: number; created_at: string }[];
};

export default function Referrals() {
  const [summary, setSummary] = useState<Summary>();
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    api('referrals')
      .then((data: Summary) => { if (active) setSummary(data); })
      .catch((error: Error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  const link = summary ? new URL(`/inicio?ref=${summary.code}`, window.location.origin).href : '';

  return (
    <div className="referral-panel">
      <span className="eyebrow">PROGRAMA DE INDICAÇÕES</span><h2>Convide amigos. Ganhe saldo.</h2>
      {summary ? (
        <>
          <p className="referral-intro">Compartilhe seu convite e acompanhe as recompensas na sua conta.</p><div className="referral-metrics"><article><Gift size={19}/><small>Por cadastro válido</small><strong>{formatBRL(summary.rewardCents)}</strong></article><article><Users size={19}/><small>Cadastros pelo link</small><strong>{summary.count}</strong></article><article><Wallet size={19}/><small>Total recebido</small><strong>{formatBRL(summary.totalCents)}</strong></article></div><section className="referral-share"><h3>Seu convite começa aqui</h3><p>Envie este link para a pessoa criar a conta com sua indicação.</p>
          <label className="field">Seu link de convite
            <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <button className="primary" onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setMessage('Link copiado.');
            } catch {
              setMessage('Selecione o link acima e copie manualmente.');
            }
          }}><Copy size={15}/>Copiar link de convite</button></section>
          <div className="referral-rules"><CheckCircle2 size={19}/><p>A recompensa de <b>{formatBRL(summary.rewardCents)}</b> é adicionada ao saldo após um novo cadastro válido pelo seu link. Cada conta indicada gera uma recompensa.</p></div><h3>Últimas indicações</h3>{summary.history.length === 0 && <div className="referral-empty"><Users size={24}/><b>Seu primeiro convite pode ser o próximo</b><p>Os cadastros pelo link e os valores recebidos aparecerão aqui.</p></div>}
          {summary.history.length > 0 && <ul aria-label="Últimas indicações">
            {summary.history.map((item) => <li key={item.invitee_id}>
              <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</time>
              <strong>{formatBRL(item.reward_cents)}</strong>
            </li>)}
          </ul>}
        </>
      ) : !message && <p role="status">Carregando indicações…</p>}
      {message && <p role={summary ? 'status' : 'alert'}>{message}</p>}
    </div>
  );
}
