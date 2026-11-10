'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from './Royale';

type PixDeposit = { id: string; txid: string; amount_cents: number; amountCents?: number; status: string; copy_paste?: string; copyPaste?: string; created_at?: string };
type MPDeposit = { id: string; external_reference: string; amount_cents: number; payment_method: string; status: string; init_point?: string; sandbox_init_point?: string; created_at?: string; confirmed_at?: string };

export default function DepositScreen({ pixEnabled, mpEnabled, registered }: { pixEnabled: boolean; mpEnabled: boolean; registered: boolean }) {
  const [amount, setAmount] = useState('10.00');
  const [pixItems, setPixItems] = useState<PixDeposit[]>([]);
  const [mpItems, setMpItems] = useState<MPDeposit[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'pix' | 'mp'>('pix');

  const load = async () => {
    try {
      if (pixEnabled) setPixItems(await api('pix/deposits'));
      if (mpEnabled) setMpItems(await api('mercadopago/deposits'));
    } catch (error) { setMessage((error as Error).message); }
  };
  useEffect(() => { if (registered) void load(); }, [registered, pixEnabled, mpEnabled]);

  const createPix = async () => {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    if (!Number.isInteger(cents) || cents < 100 || cents > 100000) {
      setMessage('Informe um valor de R$ 1,00 a R$ 1.000,00.'); return;
    }
    setBusy(true); setMessage('');
    try { await api('pix/deposits', { amountCents: cents }); await load(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };

  const createMP = async (paymentMethod: 'pix' | 'credit_card' | 'boleto' = 'pix') => {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    if (!Number.isInteger(cents) || cents < 100 || cents > 100000) {
      setMessage('Informe um valor de R$ 1,00 a R$ 1.000,00.'); return;
    }
    setBusy(true); setMessage('');
    try { await api('mercadopago/deposits', { amountCents: cents, paymentMethod }); await load(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };

  const refreshPix = async (id: string) => {
    setBusy(true); setMessage('');
    try { await api('pix/refresh', { id }); await load(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };

  const refreshMP = async (id: string) => {
    setBusy(true); setMessage('');
    try { await api('mercadopago/refresh', { id }); await load(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };

  const renderDepositForm = () => {
    if (!registered) return <p>Crie uma conta com e-mail e senha antes de solicitar um depósito.</p>;
    if (!pixEnabled && !mpEnabled) return <p>Depósitos ainda não estão disponíveis. A configuração bancária e a liberação da operação estão pendentes.</p>;

    return (
      <div className="deposit-form">
        <label className="field">Valor em reais<input type="number" min="1" max="1000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        {pixEnabled && (
          <button className="primary" disabled={busy || activeTab !== 'pix'} onClick={() => void createPix()}>
            {activeTab === 'pix' ? 'Gerar Pix (Efí)' : 'Gerar Pix (Efí)'}
          </button>
        )}
        {mpEnabled && (
          <div style={{ marginTop: 8 }}>
            <button className="primary" disabled={busy || activeTab !== 'mp'} onClick={() => void createMP('pix')}>
              Pagar com Mercado Pago (Pix)
            </button>
            <button className="secondary" disabled={busy || activeTab !== 'mp'} onClick={() => void createMP('credit_card')}>
              Pagar com Mercado Pago (Cartão)
            </button>
            <button className="secondary" disabled={busy || activeTab !== 'mp'} onClick={() => void createMP('boleto')}>
              Pagar com Mercado Pago (Boleto)
            </button>
          </div>
        )}
        <p>A confirmação vem diretamente do provedor. Não envie comprovantes pelo site.</p>
      </div>
    );
  };

  const renderDepositList = () => {
    const items = activeTab === 'pix' ? pixItems : mpItems;
    if (!items.length) return <p>Nenhum depósito solicitado.</p>;

    return items.map((item) => {
      if (activeTab === 'pix') {
        const pix = item as PixDeposit;
        const code = pix.copy_paste || pix.copyPaste;
        return (
          <div className="deposit-item" key={item.id}>
            <b>R$ {((pix.amount_cents || pix.amountCents || 0) / 100).toFixed(2).replace('.', ',')}</b>
            <span>{pix.status}</span>
            {pix.status === 'PENDING' && code && <>
              <QRCodeSVG value={code} size={180} marginSize={2} />
              <textarea readOnly aria-label="Pix copia e cola" value={code} rows={3} />
              <button className="secondary" onClick={() => void navigator.clipboard.writeText(code)}>Copiar código Pix</button>
              <button className="secondary" disabled={busy} onClick={() => void refreshPix(pix.id)}>Verificar pagamento</button>
            </>}
          </div>
        );
      } else {
        const mp = item as MPDeposit;
        return (
          <div className="deposit-item" key={item.id}>
            <b>R$ {((mp.amount_cents || 0) / 100).toFixed(2).replace('.', ',')}</b>
            <span>{mp.status} · {mp.payment_method}</span>
            {mp.status === 'PENDING' && mp.init_point && <>
              <a href={mp.init_point} target="_blank" rel="noopener noreferrer" className="primary" style={{ display: 'inline-block', marginTop: 8 }}>
                Acessar pagamento
              </a>
              <button className="secondary" disabled={busy} onClick={() => void refreshMP(mp.id)}>Verificar pagamento</button>
            </>}
            {mp.status === 'CONFIRMED' && <span style={{ color: 'var(--success)' }}>✓ Confirmado</span>}
          </div>
        );
      }
    });
  };

  return <div className="pix-deposit-layout">
    <section className="surface">
      <span className="eyebrow">DEPÓSITOS</span>
      <h2>Adicionar créditos</h2>
      <div className="tabs" role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {pixEnabled && <button role="tab" aria-selected={activeTab === 'pix'} onClick={() => setActiveTab('pix')} className={activeTab === 'pix' ? 'primary' : 'secondary'}>Efí Pix</button>}
        {mpEnabled && <button role="tab" aria-selected={activeTab === 'mp'} onClick={() => setActiveTab('mp')} className={activeTab === 'mp' ? 'primary' : 'secondary'}>Mercado Pago</button>}
      </div>
      {renderDepositForm()}
      {message && <p role="alert">{message}</p>}
    </section>
    <section className="surface">
      <span className="eyebrow">SEUS DEPÓSITOS</span>
      <h2>Acompanhe a confirmação</h2>
      {renderDepositList()}
    </section>
  </div>;
}
