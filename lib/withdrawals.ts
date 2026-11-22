import { randomUUID } from 'node:crypto';
import { ApiError } from './auth';
import { isValidCpf, normalizeCpf } from './cpf';
import { all, audit, one, run, transaction } from './db';

export type Withdrawal = {
  id: string;
  user_id: string;
  amount_cents: number;
  status: string;
  cpf: string;
  pix_key: string | null;
  created_at: string;
  processed_at: string | null;
  admin_id: string | null;
  admin_note: string | null;
  name?: string;
  email?: string | null;
};

export function createWithdrawal(userId: string, amountCents: number, requestId: string, pixKey?: string) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 2000)
    throw new ApiError(400, 'O saque mínimo é R$ 20,00.');
  const destination = pixKey?.trim();
  if (destination && !(/^\+?[0-9]{10,14}$/.test(destination) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination) || /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(destination)))
    throw new ApiError(400, 'Informe uma chave Pix válida: CPF, telefone com DDD, e-mail ou chave aleatória.');
  return transaction(() => {
    const existing = one('SELECT * FROM withdrawals WHERE id=?', requestId);
    if (existing) {
      if (existing.user_id !== userId || Number(existing.amount_cents) !== amountCents || (destination && existing.pix_key !== destination))
        throw new ApiError(409, 'Solicitação divergente.');
      return { id: requestId };
    }
    const user = one('SELECT points,cpf,blocked FROM users WHERE id=?', userId);
    if (!user || user.blocked) throw new ApiError(403, 'Conta indisponível.');
    const cpf = normalizeCpf(String(user.cpf || ''));
    if (!isValidCpf(cpf)) throw new ApiError(400, 'Cadastre um CPF válido nas configurações da conta.');
    if (Number(user.points) < amountCents) throw new ApiError(400, 'Saldo insuficiente.');
    const now = new Date().toISOString();
    run('INSERT INTO withdrawals(id,user_id,amount_cents,status,cpf,pix_key,created_at) VALUES(?,?,?,?,?,?,?)', requestId,userId,amountCents,'PENDING',cpf,destination || cpf,now);
    run('UPDATE users SET points=points-? WHERE id=?',amountCents,userId);
    run('INSERT INTO transactions VALUES(?,?,?,?,?,?)',randomUUID(),userId,null,-amountCents,Number(user.points)-amountCents,now);
    audit(userId,'WITHDRAWAL_REQUESTED',{id:requestId,amountCents});
    return { id:requestId };
  });
}

export function listUserWithdrawals(userId: string) {
  return all(
    'SELECT id,amount_cents,status,pix_key,created_at,processed_at,admin_note FROM withdrawals WHERE user_id=? ORDER BY created_at DESC LIMIT 200',
    userId,
  );
}

export function processWithdrawalAsAdmin(
  adminId: string,
  withdrawalId: string,
  action: 'approve' | 'reject',
  adminNote?: string,
) {

  return transaction(() => {
    const withdrawal = one('SELECT * FROM withdrawals WHERE id=?', withdrawalId) as Withdrawal | undefined;
    if (!withdrawal) throw new ApiError(404, 'Saque não encontrado');
    if (withdrawal.status !== 'PENDING') throw new ApiError(409, 'Esta solicitação já foi processada.');

    const now = new Date().toISOString();
    run(
      'UPDATE withdrawals SET status=?,processed_at=?,admin_id=?,admin_note=? WHERE id=?',
      action === 'approve' ? 'APPROVED' : 'REJECTED', now, adminId, adminNote || 'Processado pelo administrador', withdrawalId,
    );
    if (action === 'reject') {
    run('UPDATE users SET points=points+? WHERE id=?', withdrawal.amount_cents, withdrawal.user_id);
    const balance = one('SELECT points FROM users WHERE id=?', withdrawal.user_id)!;
    run(
      'INSERT INTO transactions(id,user_id,entry_id,amount,balance,created_at) VALUES(?,?,?,?,?,?)',
      randomUUID(), withdrawal.user_id, null, withdrawal.amount_cents, Number(balance.points), now,
    );
    }
    audit(adminId, action === 'approve' ? 'WITHDRAWAL_APPROVED' : 'WITHDRAWAL_REJECTED', { id: withdrawalId, amountCents: withdrawal.amount_cents });
    return { id: withdrawalId, status: action === 'approve' ? 'APPROVED' : 'REJECTED' };
  });
}
