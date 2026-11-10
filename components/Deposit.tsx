'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from './Royale';
import MercadoPagoCheckout from './MercadoPagoCheckout';
import { ArrowRight, BadgeCheck, CircleAlert, Clock3, CreditCard, QrCode, ShieldCheck, Wallet } from 'lucide-react';

type PixDeposit = { id: string; txid: string; amount_cents: number; amountCents?: number; status: string; copy_paste?: string; copyPaste?: string; created_at?: string };
type MPDeposit = {
  id: string;
  external_reference: string;
  amount_cents: number;
  payment_method: string;
  status: string;
  init_point?: string;
  sandbox_init_point?: string;
  created_at?: string;
  confirmed_at?: string;
  qr_code?: string;
  qr_code_base64?: string;
  ticket_url?: string;
  payment_id?: string;
};

function depositStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: 'Aguardando pagamento',
    CREATING: 'Preparando pagamento',
    CONFIRMED: 'Pagamento confirmado',
    APPROVED: 'Pagamento aprovado',
    REJECTED: 'Pagamento recusado',
    CANCELLED: 'Cancelado',
    EXPIRED: 'Expirado',
  };
  return labels[status] || status.toLowerCase().replaceAll('_', ' ');
}

function paymentLabel(method: string) {
  return method === 'credit_card' ? 'Cartão' : method === 'boleto' ? 'Boleto' : 'Pix';
}

async function copyPix(code: string, setMessage: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(code);
    setMessage('Código Pix copiado.');
  } catch {
    setMessage('Não foi possível copiar automaticamente. Selecione e copie o código Pix.');
  }
}

export default function DepositScreen({
  pixEnabled,
  mpEnabled,
  registered,
  points,
  onRegister,
  onViewAccount,
}: {
  pixEnabled: boolean;
  mpEnabled: boolean;
  registered: boolean;
  points: number;
  onRegister: () => void;
  onViewAccount: () => void;
}) {
  const [amount, setAmount] = useState('10.00');
  const [pixItems, setPixItems] = useState<PixDeposit[]>([]);
  const [mpItems, setMpItems] = useState<MPDeposit[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'pix' | 'mp'>(pixEnabled ? 'pix' : 'mp');
  const [showMPCheckout, setShowMPCheckout] = useState(false);
  const [selectedMPMethod, setSelectedMPMethod] = useState<'pix' | 'credit_card' | 'boleto'>('pix');
  const [userEmail, setUserEmail] = useState('');

  const load = async () => {
    try {
      if (pixEnabled) setPixItems(await api('pix/deposits'));
      if (mpEnabled) setMpItems(await api('mercadopago/deposits'));

      // Get user email for MP payments
      const user = await api('bootstrap');
      if (user.user?.email) setUserEmail(user.user.email);
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

  const openMPCheckout = (paymentMethod: 'pix' | 'credit_card' | 'boleto') => {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    if (!Number.isInteger(cents) || cents < 100 || cents > 100000) {
      setMessage('Informe um valor de R$ 1,00 a R$ 1.000,00.'); return;
    }
    setSelectedMPMethod(paymentMethod);
    setShowMPCheckout(true);
  };

  const handleMPSuccess = async () => {
    setShowMPCheckout(false);
    await load();
    setMessage('Pagamento aprovado! Créditos adicionados.');
  };

  const handleMPError = (error: string) => {
    setMessage(error);
  };

  const handleMPClose = () => {
    setShowMPCheckout(false);
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
    if (!registered) return (
      <div className="deposit-unavailable">
        <div className="deposit-unavailable-icon"><Wallet size={19} /></div>
        <div><b>Entre na sua conta para continuar</b><p>Seu histórico e os créditos ficam vinculados ao seu cadastro.</p></div>
        <button className="primary" onClick={onRegister}>Entrar ou cadastrar <ArrowRight size={15} /></button>
      </div>
    );
    if (!pixEnabled && !mpEnabled) return (
      <div className="deposit-unavailable">
        <div className="deposit-unavailable-icon"><CircleAlert size={19} /></div>
        <div><b>Depósitos temporariamente indisponíveis</b><p>Nenhum meio de pagamento está habilitado agora. Tente novamente mais tarde.</p></div>
      </div>
    );

    return (
      <div className="deposit-form">
        <div className="deposit-amount-picker">
          <div className="deposit-picker-heading"><span>1</span><div><b>Escolha o valor</b><small>De R$ 1,00 a R$ 1.000,00</small></div></div>
          <div className="deposit-presets" aria-label="Valores sugeridos">
            {['10.00', '25.00', '50.00', '100.00'].map((value) => (
              <button type="button" key={value} className={amount === value ? 'selected' : ''} onClick={() => setAmount(value)}>
                R$ {Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </button>
            ))}
          </div>
          <label className="deposit-amount-field"><span>R$</span><input aria-label="Outro valor em reais" type="text" inputMode="decimal" placeholder="Outro valor" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        </div>
        <div className="deposit-picker-heading deposit-payment-heading"><span>2</span><div><b>Escolha como pagar</b><small>O pagamento é confirmado pelo provedor</small></div></div>
        {pixEnabled && (
          activeTab === 'pix' && <button className="primary deposit-pay-button" disabled={busy} onClick={() => void createPix()}>
            <QrCode size={17} /> {busy ? 'Gerando Pix…' : 'Gerar QR Code Pix'} <ArrowRight size={15} />
          </button>
        )}
        {mpEnabled && activeTab === 'mp' && (
          <div className="deposit-mp-methods">
            <button className="primary" disabled={busy || showMPCheckout} onClick={() => openMPCheckout('pix')}><QrCode size={16} /> Pix</button>
            <button className="secondary" disabled={busy || showMPCheckout} onClick={() => openMPCheckout('credit_card')}><CreditCard size={16} /> Cartão</button>
            <button className="secondary" disabled={busy || showMPCheckout} onClick={() => openMPCheckout('boleto')}><Wallet size={16} /> Boleto</button>
          </div>
        )}
        <p className="deposit-security-note"><ShieldCheck size={14} /> A confirmação é consultada junto ao provedor. Não envie comprovantes ou dados do cartão pelo chat.</p>
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
            <div className="deposit-history-heading"><span><QrCode size={15} /> Pix Efí</span><b>R$ {((pix.amount_cents || pix.amountCents || 0) / 100).toFixed(2).replace('.', ',')}</b></div>
            <span className={`deposit-status ${pix.status.toLowerCase()}`}><i />{depositStatusLabel(pix.status)}</span>
            {pix.status === 'PENDING' && code && <>
              <div className="deposit-qr-wrap"><QRCodeSVG value={code} size={170} marginSize={2} /></div>
              <label className="deposit-copy-label">Pix copia e cola<textarea readOnly aria-label="Pix copia e cola" value={code} rows={3} /></label>
              <button className="secondary" onClick={() => void copyPix(code, setMessage)}>Copiar código Pix</button>
              <button className="secondary" disabled={busy} onClick={() => void refreshPix(pix.id)}><Clock3 size={14} /> Verificar pagamento</button>
            </>}
          </div>
        );
      } else {
        const mp = item as MPDeposit;
        const isPending = mp.status === 'PENDING' || mp.status === 'CREATING';

        return (
          <div className="deposit-item" key={item.id}>
            <div className="deposit-history-heading"><span>{mp.payment_method === 'credit_card' ? <CreditCard size={15} /> : mp.payment_method === 'boleto' ? <Wallet size={15} /> : <QrCode size={15} />} Mercado Pago · {paymentLabel(mp.payment_method)}</span><b>R$ {((mp.amount_cents || 0) / 100).toFixed(2).replace('.', ',')}</b></div>
            <span className={`deposit-status ${mp.status.toLowerCase()}`}><i />{depositStatusLabel(mp.status)}</span>
            {isPending && (mp.qr_code || mp.qr_code_base64 || mp.ticket_url) && <>
              {mp.qr_code_base64 && (
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <img src={`data:image/png;base64,${mp.qr_code_base64}`} alt="QR Code PIX" style={{ maxWidth: 200 }} />
                </div>
              )}
              {mp.qr_code && !mp.qr_code_base64 && (
                <div style={{ marginTop: 8 }}>
                  <textarea readOnly value={mp.qr_code} rows={3} style={{ width: '100%' }} />
                  <button className="secondary" onClick={() => void copyPix(mp.qr_code || '', setMessage)}>Copiar código Pix</button>
                </div>
              )}
              {mp.ticket_url && (
                <a href={mp.ticket_url} target="_blank" rel="noopener noreferrer" className="primary" style={{ display: 'inline-block', marginTop: 8 }}>
                  Ver comprovante
                </a>
              )}
              <button className="secondary" disabled={busy} onClick={() => void refreshMP(mp.id)}><Clock3 size={14} /> Verificar pagamento</button>
            </>}
            {isPending && !mp.qr_code && !mp.qr_code_base64 && !mp.ticket_url && mp.init_point && <>
              <a href={mp.init_point} target="_blank" rel="noopener noreferrer" className="primary" style={{ display: 'inline-block', marginTop: 8 }}>
                Acessar pagamento (Checkout Pro)
              </a>
              <button className="secondary" disabled={busy} onClick={() => void refreshMP(mp.id)}><Clock3 size={14} /> Verificar pagamento</button>
            </>}
            {mp.status === 'CONFIRMED' && <span className="deposit-confirmed"><BadgeCheck size={14} /> Créditos confirmados</span>}
          </div>
        );
      }
    });
  };

  return <div className="deposit-page">
    <section className="surface deposit-page-hero">
      <div className="deposit-page-hero-copy">
        <span className="eyebrow"><Wallet size={14} /> CARTEIRA BICHOS VEGAS</span>
        <h2>Adicionar créditos</h2>
        <p>Escolha um valor e pague pelo método que preferir. Você acompanha a confirmação e o histórico por aqui.</p>
        <div className="deposit-trust-points">
          <span><ShieldCheck size={14} /> Confirmação pelo provedor</span>
          <span><Clock3 size={14} /> Status atualizado nesta tela</span>
        </div>
      </div>
      <button className="deposit-balance-card" onClick={onViewAccount}>
        <span>SEU SALDO ATUAL</span>
        <strong>{points.toLocaleString('pt-BR')}</strong>
        <small>créditos <ArrowRight size={13} /></small>
      </button>
    </section>

    <div className="pix-deposit-layout">
      <section className="surface deposit-builder">
        <div className="deposit-section-heading">
          <div className="deposit-section-icon"><CreditCard size={18} /></div>
          <div><span className="eyebrow">NOVO PAGAMENTO</span><h3>Como deseja adicionar?</h3></div>
        </div>
        {registered && (pixEnabled || mpEnabled) && (
          <div className="deposit-provider-tabs" role="tablist" aria-label="Provedor de pagamento">
            {pixEnabled && <button role="tab" aria-selected={activeTab === 'pix'} onClick={() => { setActiveTab('pix'); setMessage(''); }} className={activeTab === 'pix' ? 'selected' : ''}><QrCode size={16} /><span><b>Pix Efí</b><small>QR Code e copia e cola</small></span></button>}
            {mpEnabled && <button role="tab" aria-selected={activeTab === 'mp'} onClick={() => { setActiveTab('mp'); setMessage(''); }} className={activeTab === 'mp' ? 'selected' : ''}><Wallet size={16} /><span><b>Mercado Pago</b><small>Pix, cartão ou boleto</small></span></button>}
          </div>
        )}
        {activeTab === 'pix' && pixEnabled && registered && <p className="deposit-provider-hint">Pagamento Pix pela Efí. O QR Code é gerado após confirmar o valor.</p>}
        {activeTab === 'mp' && mpEnabled && registered && <p className="deposit-provider-hint">Pagamento processado pelo Mercado Pago. Escolha Pix, cartão ou boleto.</p>}
        {renderDepositForm()}
        {message && <div className={`deposit-message ${message.includes('copiado') || message.includes('aprovado') ? 'success' : ''}`} role="status"><CircleAlert size={15} />{message}</div>}
      </section>

      <section className="surface deposit-history">
        <div className="deposit-section-heading">
          <div className="deposit-section-icon"><Clock3 size={18} /></div>
          <div><span className="eyebrow">SEU HISTÓRICO</span><h3>Pagamentos e confirmações</h3></div>
        </div>
        <p className="deposit-history-intro">{activeTab === 'pix' ? 'Atividade de Pix pela Efí.' : 'Atividade processada pelo Mercado Pago.'}</p>
        <div className="deposit-history-list">{renderDepositList()}</div>
      </section>
    </div>

    {showMPCheckout && userEmail && (
      <MercadoPagoCheckout
        amountCents={Math.round(Number(amount.replace(',', '.')) * 100)}
        paymentMethod={selectedMPMethod}
        payerEmail={userEmail}
        onSuccess={handleMPSuccess}
        onError={handleMPError}
        onClose={handleMPClose}
      />
    )}
    {showMPCheckout && !userEmail && (
      <div className="mp-checkout-container" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div className="surface" style={{ padding: 24, borderRadius: 8, maxWidth: 400 }}>
          <h3>E-mail necessário</h3>
          <p>Você precisa ter uma conta com e-mail cadastrado para usar o Mercado Pago.</p>
          <button className="primary" onClick={handleMPClose}>OK</button>
        </div>
      </div>
    )}
  </div>;
}
