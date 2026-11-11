'use client';
import { useEffect, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { api } from './Royale';

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
      <h2>Indique e Ganhe</h2>
      {summary ? (
        <>
          <p>Ganhe {formatBRL(summary.rewardCents)} em saldo demonstrativo quando uma pessoa criar uma conta pelo seu link.</p>
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
          }}>Copiar link</button>
          <p><strong>{summary.count}</strong> cadastros pelo link · <strong>{formatBRL(summary.totalCents)}</strong> recebidos</p>
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
