import { randomUUID } from 'node:crypto';
import { ApiError } from './auth';
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

export function listUserWithdrawals(userId: string) {
  return all(
    'SELECT id,amount_cents,status,created_at,processed_at,admin_note FROM withdrawals WHERE user_id=? ORDER BY created_at DESC LIMIT 200',
    userId,
  );
}

export function processWithdrawalAsAdmin(
  adminId: string,
  withdrawalId: string,
  action: 'approve' | 'reject',
  adminNote?: string,
) {
  if (action === 'approve')
    throw new ApiError(403, 'O saldo para jogar não pode ser pago via Pix.');

  return transaction(() => {
    const withdrawal = one('SELECT * FROM withdrawals WHERE id=?', withdrawalId) as Withdrawal | undefined;
    if (!withdrawal) throw new ApiError(404, 'Saque não encontrado');
    if (withdrawal.status !== 'PENDING') throw new ApiError(409, 'Esta solicitação já foi processada.');

    const now = new Date().toISOString();
    run(
      'UPDATE withdrawals SET status=?,processed_at=?,admin_id=?,admin_note=? WHERE id=?',
      'REJECTED', now, adminId, adminNote || 'Rejeitado pelo administrador', withdrawalId,
    );
    run('UPDATE users SET points=points+? WHERE id=?', withdrawal.amount_cents, withdrawal.user_id);
    const balance = one('SELECT points FROM users WHERE id=?', withdrawal.user_id)!;
    run(
      'INSERT INTO transactions(id,user_id,entry_id,amount,balance,created_at) VALUES(?,?,?,?,?,?)',
      randomUUID(), withdrawal.user_id, null, withdrawal.amount_cents, Number(balance.points), now,
    );
    audit(adminId, 'WITHDRAWAL_REJECTED', { id: withdrawalId, amountCents: withdrawal.amount_cents });
    return { id: withdrawalId, status: 'REJECTED' };
  });
}
