'use client';
import { formatBRL } from '@/lib/money';
import { useEffect, useRef, useState } from 'react';
import { api } from './Royale';

type PaymentMethod = 'pix' | 'credit_card' | 'boleto';

interface CreatePaymentRequest {
  amountCents: number;
  paymentMethod: PaymentMethod;
  token?: string;
  installments?: number;
  paymentMethodId?: string;
  issuerId?: string;
  identificationType?: string;
  identificationNumber?: string;
  boletoAddress?: Record<string, string>;
}

interface CreatePaymentResponse {
  id: string;
  externalReference: string;
  amountCents: number;
  status: string;
  paymentMethod: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  statusDetail?: string;
  dateApproved?: string;
}

interface MercadoPagoCheckoutProps {
  amountCents: number;
  paymentMethod: PaymentMethod;
  payerEmail: string;
  onSuccess: (result: CreatePaymentResponse) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export default function MercadoPagoCheckout({
  amountCents,
  paymentMethod,
  payerEmail,
  onSuccess,
  onError,
  onClose,
}: MercadoPagoCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'error'>('pending');
  const [errorMessage, setErrorMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<CreatePaymentResponse | null>(null);
  const [cardForm, setCardForm] = useState<any>(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const cardFormRef = useRef<HTMLFormElement>(null);
  const mpInstanceRef = useRef<any>(null);
  const paymentCreated = useRef(false);

  // Load the card SDK only with the public key returned for a sandbox config.
  useEffect(() => {
    if (paymentMethod !== 'credit_card') return;
    let cancelled = false;
    let script: HTMLScriptElement | undefined;
    const initialize = async () => {
      try {
        const { publicKey } = await api('mercadopago/public-key');
        if (!publicKey) throw new Error('A chave pública de testes do Mercado Pago não está configurada.');
        if (!window.MercadoPago) {
          script = document.createElement('script');
          script.src = 'https://sdk.mercadopago.com/js/v2';
          script.async = true;
          await new Promise<void>((resolve, reject) => {
            script!.onload = () => resolve();
            script!.onerror = () => reject(new Error('Não foi possível carregar o SDK do Mercado Pago.'));
            document.head.appendChild(script!);
          });
        }
        if (cancelled) return;
        if (!window.MercadoPago) throw new Error('O SDK do Mercado Pago não inicializou.');
        mpInstanceRef.current = new window.MercadoPago(publicKey);
        initializeCardForm();
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Não foi possível abrir o formulário de cartão.';
        setErrorMessage(message);
        setStatus('error');
        onError(message);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      script?.remove();
    };
  }, [paymentMethod]);

  // Pix can be generated immediately. Boleto needs a billing address.
  useEffect(() => {
    if (!paymentCreated.current && paymentMethod === 'pix') {
      paymentCreated.current = true;
      handlePixPayment();
    }
  }, [paymentMethod]);

  const initializeCardForm = () => {
    if (!mpInstanceRef.current || !cardFormRef.current) return;
    try {
      let cardFormInstance: any;
      cardFormInstance = mpInstanceRef.current.cardForm({
        amount: (amountCents / 100).toFixed(2),
        iframe: true,
        autoMount: false,
        form: {
          id: 'form-checkout',
          cardNumber: { id: 'form-checkout__cardNumber', placeholder: 'Número do cartão' },
          expirationDate: { id: 'form-checkout__expirationDate', placeholder: 'MM/AA' },
          securityCode: { id: 'form-checkout__securityCode', placeholder: 'Código de segurança' },
          cardholderName: { id: 'form-checkout__cardholderName', placeholder: 'Nome no cartão' },
          issuer: { id: 'form-checkout__issuer', placeholder: 'Banco emissor' },
          installments: { id: 'form-checkout__installments', placeholder: 'Parcelas' },
          identificationType: { id: 'form-checkout__identificationType', placeholder: 'Tipo de documento' },
          identificationNumber: { id: 'form-checkout__identificationNumber', placeholder: 'Número do documento' },
        },
        callbacks: {
          onFormMounted: (error: any) => {
            if (error) {
              const message = 'Não foi possível montar os campos do cartão. Confira a chave pública de sandbox.';
              setErrorMessage(message);
              setStatus('error');
              onError(message);
            }
          },
          onSubmit: (event: Event) => {
            event.preventDefault();
            void handleCardSubmit(cardFormInstance.getCardFormData());
          },
          onError: (error: any) => {
            const message = error?.message || 'Não foi possível carregar os campos do cartão.';
            setErrorMessage(message);
            setStatus('error');
            onError(message);
          },
        },
        style: {
          base: {
            fontSize: '16px',
            color: '#333',
            fontFamily: 'system-ui, sans-serif',
          },
        },
      });
      cardFormInstance.mount();
      setCardForm(cardFormInstance);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível inicializar o formulário do cartão.';
      setErrorMessage(message);
      setStatus('error');
      onError(message);
    }
  };

  const handleCardSubmit = async (data: any) => {
    setLoading(true);
    try {
      const result = await createPayment({
        amountCents,
        paymentMethod: 'credit_card',
        token: data.token,
        installments: Number(data.installments),
        paymentMethodId: data.paymentMethodId,
        issuerId: data.issuerId,
        identificationType: data.identificationType,
        identificationNumber: data.identificationNumber,
      });
      handlePaymentResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao processar cartão';
      setErrorMessage(message);
      setStatus('error');
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  const createPayment = async (data: CreatePaymentRequest): Promise<CreatePaymentResponse> => {
    const response = await api('mercadopago/deposits', data);
    return response;
  };

  const handlePixPayment = async () => {
    setLoading(true);
    try {
      const result = await createPayment({
        amountCents,
        paymentMethod: 'pix',
      });
      handlePaymentResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gerar PIX';
      setErrorMessage(message);
      setStatus('error');
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleBoletoPayment = async (address: FormData) => {
    if (paymentCreated.current) return;
    paymentCreated.current = true;
    setLoading(true);
    try {
      const boletoAddress = Object.fromEntries(
        Array.from(address, ([key, value]) => [key, String(value).trim()]),
      );
      boletoAddress.zip_code = boletoAddress.zip_code.replace(/\D/g, '');
      boletoAddress.federal_unit = boletoAddress.federal_unit.toUpperCase();
      const result = await createPayment({
        amountCents,
        paymentMethod: 'boleto',
        boletoAddress,
      });
      handlePaymentResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gerar boleto';
      setErrorMessage(message);
      setStatus('error');
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentResult = (result: CreatePaymentResponse) => {
    setPaymentResult(result);
    if (result.status === 'approved') {
      setStatus('approved');
      onSuccess(result);
    } else if (result.status === 'pending' || result.status === 'in_process') {
      setStatus('pending');
      if (result.qrCode) setQrCode(result.qrCode);
      if (result.qrCodeBase64) setQrCodeBase64(result.qrCodeBase64);
      if (result.ticketUrl) setTicketUrl(result.ticketUrl);
      if (paymentMethod === 'pix' && !result.qrCode && !result.qrCodeBase64) {
        setStatus('error');
        setErrorMessage('O Mercado Pago não retornou o QR Code. Nenhum pagamento foi iniciado nesta tela.');
      }
    } else {
      setStatus('rejected');
      onError(`Pagamento ${result.statusDetail || result.status}`);
    }
  };

  const copyPixCode = async () => {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopyMessage('Código Pix copiado. Cole no app do seu banco.');
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = qrCode;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand('copy');
      fallback.remove();
      setCopyMessage(copied
        ? 'Código Pix copiado. Cole no app do seu banco.'
        : 'Não foi possível copiar automaticamente. Abra “Ver código Pix” e copie o texto.');
    }
  };

  const checkPaymentStatus = async () => {
    if (!paymentResult?.id) return;
    setCheckingPayment(true);
    setVerificationMessage('Consultando o Mercado Pago…');
    try {
      const result = await api('mercadopago/refresh', { id: paymentResult.id });
      if (paymentMethod === 'boleto' && result.ticketUrl) setTicketUrl(result.ticketUrl);
      const currentStatus = String(result.status || '').toUpperCase();
      if (currentStatus === 'CONFIRMED' || currentStatus === 'APPROVED') {
        setStatus('approved');
        setVerificationMessage('Pagamento confirmado.');
        onSuccess(paymentResult);
      } else {
        setVerificationMessage('Ainda não identificamos o pagamento. Aguarde alguns instantes e consulte novamente.');
      }
    } catch (error) {
      setVerificationMessage(error instanceof Error ? error.message : 'Não foi possível consultar agora. Tente novamente.');
    } finally {
      setCheckingPayment(false);
    }
  };

  if (loading && status === 'pending') {
    return (
      <div className="mp-checkout-loading">
        <div className="spinner"></div>
        <p>Processando pagamento...</p>
      </div>
    );
  }

  return (
    <div className={`mp-checkout-container${paymentMethod === 'credit_card' ? ' mp-card-checkout' : ''}`}>
      <div className="mp-checkout-header">
        <h3>Pagar com Mercado Pago</h3>
        <button className="mp-close-btn" onClick={onClose}>×</button>
      </div>

      {status === 'approved' && (
        <div className="mp-success">
          <div className="success-icon">✓</div>
          <h4>Pagamento aprovado!</h4>
          <p>O pagamento de teste foi registrado no histórico.</p>
          <button className="primary" onClick={onClose}>Fechar</button>
        </div>
      )}

      {status === 'rejected' && (
        <div className="mp-error">
          <div className="error-icon">✕</div>
          <h4>Pagamento não aprovado</h4>
          <p>Tente novamente ou escolha outro método.</p>
          <button className="secondary" onClick={() => setStatus('pending')}>Tentar novamente</button>
          <button className="secondary" onClick={onClose}>Cancelar</button>
        </div>
      )}

      {status === 'error' && (
        <div className="mp-error" role="alert">
          <div className="error-icon">!</div>
          <h4>Checkout indisponível</h4>
          <p>{errorMessage || 'Não foi possível preparar o pagamento.'}</p>
          <button className="secondary" onClick={onClose}>Fechar</button>
        </div>
      )}

      {status === 'pending' && (
        <>
          {paymentMethod === 'pix' && (
            <div className="mp-pix-payment">
              <div className="mp-checkout-summary">
                <span className="mp-test-badge">SANDBOX · TESTE</span>
                <p className="mp-amount">{formatBRL(amountCents)}</p>
                <span className="mp-pending-badge"><i /> Aguardando pagamento</span>
              </div>
              {qrCodeBase64 && (
                <div className="mp-qrcode">
                  <img src={`data:image/png;base64,${qrCodeBase64}`} alt="QR Code PIX" />
                </div>
              )}
              {qrCode && (
                <div className="mp-copy-section">
                  <button className="primary mp-copy-button" onClick={() => void copyPixCode()}>
                    {copyMessage.startsWith('Código Pix copiado') ? 'Código Pix copiado ✓' : 'Copiar código Pix'}
                  </button>
                  <details className="mp-copy-details">
                    <summary>Ver código Pix</summary>
                    <textarea readOnly value={qrCode} rows={4} aria-label="Código Pix copia e cola" onFocus={(event) => event.currentTarget.select()} />
                  </details>
                  {copyMessage && <p className="mp-copy-feedback" role="status">{copyMessage}</p>}
                </div>
              )}
              {ticketUrl && (
                <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="mp-ticket-link">
                  Ver comprovante no Mercado Pago
                </a>
              )}
              <p className="mp-instruction">
                Abra o app do seu banco e escaneie o QR Code. Se estiver usando este aparelho, toque em “Copiar código Pix”.
              </p>
              {verificationMessage && <p className="mp-verification-feedback" role="status">{verificationMessage}</p>}
              <div className="mp-checkout-actions">
                <button className="primary" disabled={checkingPayment} onClick={() => void checkPaymentStatus()}>
                  {checkingPayment ? 'Verificando…' : 'Já paguei · verificar'}
                </button>
                <button className="secondary" onClick={onClose}>Fechar</button>
              </div>
            </div>
          )}

          {paymentMethod === 'boleto' && (
            <div className="mp-boleto-payment">
              <span className="mp-test-badge">AMBIENTE DE TESTE</span>
              <p className="mp-amount">{formatBRL(amountCents)}</p>
              {!paymentResult && (
                <form className="mp-card-form" onSubmit={(event) => {
                  event.preventDefault();
                  void handleBoletoPayment(new FormData(event.currentTarget));
                }}>
                  <div className="mp-card-fields-row">
                    <label>CEP<input name="zip_code" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" placeholder="00000-000" maxLength={9} required /></label>
                    <label>UF<input name="federal_unit" autoComplete="address-level1" pattern="[A-Za-z]{2}" placeholder="SP" maxLength={2} required /></label>
                  </div>
                  <label>Rua<input name="street_name" autoComplete="address-line1" maxLength={120} required /></label>
                  <div className="mp-card-fields-row">
                    <label>Número<input name="street_number" placeholder="S/N se não houver" maxLength={20} required /></label>
                    <label>Bairro<input name="neighborhood" maxLength={80} required /></label>
                  </div>
                  <label>Cidade<input name="city" autoComplete="address-level2" maxLength={80} required /></label>
                  <button type="submit" className="primary">Gerar boleto de teste</button>
                </form>
              )}
              {ticketUrl && (
                <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="primary mp-ticket-btn">
                  Abrir boleto
                </a>
              )}
              {paymentResult && (
                <p className="mp-instruction">{ticketUrl ? 'O boleto de teste abre em uma nova aba.' : 'O Mercado Pago ainda não retornou o link. Consulte o boleto novamente.'}</p>
              )}
              {verificationMessage && <p role="status">{verificationMessage}</p>}
              <div className="mp-checkout-actions">
                {paymentResult && <button className="secondary" disabled={checkingPayment} onClick={checkPaymentStatus}>{ticketUrl ? 'Verificar status' : 'Buscar link do boleto'}</button>}
                <button className="secondary" onClick={onClose}>Fechar</button>
              </div>
            </div>
          )}

          {paymentMethod === 'credit_card' && (
            <div className="mp-card-payment">
              <div className="mp-card-summary">
                <div>
                  <span>VALOR DO DEPÓSITO</span>
                  <strong>{formatBRL(amountCents)}</strong>
                </div>
                <span className="mp-card-secure">AMBIENTE DE TESTE</span>
              </div>
              <div className="mp-card-brand-bar" aria-label="Bandeiras de cartão disponíveis para teste">
                <span className="mp-card-brand-caption">BANDEIRAS DE TESTE</span>
                <div className="mp-card-brand-list">
                  <span className="mp-brand-visa" aria-label="Visa">VISA</span>
                  <span className="mp-brand-mastercard" aria-label="Mastercard"><i /><i /><b>mastercard</b></span>
                  <span className="mp-brand-amex" aria-label="American Express">AMERICAN<br />EXPRESS</span>
                  <span className="mp-brand-elo" aria-label="Elo"><i />elo</span>
                </div>
                <span className="mp-card-brand-note">A bandeira é identificada ao digitar o cartão</span>
              </div>
              <div className="mp-card-section-title">
                <span>1</span>
                <div><strong>Dados do cartão</strong><small>Os dados são enviados com segurança ao Mercado Pago.</small></div>
              </div>
              <form id="form-checkout" ref={cardFormRef} className="mp-card-form">
                <label className="mp-card-full">Número do cartão<div id="form-checkout__cardNumber" className="mp-card-hosted-field" /></label>
                <div className="mp-card-fields-row">
                  <label>Validade<div id="form-checkout__expirationDate" className="mp-card-hosted-field" /></label>
                  <label>CVV<div id="form-checkout__securityCode" className="mp-card-hosted-field" /></label>
                </div>
                <div className="mp-card-fields-row">
                  <label>Nome impresso no cartão<input id="form-checkout__cardholderName" autoComplete="cc-name" placeholder="Como aparece no cartão" /></label>
                  <label>CPF<input id="form-checkout__identificationNumber" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" /></label>
                </div>
                <div className="mp-card-fields-row mp-card-selects-row">
                  <label>Documento<select id="form-checkout__identificationType" defaultValue="CPF" /></label>
                  <label>Banco emissor<select id="form-checkout__issuer" defaultValue="" /></label>
                </div>
                <label className="mp-card-full">Parcelas<select id="form-checkout__installments" defaultValue="" /></label>
                <div className="mp-card-form-actions">
                  <button className="primary" type="submit" disabled={loading || !cardForm}>
                    {loading ? 'Processando pagamento…' : 'Continuar para pagar'}
                  </button>
                  <button className="secondary" type="button" onClick={onClose}>Cancelar</button>
                  <small>Pagamento de demonstração. Nenhuma cobrança real será feita.</small>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Extend Window interface for MercadoPago SDK
declare global {
  interface Window {
    MercadoPago: any;
  }
}
