import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import https from 'node:https';
import { ApiError } from './auth';
import { audit, one, run, transaction } from './db';

export type EfiConfig = {
  clientId: string;
  clientSecret: string;
  pixKey: string;
  certificateP12: string;
  certificatePassword: string;
  environment: 'homologation' | 'production';
};

function key() {
  const value = Buffer.from(process.env.EFI_CONFIG_KEY || '', 'base64');
  if (value.length !== 32) throw new ApiError(503, 'Chave de proteção Efí não configurada no servidor');
  return value;
}
export function saveEfiConfig(config: EfiConfig, actor: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(config)), cipher.final()]);
  const payload = [iv, cipher.getAuthTag(), encrypted].map((x) => x.toString('base64')).join('.');
  transaction(() => {
    run('INSERT OR REPLACE INTO efi_configs VALUES(?,?,?,?,?)', 1, payload, config.environment,
      `${config.pixKey.slice(0, 3)}…${config.pixKey.slice(-4)}`, new Date().toISOString());
    audit(actor, 'EFI_CONFIG_UPDATED', { environment: config.environment });
  });
}
export function efiStatus() {
  const row = one('SELECT environment,pix_key_hint,updated_at FROM efi_configs WHERE id=1');
  return row ? { configured: true, environment: row.environment, pixKeyHint: row.pix_key_hint, updatedAt: row.updated_at,
    paymentsEnabled: process.env.EFI_PAYMENTS_ENABLED === 'true' && row.environment === 'homologation' } : { configured: false, paymentsEnabled: false };
}
function loadConfig(): EfiConfig {
  const row = one('SELECT encrypted FROM efi_configs WHERE id=1');
  if (!row) throw new ApiError(503, 'Efí ainda não configurada');
  const [iv, tag, payload] = String(row.encrypted).split('.').map((x) => Buffer.from(x, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')) as EfiConfig;
}
function request(config: EfiConfig, method: string, path: string, body?: unknown, token?: string): Promise<Record<string, unknown>> {
  const host = config.environment === 'production' ? 'pix.api.efipay.com.br' : 'pix-h.api.efipay.com.br';
  return new Promise((resolve, reject) => {
    const data = body === undefined ? '' : JSON.stringify(body);
    const req = https.request({
      hostname: host, path, method, pfx: Buffer.from(config.certificateP12, 'base64'),
      passphrase: config.certificatePassword || '', timeout: 15000,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}` }),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 128000) { req.destroy(new Error('Resposta Efí muito grande')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
          if ((response.statusCode || 500) >= 400) reject(new ApiError(502, `Efí recusou a solicitação (${response.statusCode})`));
          else resolve(json);
        } catch { reject(new ApiError(502, 'Resposta Efí inválida')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao conectar à Efí')));
    req.on('error', () => reject(new ApiError(502, 'Não foi possível conectar à Efí')));
    req.end(data);
  });
}
async function accessToken(config: EfiConfig) {
  const response = await request(config, 'POST', '/oauth/token', { grant_type: 'client_credentials' });
  if (typeof response.access_token !== 'string') throw new ApiError(502, 'Efí não retornou autorização');
  return response.access_token;
}
export async function testEfiConnection() {
  const config = loadConfig();
  await accessToken(config);
  return { ok: true, environment: config.environment };
}
function requirePayments() {
  if (process.env.EFI_PAYMENTS_ENABLED !== 'true')
    throw new ApiError(503, 'Depósitos Pix ainda não estão habilitados');
}
export async function createPixDeposit(userId: string, amountCents: number) {
  requirePayments();
  const config = loadConfig();
  if (config.environment !== 'homologation')
    throw new ApiError(503, 'Depósitos Efí disponíveis apenas em homologação.');
  const id = randomUUID();
  const txid = randomBytes(16).toString('hex');
  transaction(() => {
    run('INSERT INTO pix_deposits VALUES(?,?,?,?,?,?,?,?,?)', id, userId, txid, amountCents, 'CREATING', null, new Date().toISOString(), null, null);
    audit(userId, 'PIX_DEPOSIT_REQUESTED', { id, txid, amountCents });
  });
  try {
    const token = await accessToken(config);
    const response = await request(config, 'PUT', `/v2/cob/${txid}`, {
      calendario: { expiracao: 3600 }, valor: { original: (amountCents / 100).toFixed(2) },
      chave: config.pixKey, solicitacaoPagador: 'Bichos Vegas',
    }, token);
    if (response.txid !== txid || typeof response.pixCopiaECola !== 'string')
      throw new ApiError(502, 'Cobrança Efí incompleta');
    transaction(() => {
      run('UPDATE pix_deposits SET status=?,copy_paste=? WHERE id=?', 'PENDING', response.pixCopiaECola as string, id);
      audit(userId, 'PIX_DEPOSIT_CREATED', { id, txid });
    });
    return { id, txid, amountCents, status: 'PENDING', copyPaste: response.pixCopiaECola };
  } catch (error) {
    transaction(() => {
      run('UPDATE pix_deposits SET status=? WHERE id=?', 'ERROR', id);
      audit(userId, 'PIX_DEPOSIT_FAILED', { id, txid });
    });
    throw error;
  }
}
export async function refreshPixDeposit(userId: string, id: string) {
  const row = one('SELECT * FROM pix_deposits WHERE id=? AND user_id=?', id, userId);
  if (!row) throw new ApiError(404, 'Depósito não encontrado');
  if (row.status !== 'PENDING') return { id, status: row.status, amountCents: row.amount_cents, copyPaste: row.copy_paste };
  const config = loadConfig();
  const token = await accessToken(config);
  const response = await request(config, 'GET', `/v2/cob/${row.txid}`, undefined, token);
  if (response.txid !== row.txid) throw new ApiError(502, 'Identificador da cobrança diverge');
  if (response.status === 'CONCLUIDA') {
    const pix = Array.isArray(response.pix) ? response.pix[0] as Record<string, unknown> | undefined : undefined;
    const paidCents = Math.round(Number(pix?.valor) * 100);
    if (paidCents !== Number(row.amount_cents) || typeof pix?.endToEndId !== 'string')
      throw new ApiError(502, 'Valor ou comprovante Pix divergente');
    transaction(() => {
      if (one('SELECT status FROM pix_deposits WHERE id=?', id)?.status !== 'PENDING') return;
      run('UPDATE pix_deposits SET status=?,confirmed_at=?,e2e_id=? WHERE id=?', 'CONFIRMED', new Date().toISOString(), pix.endToEndId as string, id);
      audit(userId, 'PIX_DEPOSIT_CONFIRMED', { id, txid: row.txid, amountCents: paidCents });
    });
  }
  return { id, status: one('SELECT status FROM pix_deposits WHERE id=?', id)?.status, amountCents: row.amount_cents, copyPaste: row.copy_paste };
}
export async function refreshPixDepositAsAdmin(adminId: string, id: string) {
  const row = one('SELECT user_id FROM pix_deposits WHERE id=?', id);
  if (!row) throw new ApiError(404, 'Depósito não encontrado');
  const result = await refreshPixDeposit(String(row.user_id), id);
  audit(adminId, 'PIX_DEPOSIT_ADMIN_CHECKED', { id, status: result.status });
  return result;
}
