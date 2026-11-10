import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
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
  return row ? { configured: true, environment: row.environment, updatedAt: row.updated_at,
    paymentsEnabled: process.env.MERCADOPAGO_PAYMENTS_ENABLED === 'true' } : { configured: false, paymentsEnabled: false };
}

function loadConfig(): MercadoPagoConfig {
  const row = one('SELECT encrypted FROM mercadopago_configs WHERE id=1');
  if (!row) throw new ApiError(503, 'Mercado Pago ainda não configurado');
  const [iv, tag, payload] = String(row.encrypted).split('.').map((x) => Buffer.from(x, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', mpKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')) as MercadoPagoConfig;
}

function mpRequest(config: MercadoPagoConfig, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
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
          if ((response.statusCode || 500) >= 400) reject(new ApiError(502, `Mercado Pago recusou a solicitação (${response.statusCode}): ${JSON.stringify(json)}`));
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

function requirePayments() {
  if (process.env.MERCADOPAGO_PAYMENTS_ENABLED !== 'true')
    throw new ApiError(503, 'Depósitos Mercado Pago ainda não estão habilitados');
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
  payerIdentification?: { type: string; number: string }
): Promise<CreatePaymentResult> {
  requirePayments();
  const config = loadConfig();
  const id = randomUUID();
  const externalReference = randomUUID();
  const mpPaymentMethod = mapPaymentMethod(paymentMethod);

  transaction(() => {
    run('INSERT INTO mercadopago_deposits VALUES(?,?,?,?,?,?,?,?,?,?)', id, userId, externalReference, amountCents, paymentMethod.toUpperCase(), 'CREATING', null, new Date().toISOString(), null, null);
    audit(userId, 'MP_DEPOSIT_REQUESTED', { id, externalReference, amountCents, paymentMethod });
  });

  try {
    const paymentData: Record<string, unknown> = {
      transaction_amount: amountCents / 100,
      payment_method_id: mpPaymentMethod,
      external_reference: externalReference,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/mercadopago`,
      payer: {
        email: payerEmail,
        ...(payerIdentification ? { identification: payerIdentification } : {}),
      },
      // Para PIX e boleto, não precisa de token
      ...(token ? { token } : {}),
      ...(installments ? { installments } : {}),
      ...(issuerId ? { issuer_id: issuerId } : {}),
    };

    // Para cartão, adicionar campos extras se necessário
    if (paymentMethod === 'credit_card' && token) {
      paymentData.token = token;
    }

    const response = await mpRequest(config, 'POST', '/payments', paymentData);

    const result: CreatePaymentResult = {
      id,
      externalReference,
      amountCents,
      status: response.status as string,
      paymentMethod: paymentMethod.toUpperCase(),
      qrCode: (response.point_of_interaction?.transaction_data?.qr_code as string) || undefined,
      qrCodeBase64: (response.point_of_interaction?.transaction_data?.qr_code_base64 as string) || undefined,
      ticketUrl: (response.point_of_interaction?.transaction_data?.ticket_url as string) || undefined,
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
      const setClause = Object.keys(updateFields).map(k => `${k}=?`).join(',');
      const values = [...Object.values(updateFields), id];
      run(`UPDATE mercadopago_deposits SET ${setClause} WHERE id=?`, ...values);
      audit(userId, 'MP_DEPOSIT_CREATED', { id, externalReference, mpPaymentId: response.id, status: response.status });
    });

    return result;
  } catch (error) {
    transaction(() => {
      run('UPDATE mercadopago_deposits SET status=? WHERE id=?', 'ERROR', id);
      audit(userId, 'MP_DEPOSIT_FAILED', { id, externalReference });
    });
    throw error;
  }
}

export async function refreshMercadoPagoDeposit(userId: string, id: string) {
  const row = one('SELECT * FROM mercadopago_deposits WHERE id=? AND user_id=?', id, userId);
  if (!row) throw new ApiError(404, 'Depósito não encontrado');
  if (row.status !== 'PENDING' && row.status !== 'CREATING') return { id, status: row.status, amountCents: row.amount_cents, qrCode: row.qr_code, qrCodeBase64: row.qr_code_base64, ticketUrl: row.ticket_url };

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

  const response = await mpRequest(config, 'GET', `/payments/${paymentId}`);
  return processPaymentResponse(userId, id, response);
}

async function processPaymentResponse(userId: string, depositId: string, payment: Record<string, unknown>) {
  if (payment.status === 'approved' && payment.external_reference) {
    const paidCents = Math.round(Number(payment.transaction_amount) * 100);
    const row = one('SELECT * FROM mercadopago_deposits WHERE id=?', depositId);
    if (row && paidCents === Number(row.amount_cents)) {
      transaction(() => {
        if (one('SELECT status FROM mercadopago_deposits WHERE id=?', depositId)?.status !== 'PENDING' && one('SELECT status FROM mercadopago_deposits WHERE id=?', depositId)?.status !== 'CREATING') return;
        run('UPDATE mercadopago_deposits SET status=?,confirmed_at=?,payment_id=? WHERE id=?', 'CONFIRMED', new Date().toISOString(), String(payment.id), depositId);
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
  const config = loadConfig();
  if (topic === 'payment') {
    const response = await mpRequest(config, 'GET', `/payments/${resourceId}`);
    const payment = response as Record<string, unknown>;
    if (payment.status === 'approved' && payment.external_reference) {
      const row = one('SELECT * FROM mercadopago_deposits WHERE external_reference=?', String(payment.external_reference));
      if (row && (row.status === 'PENDING' || row.status === 'CREATING')) {
        const paidCents = Math.round(Number(payment.transaction_amount) * 100);
        if (paidCents === Number(row.amount_cents)) {
          transaction(() => {
            if (one('SELECT status FROM mercadopago_deposits WHERE id=?', String(row.id))?.status !== 'PENDING' && one('SELECT status FROM mercadopago_deposits WHERE id=?', String(row.id))?.status !== 'CREATING') return;
            run('UPDATE mercadopago_deposits SET status=?,confirmed_at=?,payment_id=? WHERE id=?', 'CONFIRMED', new Date().toISOString(), String(payment.id), String(row.id));
            audit(String(row.user_id), 'MP_DEPOSIT_CONFIRMED', { id: String(row.id), externalReference: String(row.external_reference), amountCents: paidCents });
          });
        }
      }
    }
  }
  return { received: true };
}