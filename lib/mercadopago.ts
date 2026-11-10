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
          if ((response.statusCode || 500) >= 400) reject(new ApiError(502, `Mercado Pago recusou a solicitação (${response.statusCode})`));
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

export async function createMercadoPagoDeposit(userId: string, amountCents: number, paymentMethod: 'pix' | 'credit_card' | 'boleto' = 'pix', payerEmail?: string) {
  requirePayments();
  const config = loadConfig();
  const id = randomUUID();
  const externalReference = randomUUID();
  transaction(() => {
    run('INSERT INTO mercadopago_deposits VALUES(?,?,?,?,?,?,?,?,?,?)', id, userId, externalReference, amountCents, paymentMethod.toUpperCase(), 'CREATING', null, new Date().toISOString(), null, null);
    audit(userId, 'MP_DEPOSIT_REQUESTED', { id, externalReference, amountCents, paymentMethod });
  });
  try {
    let preferenceData: Record<string, unknown>;
    if (paymentMethod === 'pix') {
      preferenceData = {
        items: [{ title: 'Bichos Vegas - Créditos', quantity: 1, unit_price: amountCents / 100, currency_id: 'BRL' }],
        payer: { email: payerEmail || 'test@test.com' },
        payment_methods: { excluded_payment_types: [{ id: 'credit_card' }, { id: 'boleto' }], installments: 1 },
        external_reference: externalReference,
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/mercadopago`,
        back_urls: { success: `${process.env.NEXT_PUBLIC_APP_URL}/deposito/sucesso`, failure: `${process.env.NEXT_PUBLIC_APP_URL}/deposito/falha`, pending: `${process.env.NEXT_PUBLIC_APP_URL}/deposito/pendente` },
        auto_return: 'approved',
      };
    } else {
      preferenceData = {
        items: [{ title: 'Bichos Vegas - Créditos', quantity: 1, unit_price: amountCents / 100, currency_id: 'BRL' }],
        payer: { email: payerEmail || 'test@test.com' },
        external_reference: externalReference,
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/mercadopago`,
        back_urls: { success: `${process.env.NEXT_PUBLIC_APP_URL}/deposito/sucesso`, failure: `${process.env.NEXT_PUBLIC_APP_URL}/deposito/falha`, pending: `${process.env.NEXT_PUBLIC_APP_URL}/deposito/pendente` },
        auto_return: 'approved',
      };
    }
    const response = await mpRequest(config, 'POST', '/checkout/preferences', preferenceData);
    const initPoint = response.init_point as string;
    const sandboxInitPoint = response.sandbox_init_point as string;
    transaction(() => {
      run('UPDATE mercadopago_deposits SET status=?,init_point=?,sandbox_init_point=? WHERE id=?', 'PENDING', initPoint, sandboxInitPoint, id);
      audit(userId, 'MP_DEPOSIT_CREATED', { id, externalReference });
    });
    return { id, externalReference, amountCents, status: 'PENDING', initPoint, sandboxInitPoint };
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
  if (row.status !== 'PENDING') return { id, status: row.status, amountCents: row.amount_cents, initPoint: row.init_point };
  const config = loadConfig();
  const response = await mpRequest(config, 'GET', `/payments/search`, undefined);
  const payments = (response.results as Array<Record<string, unknown>>) || [];
  const payment = payments.find(p => p.external_reference === row.external_reference);
  if (payment && payment.status === 'approved') {
    const paidCents = Math.round(Number(payment.transaction_amount) * 100);
    if (paidCents !== Number(row.amount_cents))
      throw new ApiError(502, 'Valor do pagamento divergente');
    transaction(() => {
      if (one('SELECT status FROM mercadopago_deposits WHERE id=?', id)?.status !== 'PENDING') return;
      run('UPDATE mercadopago_deposits SET status=?,confirmed_at=?,payment_id=? WHERE id=?', 'CONFIRMED', new Date().toISOString(), String(payment.id), id);
      audit(userId, 'MP_DEPOSIT_CONFIRMED', { id, externalReference: row.external_reference, amountCents: paidCents });
    });
  }
  return { id, status: one('SELECT status FROM mercadopago_deposits WHERE id=?', id)?.status, amountCents: row.amount_cents, initPoint: row.init_point };
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
      if (row && row.status === 'PENDING') {
        const paidCents = Math.round(Number(payment.transaction_amount) * 100);
        if (paidCents === Number(row.amount_cents)) {
          transaction(() => {
            if (one('SELECT status FROM mercadopago_deposits WHERE id=?', String(row.id))?.status !== 'PENDING') return;
            run('UPDATE mercadopago_deposits SET status=?,confirmed_at=?,payment_id=? WHERE id=?', 'CONFIRMED', new Date().toISOString(), String(payment.id), String(row.id));
            audit(String(row.user_id), 'MP_DEPOSIT_CONFIRMED', { id: String(row.id), externalReference: String(row.external_reference), amountCents: paidCents });
          });
        }
      }
    }
  }
  return { received: true };
}