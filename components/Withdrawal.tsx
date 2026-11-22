'use client';
import { formatBRL } from '@/lib/money';
import { useEffect, useRef, useState } from 'react';
import { api } from './Royale';
import { ArrowUpRight, Clock3, CheckCircle2, XCircle } from 'lucide-react';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const statusLabels: Record<string, string> = { PENDING: 'Aguardando pagamento', APPROVED: 'Pago', REJECTED: 'Rejeitado' };

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
      const deadline = new Date(new Date(item.created_at).getTime() + 24 * 60 * 60 * 1000);
      const Icon = item.status === 'APPROVED' ? CheckCircle2 : item.status === 'REJECTED' ? XCircle : Clock3;
      return (
        <article className="withdrawal-item" key={item.id}>
          <div className="withdrawal-header">
            <div className="withdrawal-value"><span className="withdrawal-icon"><ArrowUpRight size={20} /></span><div><small>Saque via Pix</small><b>{formatBRL(item.amount_cents)}</b></div></div>
            <span className={`withdrawal-status withdrawal-status-${item.status.toLowerCase()}`}><Icon size={14} />{statusLabels[item.status] || 'Em análise'}</span>
          </div>
          <div className="withdrawal-details">
            <div><small>Solicitado em</small><time dateTime={item.created_at}>{dateFormat.format(new Date(item.created_at))}</time></div>
            {item.status === 'PENDING' && <div><small>Pagamento previsto até</small><time dateTime={deadline.toISOString()}>{dateFormat.format(deadline)}</time></div>}
            {item.processed_at && <div><small>Processado em</small><time dateTime={item.processed_at}>{dateFormat.format(new Date(item.processed_at))}</time></div>}
          </div>
          {item.status === 'PENDING' && <p className="withdrawal-item-note"><Clock3 size={14} /> O pagamento é realizado em até 24 horas após a solicitação.</p>}
          {item.admin_note && <p className="withdrawal-item-note">{item.admin_note}</p>}
        </article>
      );
    });
  };

  return <div className="withdrawal-layout">
    <section className="surface withdrawal-request">
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
    <section className="surface withdrawal-history">
      <span className="eyebrow">SEUS SAQUES</span>
      <h2>Acompanhe o status</h2>
      {loading ? <p role="status">Carregando histórico…</p> : renderList()}
    </section>
  </div>;
}
