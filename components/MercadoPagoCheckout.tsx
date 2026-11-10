'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './Royale';

type PaymentMethod = 'pix' | 'credit_card' | 'boleto';

interface CreatePaymentRequest {
  amountCents: number;
  paymentMethod: PaymentMethod;
  token?: string;
  installments?: number;
  issuerId?: string;
  identificationType?: string;
  identificationNumber?: string;
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
  const [cardForm, setCardForm] = useState<any>(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const cardFormRef = useRef<HTMLDivElement>(null);
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

  // Auto-create payment for PIX and boleto on mount
  useEffect(() => {
    if (!paymentCreated.current && (paymentMethod === 'pix' || paymentMethod === 'boleto')) {
      paymentCreated.current = true;
      if (paymentMethod === 'pix') handlePixPayment();
      else handleBoletoPayment();
    }
  }, [paymentMethod]);

  const initializeCardForm = () => {
    if (!mpInstanceRef.current || !cardFormRef.current) return;
    try {
      const cardFormInstance = mpInstanceRef.current.cardForm({
        amount: amountCents / 100,
        iframe: true,
        form: {
          id: 'card-form',
          cardNumber: { id: 'cardNumber', placeholder: 'Número do cartão' },
          expirationDate: { id: 'expirationDate', placeholder: 'MM/AA' },
          securityCode: { id: 'securityCode', placeholder: 'Código de segurança' },
          cardholderName: { id: 'cardholderName', placeholder: 'Nome no cartão' },
          issuer: { id: 'issuer', placeholder: 'Banco emissor' },
          installments: { id: 'installments', placeholder: 'Parcelas' },
          identificationType: { id: 'identificationType', placeholder: 'Tipo de documento' },
          identificationNumber: { id: 'identificationNumber', placeholder: 'Número do documento' },
        },
        callbacks: {
          onSubmit: (data: any) => handleCardSubmit(data),
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
      cardFormInstance.mount('#card-form');
      setCardForm(cardFormInstance);
    } catch (error) {
      console.error('Erro ao inicializar card form:', error);
    }
  };

  const handleCardSubmit = async (data: any) => {
    setLoading(true);
    try {
      const result = await createPayment({
        amountCents,
        paymentMethod: 'credit_card',
        token: data.token,
        installments: data.installments,
        issuerId: data.issuer?.id,
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

  const handleBoletoPayment = async () => {
    setLoading(true);
    try {
      const result = await createPayment({
        amountCents,
        paymentMethod: 'boleto',
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

  const copyPixCode = () => {
    if (qrCode) {
      navigator.clipboard.writeText(qrCode);
      alert('Código PIX copiado!');
    }
  };

  const checkPaymentStatus = async () => {
    // This would call the refresh endpoint
    // For now, just close and let the parent handle refresh
    onClose();
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
    <div className="mp-checkout-container">
      <div className="mp-checkout-header">
        <h3>Pagar com Mercado Pago</h3>
        <button className="mp-close-btn" onClick={onClose}>×</button>
      </div>

      {status === 'approved' && (
        <div className="mp-success">
          <div className="success-icon">✓</div>
          <h4>Pagamento aprovado!</h4>
          <p>Seu saldo foi adicionado.</p>
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
              <p className="mp-amount">R$ {(amountCents / 100).toFixed(2).replace('.', ',')}</p>
              {qrCodeBase64 && (
                <div className="mp-qrcode">
                  <img src={`data:image/png;base64,${qrCodeBase64}`} alt="QR Code PIX" />
                </div>
              )}
              {qrCode && !qrCodeBase64 && (
                <div className="mp-qrcode-text">
                  <textarea readOnly value={qrCode} rows={4} />
                  <button className="secondary" onClick={copyPixCode}>Copiar código PIX</button>
                </div>
              )}
              {ticketUrl && (
                <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="mp-ticket-link">
                  Ver comprovante no Mercado Pago
                </a>
              )}
              <p className="mp-instruction">
                Escaneie o QR Code ou copie o código para pagar no app do seu banco.
              </p>
              <button className="secondary" onClick={checkPaymentStatus}>Já paguei, verificar</button>
              <button className="secondary" onClick={onClose}>Cancelar</button>
            </div>
          )}

          {paymentMethod === 'boleto' && (
            <div className="mp-boleto-payment">
              <p className="mp-amount">R$ {(amountCents / 100).toFixed(2).replace('.', ',')}</p>
              {ticketUrl && (
                <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="primary mp-ticket-btn">
                  Abrir boleto
                </a>
              )}
              <p className="mp-instruction">
                O boleto será aberto em nova aba. Pague em qualquer banco ou lotérica.
              </p>
              <button className="secondary" onClick={checkPaymentStatus}>Já paguei, verificar</button>
              <button className="secondary" onClick={onClose}>Cancelar</button>
            </div>
          )}

          {paymentMethod === 'credit_card' && (
            <div className="mp-card-payment">
              <p className="mp-amount">R$ {(amountCents / 100).toFixed(2).replace('.', ',')}</p>
              <div id="card-form" ref={cardFormRef} className="mp-card-form"></div>
              {loading && <div className="mp-submit-loading">Processando...</div>}
              <button className="secondary" onClick={onClose}>Cancelar</button>
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
