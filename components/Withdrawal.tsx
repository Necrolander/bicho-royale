'use client';
import { formatBRL } from '@/lib/money';
import { useEffect, useRef, useState } from 'react';
import { api } from './Royale';

type Withdrawal = {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  processed_at: string | null;
  admin_note: string | null;
};

export default function WithdrawalScreen({ registered }: { registered: boolean }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<{amount: number; id: string} | null>(null);
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(registered);

  useEffect(() => {
    if (!registered) return;
    let active = true;
    setLoading(true);
    api('withdrawals')
      .then((data) => { if (active) setItems(data); })
      .catch((error: Error) => { if (active) setMessage(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [registered]);

  const renderList = () => {
    if (!items.length) return <p>Nenhum saque solicitado.</p>;

    return items.map((item) => {
      const statusColors: Record<string, string> = {
        PENDING: 'var(--warning)',
        APPROVED: 'var(--success)',
        REJECTED: 'var(--danger)',
      };
      return (
        <div className="withdrawal-item" key={item.id}>
          <div className="withdrawal-header">
            <b>{formatBRL(item.amount_cents)}</b>
            <span style={{ color: statusColors[item.status] || 'var(--muted)' }}>{item.status}</span>
          </div>
          <div className="withdrawal-details">
            <span>Solicitado: {new Date(item.created_at).toLocaleString('pt-BR')}</span>
            {item.processed_at && <span>Processado: {new Date(item.processed_at).toLocaleString('pt-BR')}</span>}
            {item.admin_note && <span style={{fontSize: '0.85rem', color: 'var(--muted)'}}>Obs: {item.admin_note}</span>}
          </div>
        </div>
      );
    });
  };

  return <div className="withdrawal-layout">
    <section className="surface">
      <span className="eyebrow">SAQUES VIA PIX</span>
      <h2>Solicitar saque</h2>
      <p>Saque mínimo de R$ 20,00. Pagamento via Pix em até 24 horas após a solicitação, no CPF cadastrado na conta.</p>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const cents = Math.round(Number(amount.replace(',', '.')) * 100);
        if (!Number.isSafeInteger(cents) || cents < 2000) { setMessage('O saque mínimo é R$ 20,00.'); return; }
        if (busy) return;
        if (request.current?.amount !== cents) request.current = {amount:cents,id:crypto.randomUUID()};
        setBusy(true);
        try {
          await api('withdrawals',{amountCents:cents,requestId:request.current.id});
          request.current = null;
          setAmount('');
          setMessage('Solicitação recebida. Pagamento em até 24 horas.');
          setItems(await api('withdrawals'));
        } catch (error) { setMessage((error as Error).message); }
        finally { setBusy(false); }
      }}>
        <label className="field">Valor em R$<input type="number" inputMode="decimal" min="20" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <button className="primary" disabled={busy || !registered}>{busy ? 'Enviando…' : 'Solicitar saque'}</button>
      </form>
      {message && <p role="alert">{message}</p>}
    </section>
    <section className="surface">
      <span className="eyebrow">SEUS SAQUES</span>
      <h2>Acompanhe o status</h2>
      {loading ? <p role="status">Carregando histórico…</p> : renderList()}
    </section>
  </div>;
}
