import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import https from 'node:https';
import { ApiError } from './auth';
import { audit, one, run, transaction } from './db';

export type MercadoPagoConfig = {
  accessToken: string;
  publicKey: string;
  webhookSecret: string;
  environment: 'sandbox' | 'production';
};

export type CreatePaymentResult = {
  id: string;
  externalReference: string;
  amountCents: number;
  status: string;
  paymentMethod: string;
  // Checkout Transparente fields
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  pointOfInteraction?: {
    transactionData?: {
      qrCode?: string;
      qrCodeBase64?: string;
      ticketUrl?: string;
    };
  };
  // For card payments
  statusDetail?: string;
  dateApproved?: string;
};

function mpKey() {
  const value = Buffer.from(process.env.MERCADOPAGO_CONFIG_KEY || '', 'base64');
  if (value.length !== 32) throw new ApiError(503, 'Chave de proteção Mercado Pago não configurada no servidor');
  return value;
}

export function saveMercadoPagoConfig(config: MercadoPagoConfig, actor: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mpKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()]);
  const payload = [iv, cipher.getAuthTag(), encrypted].map((x) => x.toString('base64')).join('.');
  transaction(() => {
    run('INSERT OR REPLACE INTO mercadopago_configs VALUES(?,?,?,?)', 1, payload, config.environment, new Date().toISOString());
    audit(actor, 'MERCADOPAGO_CONFIG_UPDATED', { environment: config.environment });
  });
}

export function mercadoPagoStatus() {
  const row = one('SELECT environment,updated_at FROM mercadopago_configs WHERE id=1');
  const sandboxOnly = row?.environment === 'sandbox';
  return row ? { configured: true, environment: row.environment, updatedAt: row.updated_at,
    paymentsEnabled: process.env.MERCADOPAGO_PAYMENTS_ENABLED === 'true' && sandboxOnly } : { configured: false, paymentsEnabled: false };
}

function loadConfig(): MercadoPagoConfig {
  const row = one('SELECT encrypted FROM mercadopago_configs WHERE id=1');
  if (!row) throw new ApiError(503, 'Mercado Pago ainda não configurado');
  const [iv, tag, payload] = String(row.encrypted).split('.').map((x) => Buffer.from(x, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', mpKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')) as MercadoPagoConfig;
}

export function mercadoPagoCheckoutPublicKey() {
  const config = loadConfig();
  if (config.environment !== 'sandbox' || !config.publicKey.startsWith('TEST-'))
    throw new ApiError(503, 'Checkout disponível somente em ambiente de testes');
  return { publicKey: config.publicKey };
}

export function verifyMercadoPagoWebhookSignature(
  signatureHeader: string | null,
  requestId: string | null,
  dataId: string | null,
): boolean {
  if (!signatureHeader || !requestId || !dataId) return false;
  let secret: string;
  try {
    secret = loadConfig().webhookSecret;
  } catch {
    return false;
  }
  if (!secret) return false;

  const fields = Object.fromEntries(
    signatureHeader.split(',').map((field) => {
      const separator = field.indexOf('=');
      return separator < 0 ? ['', ''] : [field.slice(0, separator).trim(), field.slice(separator + 1).trim()];
    }),
  );
  const timestamp = fields.ts;
  const suppliedHash = fields.v1;
  if (!timestamp || !/^[a-f0-9]{64}$/i.test(suppliedHash || '')) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const expectedHash = createHmac('sha256', secret).update(manifest).digest();
  const receivedHash = Buffer.from(suppliedHash, 'hex');
  return receivedHash.length === expectedHash.length && timingSafeEqual(receivedHash, expectedHash);
}

function mpRequest(
  config: MercadoPagoConfig,
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const host = config.environment === 'production' ? 'api.mercadopago.com' : 'api.mercadopago.com';
  const basePath = '/v1';
  return new Promise((resolve, reject) => {
    const data = body === undefined ? '' : JSON.stringify(body);
    const req = https.request({
      hostname: host,
      path: basePath + path,
      method,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.accessToken}`,
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 128000) { req.destroy(new Error('Resposta Mercado Pago muito grande')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
          if ((response.statusCode || 500) >= 400) reject(new ApiError(502, `Mercado Pago recusou a solicitação (${response.statusCode}).`));
          else resolve(json);
        } catch { reject(new ApiError(502, 'Resposta Mercado Pago inválida')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao conectar ao Mercado Pago')));
    req.on('error', () => reject(new ApiError(502, 'Não foi possível conectar ao Mercado Pago')));
    req.end(data);
  });
}

export async function testMercadoPagoConnection() {
  const config = loadConfig();
  await mpRequest(config, 'GET', '/users/me');
  return { ok: true, environment: config.environment };
}

function requirePayments(config: MercadoPagoConfig) {
  if (process.env.MERCADOPAGO_PAYMENTS_ENABLED !== 'true')
    throw new ApiError(503, 'Depósitos Mercado Pago ainda não estão habilitados');
  if (config.environment !== 'sandbox' || !config.accessToken.startsWith('TEST-') || !config.publicKey.startsWith('TEST-'))
    throw new ApiError(503, 'Pagamentos reais estão desativados; configure credenciais de sandbox para testar');
}

function mapPaymentMethod(method: 'pix' | 'credit_card' | 'boleto'): string {
  switch (method) {
    case 'pix': return 'pix';
    case 'credit_card': return 'credit_card';
    case 'boleto': return 'bolbradesco';
    default: return 'pix';
  }
}

export async function createMercadoPagoPayment(
  userId: string,
  amountCents: number,
  paymentMethod: 'pix' | 'credit_card' | 'boleto',
  payerEmail: string,
  token?: string, // Token do cartão (checkout transparente)
  installments?: number,
  issuerId?: string,
  payerIdentification?: { type: string; number: string },
  cardPaymentMethodId?: string
): Promise<CreatePaymentResult> {
  const config = loadConfig();
  requirePayments(config);
  if (paymentMethod === 'credit_card' && (!token || !cardPaymentMethodId))
    throw new ApiError(400, 'Preencha os dados do cartão para continuar');
  const id = randomUUID();
  const externalReference = randomUUID();
  const mpPaymentMethod = paymentMethod === 'credit_card' ? cardPaymentMethodId! : mapPaymentMethod(paymentMethod);

  transaction(() => {
    run('INSERT INTO mercadopago_deposits(id,user_id,external_reference,amount_cents,payment_method,status,init_point,sandbox_init_point,created_at,confirmed_at,payment_id,qr_code,qr_code_base64,ticket_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, userId, externalReference, amountCents, paymentMethod.toUpperCase(), 'CREATING', null, null, new Date().toISOString(), null, null, null, null, null);
    audit(userId, 'MP_DEPOSIT_REQUESTED', { id, externalReference, amountCents, paymentMethod });
  });

  try {
    const payerData: Record<string, unknown> = {
      email: payerEmail,
      ...(payerIdentification ? { identification: payerIdentification } : {}),
    };
    // Para PIX, adicionar identification com CPF válido (11 dígitos)
    if (paymentMethod === 'pix' && !payerIdentification) {
      // Tenta usar email como CPF (remove não-dígitos), senão usa um CPF de teste
      let cpf = payerEmail.replace(/\D/g, '').slice(0, 11);
      if (cpf.length < 11) cpf = '00000000000'; // CPF genérico para testes
      payerData.identification = { type: 'CPF', number: cpf };
    }

    const paymentData: Record<string, unknown> = {
      transaction_amount: amountCents / 100,
      payment_method_id: mpPaymentMethod,
      external_reference: externalReference,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/mercadopago`,
      payer: payerData,
      // Para PIX e boleto, não precisa de token
      ...(token ? { token } : {}),
      ...(installments ? { installments } : {}),
      ...(issuerId ? { issuer_id: issuerId } : {}),
    };

    // Para cartão, adicionar campos extras se necessário
    if (paymentMethod === 'credit_card' && token) {
      paymentData.token = token;
    }

    const response = await mpRequest(config, 'POST', '/payments', paymentData, externalReference);
    const pointOfInteraction = response.point_of_interaction as
      | { transaction_data?: { qr_code?: unknown; qr_code_base64?: unknown; ticket_url?: unknown }; qr_code?: unknown; qr_code_base64?: unknown; ticket_url?: unknown }
      | undefined;

    // PIX QR code pode vir em point_of_interaction.transaction_data OU direto em point_of_interaction
    const transactionData = pointOfInteraction?.transaction_data;
    const qrCode = (typeof transactionData?.qr_code === 'string' ? transactionData.qr_code
      : typeof pointOfInteraction?.qr_code === 'string' ? pointOfInteraction.qr_code
      : undefined) as string | undefined;
    const qrCodeBase64 = (typeof transactionData?.qr_code_base64 === 'string' ? transactionData.qr_code_base64
      : typeof pointOfInteraction?.qr_code_base64 === 'string' ? pointOfInteraction.qr_code_base64
      : undefined) as string | undefined;
    const ticketUrl = (typeof transactionData?.ticket_url === 'string' ? transactionData.ticket_url
      : typeof pointOfInteraction?.ticket_url === 'string' ? pointOfInteraction.ticket_url
      : undefined) as string | undefined;

    const result: CreatePaymentResult = {
      id,
      externalReference,
      amountCents,
      status: response.status as string,
      paymentMethod: paymentMethod.toUpperCase(),
      qrCode,
      qrCodeBase64,
      ticketUrl,
      statusDetail: response.status_detail as string,
      dateApproved: response.date_approved as string,
    };

    // Atualiza deposit com dados do pagamento
    const updateFields: Record<string, unknown> = {
      status: response.status,
      payment_id: String(response.id),
    };

    if (response.status === 'approved') {
      updateFields.confirmed_at = new Date().toISOString();
    }

    if (result.qrCode) updateFields.qr_code = result.qrCode;
    if (result.qrCodeBase64) updateFields.qr_code_base64 = result.qrCodeBase64;
    if (result.ticketUrl) updateFields.ticket_url = result.ticketUrl;

    transaction(() => {
      if (one('SELECT status FROM mercadopago_deposits WHERE id=?', id)?.status === 'CONFIRMED') {
        delete updateFields.status;
        delete updateFields.confirmed_at;
        delete updateFields.payment_id;
      }
      const setClause = Object.keys(updateFields).map(k => `${k}=?`).join(',');
      const values = [...Object.values(updateFields).map((value) => value == null ? null : String(value)), id];
      if (setClause) run(`UPDATE mercadopago_deposits SET ${setClause} WHERE id=?`, ...values);
      audit(userId, 'MP_DEPOSIT_CREATED', { id, externalReference, mpPaymentId: response.id, status: response.status });
    });

    return result;
  } catch (error) {
    transaction(() => {
      run("UPDATE mercadopago_deposits SET status=? WHERE id=? AND status='CREATING'", 'ERROR', id);
      audit(userId, 'MP_DEPOSIT_FAILED', { id, externalReference });
    });
    throw error;
  }
}

export async function refreshMercadoPagoDeposit(userId: string, id: string) {
  const row = one('SELECT * FROM mercadopago_deposits WHERE id=? AND user_id=?', id, userId);
  if (!row) throw new ApiError(404, 'Depósito não encontrado');
  if (!['PENDING', 'CREATING', 'IN_PROCESS'].includes(String(row.status).toUpperCase())) return { id, status: row.status, amountCents: row.amount_cents, qrCode: row.qr_code, qrCodeBase64: row.qr_code_base64, ticketUrl: row.ticket_url };

  const config = loadConfig();
  const paymentId = row.payment_id;
  if (!paymentId) {
    // Buscar por external_reference se não tem payment_id
    const response = await mpRequest(config, 'GET', `/payments/search?external_reference=${row.external_reference}`);
    const payments = (response.results as Array<Record<string, unknown>>) || [];
    const payment = payments.find(p => p.external_reference === row.external_reference);
    if (payment) return processPaymentResponse(userId, id, payment);
    return { id, status: row.status, amountCents: row.amount_cents, qrCode: row.qr_code, qrCodeBase64: row.qr_code_base64, ticketUrl: row.ticket_url };
  }

  const response = await mpRequest(config, 'GET', `/payments/${encodeURIComponent(String(paymentId))}`);
  return processPaymentResponse(userId, id, response);
}

async function processPaymentResponse(userId: string, depositId: string, payment: Record<string, unknown>) {
  if (String(payment.status).toLowerCase() === 'approved' && payment.external_reference) {
    const paidCents = Math.round(Number(payment.transaction_amount) * 100);
    const row = one('SELECT * FROM mercadopago_deposits WHERE id=?', depositId);
    const paymentId = String(payment.id ?? '');
    if (
      row && payment.external_reference === row.external_reference &&
      /^\d+$/.test(paymentId) && (!row.payment_id || String(row.payment_id) === paymentId) &&
      payment.currency_id === 'BRL' && paidCents === Number(row.amount_cents)
    ) {
      transaction(() => {
        const currentStatus = String(one('SELECT status FROM mercadopago_deposits WHERE id=?', depositId)?.status || '').toUpperCase();
        if (!['PENDING', 'CREATING', 'IN_PROCESS'].includes(currentStatus)) return;
        run('UPDATE mercadopago_deposits SET status=?,confirmed_at=?,payment_id=? WHERE id=?', 'CONFIRMED', new Date().toISOString(), paymentId, depositId);
        audit(userId, 'MP_DEPOSIT_CONFIRMED', { id: depositId, externalReference: String(payment.external_reference), amountCents: paidCents });
      });
    }
  }
  const updated = one('SELECT * FROM mercadopago_deposits WHERE id=?', depositId);
  return {
    id: depositId,
    status: updated?.status,
    amountCents: updated?.amount_cents,
    qrCode: updated?.qr_code,
    qrCodeBase64: updated?.qr_code_base64,
    ticketUrl: updated?.ticket_url,
    paymentId: updated?.payment_id,
  };
}

export async function refreshMercadoPagoDepositAsAdmin(adminId: string, id: string) {
  const row = one('SELECT user_id FROM mercadopago_deposits WHERE id=?', id);
  if (!row) throw new ApiError(404, 'Depósito não encontrado');
  const result = await refreshMercadoPagoDeposit(String(row.user_id), id);
  audit(adminId, 'MP_DEPOSIT_ADMIN_CHECKED', { id, status: result.status });
  return result;
}

export async function handleMercadoPagoWebhook(topic: string, resourceId: string) {
  if (topic !== 'payment') return { received: true };
  if (!/^\d{1,24}$/.test(resourceId)) throw new ApiError(400, 'Identificador de pagamento inválido');
  const config = loadConfig();
  const payment = await mpRequest(config, 'GET', `/payments/${resourceId}`);
  if (String(payment.id) !== resourceId || typeof payment.external_reference !== 'string')
    return { received: true };
  const row = one('SELECT id,user_id FROM mercadopago_deposits WHERE external_reference=?', payment.external_reference);
  if (row) await processPaymentResponse(String(row.user_id), String(row.id), payment);
  return { received: true };
}
