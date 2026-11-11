import { beforeAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
process.env.DATABASE_PATH = `data/tests-${randomUUID()}.sqlite`;
const { all, audit, db, one, run, transaction, verifyAudit } = await import('../lib/db');
const { createUser, passwordHash, passwordMatches, requireRegistration, updateProfileName, referralSummary } = await import('../lib/auth');
const { scheduleRound, enterRound, executeDraw, advanceRounds } = await import('../lib/rounds');
const { ownTicket } = await import('../lib/tickets');
const { enterGroupBatch } = await import('../lib/rounds');
const { scheduleYoutubeRound, publishYoutubeResult, youtubeVideo } = await import('../lib/rounds');
const { saveEfiConfig, efiStatus, createPixDeposit } = await import('../lib/efi');
const { listUserWithdrawals, processWithdrawalAsAdmin } = await import('../lib/withdrawals');
let user: string, round: string;
beforeAll(() => {
  user = createUser('Teste local', 'test@example.test', 'password-test-123');
  round = transaction(() => {
    const id = scheduleRound('TRADITIONAL');
    run("UPDATE rounds SET state='OPEN' WHERE id=?", id);
    return id;
  });
});
describe('Persistência e transações', () => {
  it('registra a indicação e credita o saldo uma única vez junto com o cadastro', () => {
    const referrer = createUser('Pessoa que indica', 'referrer@example.test', 'password-test-123');
    const cpf = '52998224725';
    const invitee = createUser('Convidado', 'invitee@example.test', 'password-test-123', 'USER', undefined, cpf, referrer);
    expect(referralSummary(referrer)).toMatchObject({ count: 1, totalCents: 100 });
    expect(referralSummary(invitee)).toMatchObject({ count: 0, totalCents: 0 });
    expect(one('SELECT points FROM users WHERE id=?', referrer)?.points).toBe(1100);
    expect(() => createUser('Duplicado', 'duplicate@example.test', 'password-test-123', 'USER', undefined, cpf, referrer)).toThrow();
    expect(() => createUser('Convite inválido', 'invalid@example.test', 'password-test-123', 'USER', undefined, '12345678909', randomUUID())).toThrow('Link de indicação inválido');
    expect(referralSummary(referrer)).toMatchObject({ count: 1, totalCents: 100 });
    expect(one('SELECT points FROM users WHERE id=?', referrer)?.points).toBe(1100);
  });
  it('bloqueia pagamento de saques antigos e devolve créditos somente uma vez', () => {
    const owner = createUser('Titular do histórico', 'withdrawal@example.test', 'password-test-123');
    const id = randomUUID();
    run('UPDATE users SET points=900 WHERE id=?', owner);
    run(
      'INSERT INTO withdrawals(id,user_id,amount_cents,cpf,pix_key,created_at) VALUES(?,?,?,?,?,?)',
      id, owner, 100, '00000000000', 'chave-de-teste', new Date().toISOString(),
    );

    expect(listUserWithdrawals(owner)[0]).not.toHaveProperty('cpf');
    expect(listUserWithdrawals(owner)[0]).not.toHaveProperty('pix_key');
    expect(() => processWithdrawalAsAdmin(user, id, 'approve')).toThrow('não pode ser pago');
    expect(processWithdrawalAsAdmin(user, id, 'reject')).toMatchObject({ status: 'REJECTED' });
    expect(() => processWithdrawalAsAdmin(user, id, 'reject')).toThrow('já foi processada');
    expect(one('SELECT points FROM users WHERE id=?', owner)?.points).toBe(1000);
  });
  it('exige cadastro para registrar bilhetes', () => {
    const guest = createUser('Visitante', null, null);
    expect(() => requireRegistration(one('SELECT * FROM users WHERE id=?', guest)!)).toThrow('Cadastre-se');
    expect(requireRegistration(one('SELECT * FROM users WHERE id=?', user)!)).toMatchObject({ id: user });
  });
  it('salva dados do perfil somente na conta autenticada', () => {
    const other = createUser('Outra pessoa', 'other@example.test', 'password-test-123');
    expect(updateProfileName(user, 'Novo nome')).toMatchObject({ id: user, name: 'Novo nome' });
    expect(one('SELECT name FROM users WHERE id=?', user)?.name).toBe('Novo nome');
    expect(one('SELECT name FROM users WHERE id=?', other)?.name).toBe('Outra pessoa');
  });
  it('guarda credenciais Efí cifradas e impede cobrança sem liberação', async () => {
    process.env.EFI_CONFIG_KEY = Buffer.alloc(32, 7).toString('base64');
    saveEfiConfig({ clientId: 'client-test', clientSecret: 'secret-test', pixKey: 'pix-key-test', certificateP12: Buffer.from('certificate').toString('base64'), certificatePassword: '', environment: 'homologation' }, user);
    expect(efiStatus()).toMatchObject({ configured: true, environment: 'homologation', paymentsEnabled: false });
    expect(String(one('SELECT encrypted FROM efi_configs WHERE id=1')?.encrypted)).not.toContain('secret-test');
    await expect(createPixDeposit(user, 100)).rejects.toThrow('não estão habilitados');
    delete process.env.EFI_CONFIG_KEY;
  });
  it('aguarda o resultado de uma live externa e publica cinco milhares uma única vez', () => {
    const id = transaction(() => scheduleYoutubeRound(
      new Date(Date.now() - 120000).toISOString(), 15,
      'https://www.youtube.com/watch?v=abcdefghijk', user,
    ));
    advanceRounds();
    expect(one('SELECT state FROM rounds WHERE id=?', id)?.state).toBe('LOCKED');
    expect(() => executeDraw(id)).toThrow('publicado pelo administrador');
    expect(() => publishYoutubeResult(id, ['1234'], user)).toThrow('cinco milhares');
    expect(publishYoutubeResult(id, ['1234', '0001', '0099', '4567', '9876'], user).source).toBe('YOUTUBE');
    expect(one('SELECT state FROM rounds WHERE id=?', id)?.state).toBe('PUBLISHED');
    expect(() => publishYoutubeResult(id, ['1234', '0001', '0099', '4567', '9876'], user)).toThrow('Encerre');
    expect(youtubeVideo('https://youtu.be/abcdefghijk').id).toBe('abcdefghijk');
    expect(() => youtubeVideo('https://evil.example/watch?v=abcdefghijk')).toThrow('YouTube');
  });
  it('registra vários animais atomicamente e permite repetir a solicitação sem novo débito', () => {
    const owner = createUser('Vários animais', null, null),
      id = scheduleRound('TRADITIONAL');
    run("UPDATE rounds SET state='OPEN' WHERE id=?", id);
    const input = {
      roundId: id,
      mode: 'grupo' as const,
      selection: ['10', '16', '25'],
      points: 10,
      key: randomUUID(),
    };
    const tickets = enterGroupBatch(owner, input);
    expect(tickets).toHaveLength(3);
    expect(
      enterGroupBatch(owner, { ...input, selection: ['25', '10', '16'] }).map((t) => t.id),
    ).toEqual(tickets.map((t) => t.id));
    expect(one('SELECT points FROM users WHERE id=?', owner)!.points).toBe(970);
    expect(() => enterGroupBatch(owner, { ...input, selection: ['10', '16'] })).toThrow(
      'Chave já usada',
    );
    expect(() =>
      enterGroupBatch(owner, { ...input, key: randomUUID(), selection: ['10', '10'] }),
    ).toThrow('distintos');
    run("UPDATE rounds SET state='LOCKED' WHERE id=?", id);
    executeDraw(id);
    expect(tickets.every((t) => ownTicket(owner, String(t.id)).outcome !== null)).toBe(true);
  });
  it('não registra nenhum animal nem debita saldo quando o total é insuficiente', () => {
    const owner = createUser('Saldo para um animal', null, null),
      id = scheduleRound('TRADITIONAL');
    run("UPDATE rounds SET state='OPEN' WHERE id=?", id);
    run('UPDATE users SET points=15 WHERE id=?', owner);
    expect(() =>
      enterGroupBatch(owner, {
        roundId: id,
        mode: 'grupo',
        selection: ['10', '16'],
        points: 10,
        key: randomUUID(),
      }),
    ).toThrow('insuficientes');
    expect(one('SELECT points FROM users WHERE id=?', owner)!.points).toBe(15);
    expect(all('SELECT * FROM entries WHERE user_id=?', owner)).toHaveLength(0);
    expect(
      all('SELECT * FROM transactions WHERE user_id=? AND entry_id IS NOT NULL', owner),
    ).toHaveLength(0);
  });
  it('configura novas extrações sem alterar as regras das anteriores', () => {
    const previous = scheduleRound('TRADITIONAL');
    run(
      'INSERT OR REPLACE INTO settings VALUES(?,?)',
      'modeRules',
      JSON.stringify({ dezena: { enabled: false, positions: 2, passeSecond: 2 } }),
    );
    const upcoming = scheduleRound('TRADITIONAL');
    expect(
      JSON.parse(String(one('SELECT rules FROM rounds WHERE id=?', previous)!.rules)).modes.dezena,
    ).toBeUndefined();
    expect(
      JSON.parse(String(one('SELECT rules FROM rounds WHERE id=?', upcoming)!.rules)).modes.dezena
        .enabled,
    ).toBe(false);
    run("UPDATE rounds SET state='OPEN' WHERE id=?", upcoming);
    const owner = createUser('Modalidade desabilitada', null, null);
    expect(() =>
      enterRound(owner, {
        roundId: upcoming,
        mode: 'dezena',
        selection: ['00'],
        points: 10,
        key: randomUUID(),
      }),
    ).toThrow('indisponível');
    expect(one('SELECT points FROM users WHERE id=?', owner)!.points).toBe(1000);
    run('DELETE FROM settings WHERE key=?', 'modeRules');
  });
  it('preserva posições e regras, impede duplicação divergente e isola o comprovante', () => {
    const owner = createUser('Titular do bilhete', null, null);
    const id = scheduleRound('TRADITIONAL');
    run("UPDATE rounds SET state='OPEN' WHERE id=?", id);
    const key = randomUUID(),
      input = {
        roundId: id,
        mode: 'dezena' as const,
        selection: ['00'],
        points: 5,
        key,
        positions: [5],
      };
    const entry = enterRound(owner, input);
    expect(() =>
      run('UPDATE entry_rules SET positions=? WHERE entry_id=?', '[1]', String(entry.id)),
    ).toThrow('immutable');
    expect(ownTicket(owner, String(entry.id)).positions).toEqual([5]);
    expect(() => enterRound(owner, { ...input, positions: [1] })).toThrow('Chave já usada');
    expect(() => ownTicket(createUser('Outra conta', null, null), String(entry.id))).toThrow(
      'não encontrado',
    );
    run(
      'INSERT OR REPLACE INTO settings VALUES(?,?)',
      'rules',
      JSON.stringify({ positions: 1, passeSecond: 3 }),
    );
    run("UPDATE rounds SET state='LOCKED' WHERE id=?", id);
    executeDraw(id);
    const ticket = ownTicket(owner, String(entry.id));
    expect(ticket.rules.positions).toBe(5);
    expect(ticket.outcome.positions).toEqual([5]);
    run(
      'INSERT OR REPLACE INTO settings VALUES(?,?)',
      'rules',
      JSON.stringify({ positions: 5, passeSecond: 2 }),
    );
  });
  it('registra participação idempotente e debita uma única vez', () => {
    const key = randomUUID(),
      input = { roundId: round, mode: 'grupo' as const, selection: ['10'], points: 10, key };
    const a = enterRound(user, input),
      b = enterRound(user, input);
    expect(a.id).toBe(b.id);
    expect(one('SELECT points FROM users WHERE id=?', user)?.points).toBe(990);
    expect(all('SELECT * FROM transactions WHERE entry_id=?', String(a.id))).toHaveLength(1);
    expect(() => enterRound(user, { ...input, points: 11 })).toThrow('Chave já usada');
  });
  it('rejeita saldo insuficiente sem alterar histórico', () => {
    const id = createUser('Sem saldo', null, null);
    run('UPDATE users SET points=0 WHERE id=?', id);
    expect(() =>
      enterRound(id, {
        roundId: round,
        mode: 'grupo',
        selection: ['10'],
        points: 10,
        key: randomUUID(),
      }),
    ).toThrow('insuficientes');
    expect(all('SELECT * FROM entries WHERE user_id=?', id)).toHaveLength(0);
  });
  it('nega usuário bloqueado', () => {
    const id = createUser('Bloqueado', null, null);
    run('UPDATE users SET blocked=1 WHERE id=?', id);
    expect(() =>
      enterRound(id, {
        roundId: round,
        mode: 'grupo',
        selection: ['10'],
        points: 1,
        key: randomUUID(),
      }),
    ).toThrow('indisponível');
  });
  it('publica uma única vez sob chamadas concorrentes e confere comprovantes', async () => {
    run("UPDATE rounds SET state='LOCKED' WHERE id=?", round);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => Promise.resolve().then(() => executeDraw(round))),
    );
    expect(new Set(results.map((r) => JSON.stringify(r.result))).size).toBe(1);
    expect(all('SELECT * FROM draw_results WHERE round_id=?', round)).toHaveLength(1);
    expect(all('SELECT * FROM entries WHERE round_id=?', round).every((e) => e.outcome)).toBe(true);
    expect(all('SELECT * FROM notifications WHERE user_id=?', user)).toHaveLength(1);
  });
  it('resultados publicados, resultados e logs são imutáveis', () => {
    expect(() => run('UPDATE rounds SET result=? WHERE id=?', '{}', round)).toThrow('immutable');
    expect(() => run('DELETE FROM draw_results WHERE round_id=?', round)).toThrow('immutable');
    expect(() => run('DELETE FROM audit_logs')).toThrow('immutable');
    expect(() =>
      enterRound(user, {
        roundId: round,
        mode: 'grupo',
        selection: ['10'],
        points: 1,
        key: randomUUID(),
      }),
    ).toThrow('encerrou');
  });
  it('avança estados no servidor e conserva o compromisso', () => {
    const id = transaction(() =>
      scheduleRound('ROULETTE', new Date(Date.now() - 100000).toISOString(), 15),
    );
    const before = one('SELECT commitment FROM rounds WHERE id=?', id)!.commitment;
    advanceRounds();
    const after = one('SELECT * FROM rounds WHERE id=?', id)!;
    expect(after.state).toBe('PUBLISHED');
    expect(after.commitment).toBe(before);
  });
  it('preserva o histórico em outra conexão', () => {
    const other = new DatabaseSync(process.env.DATABASE_PATH!);
    expect(other.prepare('SELECT count(*) n FROM entries').get()!.n).toBeGreaterThan(0);
    other.close();
  });
  it('auditoria encadeada íntegra', () => {
    transaction(() => audit(user, 'TEST', { ok: true }));
    expect(verifyAudit()).toBe(true);
  });
  it('verifica históricos de auditoria maiores que o limite de uma resposta do banco', () => {
    const detail = { payload: 'x'.repeat(10_000) };
    transaction(() => {
      for (let index = 0; index < 450; index++) audit(user, 'LARGE_TEST', { ...detail, index });
    });
    expect(verifyAudit()).toBe(true);
  });
  it('hash de senha usa sal e verifica credenciais', () => {
    const a = passwordHash('uma-senha-segura');
    expect(a).not.toBe(passwordHash('uma-senha-segura'));
    expect(passwordMatches('uma-senha-segura', a)).toBe(true);
    expect(passwordMatches('senha-errada', a)).toBe(false);
  });
  it('reverte falha transacional', () => {
    const balance = one('SELECT points FROM users WHERE id=?', user)!.points;
    expect(() =>
      transaction(() => {
        run('UPDATE users SET points=50 WHERE id=?', user);
        throw new Error('abort');
      }),
    ).toThrow('abort');
    expect(one('SELECT points FROM users WHERE id=?', user)!.points).toBe(balance);
    expect(db()).toBeDefined();
  });
});
