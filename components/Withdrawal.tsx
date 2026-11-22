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

export default function WithdrawalScreen({ registered, balance, cpf, refresh }: { registered: boolean; balance: number; cpf: string | null; refresh: () => Promise<void> }) {
  const [customPix, setCustomPix] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<{amount: number; id: string; key: string} | null>(null);
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
    if (!items.length) return <div className="withdrawal-empty"><ArrowUpRight size={26} /><b>Seu histórico começa aqui</b><p>Após solicitar um saque, você acompanha o pagamento nesta área.</p></div>;

    return items.slice(0, 5).map((item) => {
      const deadline = new Date(new Date(item.created_at).getTime() + 24 * 60 * 60 * 1000);
      const Icon = item.status === 'APPROVED' ? CheckCircle2 : item.status === 'REJECTED' ? XCircle : Clock3;
      return (
        <article className="withdrawal-item" key={item.id}>
          <div className="withdrawal-header">
            <div className="withdrawal-value"><span className="withdrawal-icon"><ArrowUpRight size={20} /></span><div><small>Saque via Pix</small><b>{formatBRL(item.amount_cents)}</b></div></div>
            <span className={`withdrawal-status withdrawal-status-${item.status.toLowerCase()}`}><Icon size={14} />{statusLabels[item.status] || 'Em análise'}</span>
          </div>
          <div className="withdrawal-details">
            <div><small>Protocolo</small><span title={item.id}>#{item.id.slice(0, 8).toUpperCase()}</span></div><div><small>Solicitado em</small><time dateTime={item.created_at}>{dateFormat.format(new Date(item.created_at))}</time></div>
            {item.status === 'PENDING' && <div><small>Pagamento previsto até</small><time dateTime={deadline.toISOString()}>{dateFormat.format(deadline)}</time></div>}
            {item.processed_at && <div><small>Processado em</small><time dateTime={item.processed_at}>{dateFormat.format(new Date(item.processed_at))}</time></div>}
          </div>
          {item.status === 'PENDING' && <p className="withdrawal-item-note"><Clock3 size={14} /> O pagamento é realizado em até 24 horas após a solicitação.</p>}
          {item.admin_note && <p className="withdrawal-item-note">{item.admin_note}</p>}
        </article>
      );
    });
  };

  return <div className="withdrawal-layout withdrawal-workspace">
    <section className="withdrawal-intro"><div><span className="eyebrow">CARTEIRA BICHOS VEGAS</span><h2>Seu saldo. Seu próximo passo.</h2><p>Solicite a transferência via Pix e acompanhe cada atualização por aqui.</p></div><div className="withdrawal-balance"><small>DISPONÍVEL PARA SOLICITAR</small><strong>{formatBRL(balance)}</strong><span>Valor mínimo de R$ 20,00</span></div></section>
    <div className="withdrawal-columns">
    <section className="surface withdrawal-request">
      <span className="eyebrow">SAQUES VIA PIX</span>
      <h2>Transferir via Pix</h2>
      <p>Informe o valor e confira o destino da transferência.</p><div className="withdrawal-destination"><small>DESTINO DO PAGAMENTO</small><b>{customPix ? 'Outra chave Pix' : 'Pix · CPF da sua conta'}</b><span>{cpf || 'Cadastre seu CPF nas configurações da conta.'}</span><label className="field">Destino<select value={customPix ? 'custom' : 'cpf'} onChange={(event) => setCustomPix(event.target.value === 'custom')}><option value="cpf">CPF cadastrado</option><option value="custom">Usar outra chave Pix</option></select></label>{customPix && <label className="field">Chave Pix<input value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder="CPF, telefone, e-mail ou chave aleatória" maxLength={200} /></label>}</div>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const cents = Math.round(Number(amount.replace(',', '.')) * 100);
        if (!Number.isSafeInteger(cents) || cents < 2000) { setMessage('O saque mínimo é R$ 20,00.'); return; }
        if (cents > balance) { setMessage('O valor solicitado é maior que o saldo disponível.'); return; }
        if (busy) return;
        const key = customPix ? pixKey.trim() : '';
        if (customPix && !key) { setMessage('Informe a chave Pix de destino.'); return; }
        if (request.current?.amount !== cents || request.current?.key !== key) request.current = {amount:cents,id:crypto.randomUUID(),key};
        setBusy(true);
        try {
          await api('withdrawals',{amountCents:cents,requestId:request.current.id,pixKey:key || undefined});
          request.current = null;
          setAmount('');
          setMessage('Solicitação recebida. Pagamento em até 24 horas.');
          setItems(await api('withdrawals'));
          await refresh();
        } catch (error) { setMessage((error as Error).message); }
        finally { setBusy(false); }
      }}>
        <label className="field">Valor em R$<input type="number" inputMode="decimal" min="20" max={balance / 100} step="0.01" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
<div className="withdrawal-quick"><button type="button" disabled={busy || balance < 2000} onClick={() => setAmount((balance / 100).toFixed(2))}>Usar saldo disponível</button></div>
        <button className="primary" disabled={busy || !registered || !cpf || balance < 2000}>{busy ? 'Enviando…' : 'Solicitar saque'}</button>
      </form>
      {message && <p role="alert">{message}</p>}
    </section>
    <aside className="surface withdrawal-explainer"><span className="eyebrow">SOBRE SUA SOLICITAÇÃO</span><h2>Clareza em cada etapa</h2><div><Clock3 size={20} /><section><b>Pagamento em até 24 horas</b><p>O prazo começa no momento em que a solicitação é registrada.</p></section></div><div><ArrowUpRight size={20} /><section><b>Valor reservado no saldo</b><p>Ao solicitar, o valor sai do saldo disponível enquanto aguarda o pagamento.</p></section></div><div><CheckCircle2 size={20} /><section><b>Acompanhamento pela conta</b><p>Veja o status e a data de processamento no histórico. Em caso de rejeição, o valor retorna ao saldo.</p></section></div></aside></div>
    <section className="surface withdrawal-history">
      <span className="eyebrow">SEUS SAQUES</span>
      <h2>Histórico de solicitações</h2><p className="withdrawal-history-caption">Valores, prazos e atualizações em um só lugar. Horários de Brasília.</p>
      {loading ? <p role="status">Carregando histórico…</p> : renderList()}
    </section>
  </div>;
}
