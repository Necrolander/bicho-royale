'use client';
import { useEffect, useState } from 'react';
import { api } from './Royale';

type Withdrawal = {
  id: string;
  amount_cents: number;
  status: string;
  cpf: string;
  pix_key: string | null;
  created_at: string;
  processed_at: string | null;
  admin_note: string | null;
};

export default function WithdrawalScreen({ points, registered }: { points: number; registered: boolean }) {
  const [amount, setAmount] = useState('');
  const [cpf, setCpf] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showCpfModal, setShowCpfModal] = useState(false);
  const [tempCpf, setTempCpf] = useState('');
  const [userCpf, setUserCpf] = useState('');

  const load = async () => {
    try {
      if (registered) {
        const data = await api('withdrawals');
        setItems(data);
        // Get user CPF from bootstrap
        const user = await api('bootstrap');
        if (user.user?.cpf) setUserCpf(user.user.cpf);
      }
    } catch (error) { setMessage((error as Error).message); }
  };
  useEffect(() => { if (registered) void load(); }, [registered]);

  const formatCpf = (value: string) => {
    const nums = value.replace(/\D/g, '').slice(0, 11);
    return nums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatPixKey = (value: string) => value;

  const create = async () => {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    const cpfClean = cpf.replace(/\D/g, '');
    if (!Number.isInteger(cents) || cents < 100 || cents > 100000) {
      setMessage('Informe um valor de R$ 1,00 a R$ 1.000,00.'); return;
    }
    if (cents > points) {
      setMessage(`Saldo insuficiente. Você tem ${(points/100).toFixed(2).replace('.', ',')} pts.`); return;
    }
    if (cpfClean.length !== 11) {
      setMessage('CPF deve ter 11 dígitos.'); return;
    }
    if (!userCpf || cpfClean !== userCpf.replace(/\D/g, '')) {
      setMessage('CPF informado não confere com o cadastrado no perfil.'); return;
    }
    setBusy(true); setMessage('');
    try {
      await api('withdrawals', { amountCents: cents, cpf: cpfClean, pixKey: pixKey || undefined });
      setAmount(''); setCpf(''); setPixKey('');
      await load();
      setMessage('Solicitação de saque enviada! Aguarde aprovação do administrador.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };

  const renderForm = () => {
    if (!registered) return <p>Crie uma conta com e-mail e senha antes de solicitar um saque.</p>;

    return (
      <div className="withdrawal-form">
        <div className="balance-card">
          <span className="eyebrow">SALDO DISPONÍVEL</span>
          <b>R$ {(points / 100).toFixed(2).replace('.', ',')}</b>
        </div>
        <label className="field">Valor em reais<input type="number" min="1" max="1000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" /></label>
        <label className="field">CPF (cadastrado no perfil)<input type="text" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" maxLength={14} disabled={!!userCpf} /></label>
        {userCpf && <p style={{fontSize: '0.85rem', color: 'var(--muted)'}}>CPF do perfil: {userCpf}</p>}
        <label className="field">Chave Pix (opcional, padrão: CPF)<input type="text" value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="CPF, e-mail, telefone ou aleatória" /></label>
        <button className="primary full" disabled={busy} onClick={() => void create()}>
          {busy ? 'Enviando...' : 'Solicitar saque via Pix'}
        </button>
        <p style={{fontSize: '0.8rem', color: 'var(--muted)'}}>O administrador receberá a solicitação e enviará o Pix manualmente para a chave informada. O CPF será usado como chave Pix padrão.</p>
      </div>
    );
  };

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
            <b>R$ {(item.amount_cents / 100).toFixed(2).replace('.', ',')}</b>
            <span style={{ color: statusColors[item.status] || 'var(--muted)' }}>{item.status}</span>
          </div>
          <div className="withdrawal-details">
            <span>CPF: {item.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</span>
            <span>Chave Pix: {item.pix_key || item.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</span>
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
      {renderForm()}
      {message && <p role="alert">{message}</p>}
    </section>
    <section className="surface">
      <span className="eyebrow">SEUS SAQUES</span>
      <h2>Acompanhe o status</h2>
      {renderList()}
    </section>
  </div>;
}