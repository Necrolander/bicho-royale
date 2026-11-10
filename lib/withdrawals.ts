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

export type CreateWithdrawalInput = {
  userId: string;
  amountCents: number;
  cpf: string;
  pixKey?: string;
};

export async function createWithdrawal(input: CreateWithdrawalInput) {
  const user = one('SELECT * FROM users WHERE id=?', input.userId) as
    | { id: string; blocked: number; points: number; cpf: string | null }
    | undefined;
  if (!user) throw new ApiError(404, 'Usuário não encontrado');
  if (user.blocked) throw new ApiError(403, 'Conta bloqueada');
  if (!user.cpf) throw new ApiError(400, 'CPF não cadastrado no perfil');
  if (input.cpf.replace(/\D/g, '') !== user.cpf.replace(/\D/g, ''))
    throw new ApiError(400, 'CPF informado não confere com o cadastro');
  if (Number(user.points) < input.amountCents) throw new ApiError(400, 'Saldo insuficiente');
  if (input.amountCents < 100) throw new ApiError(400, 'Valor mínimo: R$ 1,00');
  if (input.amountCents > 100000) throw new ApiError(400, 'Valor máximo: R$ 1.000,00');

  const id = randomUUID();
  const pixKey = input.pixKey || user.cpf;

  transaction(() => {
    run(
      'INSERT INTO withdrawals(id,user_id,amount_cents,status,cpf,pix_key,created_at) VALUES(?,?,?,?,?,?,?)',
      id,
      input.userId,
      input.amountCents,
      'PENDING',
      user.cpf,
      pixKey,
      new Date().toISOString(),
    );
    run(
      'UPDATE users SET points=points-? WHERE id=?',
      input.amountCents,
      input.userId,
    );
    run(
      'INSERT INTO transactions(id,user_id,entry_id,amount,balance,created_at) VALUES(?,?,?,?,?,?)',
      randomUUID(),
      input.userId,
      null,
      -input.amountCents,
      Number(user.points) - input.amountCents,
      new Date().toISOString(),
    );
    audit(input.userId, 'WITHDRAWAL_REQUESTED', { id, amountCents: input.amountCents, cpf: user.cpf, pixKey });
  });

  return { id, status: 'PENDING', amountCents: input.amountCents, cpf: user.cpf, pixKey };
}

export async function listUserWithdrawals(userId: string) {
  return all(
    'SELECT * FROM withdrawals WHERE user_id=? ORDER BY created_at DESC',
    userId,
  ) as Withdrawal[];
}

export async function listAllWithdrawals() {
  return all(
    `SELECT w.*, u.name, u.email FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.created_at DESC`,
  ) as Withdrawal[];
}

export async function processWithdrawalAsAdmin(adminId: string, withdrawalId: string, action: 'approve' | 'reject', adminNote?: string) {
  const withdrawal = one('SELECT * FROM withdrawals WHERE id=?', withdrawalId) as Withdrawal | undefined;
  if (!withdrawal) throw new ApiError(404, 'Saque não encontrado');
  if (withdrawal.status !== 'PENDING') throw new ApiError(409, `Saque já ${withdrawal.status.toLowerCase()}`);

  if (action === 'approve') {
    transaction(() => {
      run(
        'UPDATE withdrawals SET status=?,processed_at=?,admin_id=?,admin_note=? WHERE id=?',
        'APPROVED',
        new Date().toISOString(),
        adminId,
        adminNote || 'Aprovado pelo administrador',
        withdrawalId,
      );
      audit(adminId, 'WITHDRAWAL_APPROVED', { id: withdrawalId, amountCents: withdrawal.amount_cents, cpf: withdrawal.cpf, pixKey: withdrawal.pix_key });
    });
  } else {
    // Rejeitar - devolve pontos
    const user = one('SELECT points FROM users WHERE id=?', withdrawal.user_id) as
      | { points: number }
      | undefined;
    if (user) {
      transaction(() => {
        run(
          'UPDATE withdrawals SET status=?,processed_at=?,admin_id=?,admin_note=? WHERE id=?',
          'REJECTED',
          new Date().toISOString(),
          adminId,
          adminNote || 'Rejeitado pelo administrador',
          withdrawalId,
        );
        run('UPDATE users SET points=points+? WHERE id=?', withdrawal.amount_cents, withdrawal.user_id);
        run(
          'INSERT INTO transactions(id,user_id,entry_id,amount,balance,created_at) VALUES(?,?,?,?,?,?)',
          randomUUID(),
          withdrawal.user_id,
          null,
          withdrawal.amount_cents,
          Number(user.points) + withdrawal.amount_cents,
          new Date().toISOString(),
        );
        audit(adminId, 'WITHDRAWAL_REJECTED', { id: withdrawalId, amountCents: withdrawal.amount_cents, reason: adminNote });
      });
    }
  }

  return { id: withdrawalId, status: action === 'approve' ? 'APPROVED' : 'REJECTED' };
}
