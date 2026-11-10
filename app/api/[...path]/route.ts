import { cookies } from 'next/headers';
import { z } from 'zod';
import { randomInt, randomUUID } from 'node:crypto';
import {
  ApiError,
  createSession,
  createUser,
  requireRegistration,
  updateProfileName,
  updateProfileCpf,
  currentUser,
  passwordMatches,
  publicUser,
  rateLimit,
  requireAdmin,
} from '@/lib/auth';
import { all, audit, initialize, one, run, settings, transaction, verifyAudit } from '@/lib/db';
import { animals, modes, type ModeId } from '@/lib/game';
import {
  advanceRounds,
  enterRound,
  enterGroupBatch,
  executeDraw,
  publicRound,
  scheduleRound,
  startScheduler,
} from '@/lib/rounds';
import { commitment, draw, sha256 } from '@/lib/fairness';
import { ownTicket, ownTickets, ticketReceipt } from '@/lib/tickets';
import {
  createPixDeposit,
  efiStatus,
  refreshPixDeposit,
  refreshPixDepositAsAdmin,
  saveEfiConfig,
  testEfiConnection,
} from '@/lib/efi';
import {
  createMercadoPagoPayment,
  mercadoPagoStatus,
  refreshMercadoPagoDeposit,
  refreshMercadoPagoDepositAsAdmin,
  saveMercadoPagoConfig,
  testMercadoPagoConnection,
} from '@/lib/mercadopago';
import { createWithdrawal, listUserWithdrawals, listAllWithdrawals, processWithdrawalAsAdmin } from '@/lib/withdrawals';
import { defaultScratchConfig, pickScratchPrize } from '@/lib/scratchcards';
import { isValidCpf, normalizeCpf } from '@/lib/cpf';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const entrySchema = z.object({
  roundId: z.uuid(),
  mode: z.enum(modes.map((m) => m.id) as [ModeId, ...ModeId[]]),
  selection: z.array(z.string()).min(1).max(3),
  points: z.number().int().min(1).max(100),
  key: z.uuid(),
  positions: z.array(z.number().int().min(1).max(5)).min(1).max(5).optional(),
});
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function readJson(req: Request, maxBytes = 16000): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, 'Informe um corpo JSON');
  const decoder = new TextDecoder();
  let raw = '',
    bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, 'Solicitação muito grande');
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'JSON inválido');
  }
}
async function handler(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const path = (await params).path.join('/'),
      url = new URL(req.url),
      post = req.method === 'POST';
    if (path === 'health' && !post) return json({ ok: true, time: Date.now() });
    initialize();
    startScheduler();
    let payload: unknown;
    if (post) {
      const origin = req.headers.get('origin');
      let parsedOrigin: URL | undefined;
      try {
        if (origin) parsedOrigin = new URL(origin);
      } catch {
        throw new ApiError(403, 'Origem da solicitação inválida');
      }
      if (
        !parsedOrigin ||
        parsedOrigin.host !== req.headers.get('host') ||
        !['http:', 'https:'].includes(parsedOrigin.protocol)
      )
        throw new ApiError(403, 'Origem da solicitação inválida');
      if (!req.headers.get('content-type')?.includes('application/json'))
        throw new ApiError(415, 'Use JSON');
      const maxBytes = path === 'admin/efi' || path === 'admin/settings' ? 300000 : 16000;
      if (Number(req.headers.get('content-length') || 0) > maxBytes)
        throw new ApiError(413, 'Solicitação muito grande');
      payload = await readJson(req, maxBytes);
    }
    // Bootstrap only reads account and display data. Running round transitions
    // here made every page load contend for the global Postgres transaction
    // lock; mutations and admin/game routes still advance the round lifecycle.
    if (
      path !== 'bootstrap' &&
      path !== 'events' &&
      (!path.startsWith('admin') || post)
    )
      advanceRounds();
    if (path === 'events' && !post) {
      await currentUser();
      let timer: ReturnType<typeof setInterval>;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('retry: 3000\n\n'));
          timer = setInterval(() => {
            try {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ time: Date.now() })}\n\n`),
              );
            } catch {
              clearInterval(timer);
            }
          }, 15000);
          req.signal.addEventListener('abort', () => {
            clearInterval(timer);
            try {
              controller.close();
            } catch {}
          });
        },
        cancel() {
          clearInterval(timer);
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }
    if ((path === 'auth/login' || path === 'auth/register') && post) {
      const body = z
        .object({
          name: z.string().trim().min(2).max(60).optional(),
          fullName: z.string().trim().min(2).max(120).optional(),
          cpf: z.string().min(11).max(14).optional(),
          email: z.email().max(200),
          password: z.string().min(10).max(128),
        })
        .parse(payload);
      const email = body.email.toLowerCase();
      const cpfClean = body.cpf ? normalizeCpf(body.cpf) : undefined;
      rateLimit(`auth:${sha256(email)}`, 8, 15 * 60000);
      rateLimit('auth:global', 100, 60000);
      let user;
      if (path === 'auth/register') {
        if (!body.name) throw new ApiError(400, 'Informe seu nome');
        if (!cpfClean || !isValidCpf(cpfClean)) throw new ApiError(400, 'Informe um CPF válido');
        if (one('SELECT id FROM users WHERE email=?', email))
          throw new ApiError(409, 'E-mail já cadastrado');
        if (cpfClean && one('SELECT id FROM users WHERE cpf=?', cpfClean))
          throw new ApiError(409, 'CPF já cadastrado');
        const id = createUser(body.name, email, body.password, 'USER', body.fullName, cpfClean);
        user = one('SELECT * FROM users WHERE id=?', id)!;
      } else {
        user = one('SELECT * FROM users WHERE email=?', email);
        if (!user || user.blocked || !passwordMatches(body.password, String(user.password_hash))) {
          audit(null, 'AUTH_FAILED', { emailHash: sha256(email) });
          throw new ApiError(401, 'Credenciais inválidas');
        }
      }
      await createSession(String(user.id));
      audit(String(user.id), 'AUTH_SUCCESS', {});
      return json(publicUser(user));
    }
    if (path === 'auth/logout' && post) {
      const token = (await cookies()).get('royale_session')?.value;
      if (token) run('DELETE FROM sessions WHERE id=?', sha256(token));
      (await cookies()).delete('royale_session');
      return json({ ok: true });
    }
    if (path === 'profile' && post) {
      const user = requireRegistration((await currentUser())!);
      rateLimit(`profile:${user.id}`, 10, 60000);
      const input = z.object({
        name: z.string().trim().min(2).max(60).optional(),
        cpf: z.string().min(11).max(14).optional(),
      }).refine((value) => value.name || value.cpf, 'Informe um dado para atualizar').parse(payload);
      if (input.cpf) return json(updateProfileCpf(String(user.id), input.cpf));
      return json(updateProfileName(String(user.id), input.name!));
    }
    if (path === 'pix/deposits' && !post) {
      const user = (await currentUser())!;
      return json(
        all(
          'SELECT id,txid,amount_cents,status,copy_paste,created_at,confirmed_at FROM pix_deposits WHERE user_id=? ORDER BY created_at DESC',
          String(user.id),
        ),
      );
    }
    if (path === 'pix/deposits' && post) {
      const user = (await currentUser())!;
      if (!user.email) throw new ApiError(403, 'Crie uma conta com e-mail para solicitar um Pix');
      rateLimit(`pix:${user.id}`, 3, 3600000);
      const input = z.object({ amountCents: z.number().int().min(100).max(100000) }).parse(payload);
      return json(await createPixDeposit(String(user.id), input.amountCents), 201);
    }
    if (path === 'pix/refresh' && post) {
      const user = (await currentUser())!;
      rateLimit(`pix-refresh:${user.id}`, 10, 60000);
      const input = z.object({ id: z.uuid() }).parse(payload);
      return json(await refreshPixDeposit(String(user.id), input.id));
    }
    if (path === 'mercadopago/deposits' && !post) {
      const user = (await currentUser())!;
      return json(
        all(
          'SELECT id,external_reference,amount_cents,payment_method,status,init_point,sandbox_init_point,created_at,confirmed_at FROM mercadopago_deposits WHERE user_id=? ORDER BY created_at DESC',
          String(user.id),
        ),
      );
    }
    if (path === 'mercadopago/deposits' && post) {
      const user = (await currentUser())!;
      const email = String(user.email);
      if (!email) throw new ApiError(403, 'Crie uma conta com e-mail para solicitar um pagamento Mercado Pago');
      rateLimit(`mp:${user.id}`, 3, 3600000);
      const input = z.object({
        amountCents: z.number().int().min(100).max(100000),
        paymentMethod: z.enum(['pix', 'credit_card', 'boleto']).default('pix'),
        token: z.string().optional(),
        installments: z.number().int().min(1).max(12).optional(),
        issuerId: z.string().optional(),
        identificationType: z.string().optional(),
        identificationNumber: z.string().optional(),
      }).parse(payload);
      // Reuse the authenticated user's CPF for Pix when the payment form omits it.
      const userCpf = String(one('SELECT cpf FROM users WHERE id=?', String(user.id))?.cpf || '');

      return json(await createMercadoPagoPayment(
        String(user.id),
        input.amountCents,
        input.paymentMethod,
        email,
        input.token,
        input.installments,
        input.issuerId,
        input.identificationType && input.identificationNumber
          ? { type: input.identificationType, number: input.identificationNumber }
          : (input.paymentMethod === 'pix' && userCpf ? { type: 'CPF', number: userCpf.replace(/\D/g, '') } : undefined)
      ), 201);
    }
    if (path === 'mercadopago/refresh' && post) {
      const user = (await currentUser())!;
      rateLimit(`mp-refresh:${user.id}`, 10, 60000);
      const input = z.object({ id: z.uuid() }).parse(payload);
      return json(await refreshMercadoPagoDeposit(String(user.id), input.id));
    }
    if (path === 'bootstrap') {
      const user = await currentUser(false);
      const platformSettings = settings();
      const scratchConfig = (platformSettings.scratch || defaultScratchConfig) as typeof defaultScratchConfig;
      const recentWins = all(
        'SELECT game_id,prize_label,prize_points,created_at FROM scratch_cards WHERE prize_points>0 ORDER BY created_at DESC LIMIT 10',
      ).map((row) => {
        const game = scratchConfig.games?.find((item) => item.id === row.game_id);
        const prize = game?.prizes.find(
          (item) => item.points === Number(row.prize_points) && item.label === row.prize_label,
        );
        return {
          game: game?.name || 'Raspadinha',
          label: String(row.prize_label),
          points: Number(row.prize_points),
          image: prize?.image || '',
          created_at: String(row.created_at),
        };
      });
      return json({
        user: user ? publicUser(user) : null,
        paymentsEnabled: process.env.EFI_PAYMENTS_ENABLED === 'true' && efiStatus().configured,
        mercadoPagoEnabled: process.env.MERCADOPAGO_PAYMENTS_ENABLED === 'true' && mercadoPagoStatus().configured,
        animals,
        modes,
        settings: platformSettings,
        recentWins,
        rounds: all(
          "SELECT r.*,d.video_id,d.video_url FROM rounds r LEFT JOIN external_draws d ON d.round_id=r.id WHERE r.type='ROULETTE' ORDER BY r.created_at DESC LIMIT 100",
        ).map(publicRound),
        entries: user
          ? all(
              "SELECT e.*,r.type,r.result FROM entries e JOIN rounds r ON r.id=e.round_id WHERE user_id=? AND r.type='ROULETTE' ORDER BY e.created_at DESC LIMIT 200",
              String(user.id),
            ).map((x) => ({
              ...x,
              selection: JSON.parse(String(x.selection)),
              outcome: x.outcome ? JSON.parse(String(x.outcome)) : null,
            }))
          : [],
        notifications: user
          ? all(
              'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',
              String(user.id),
            )
          : [],
        preferences: user
          ? JSON.parse(
              String(
                one('SELECT value FROM preferences WHERE user_id=?', String(user.id))?.value ||
                  '{}',
              ),
            )
          : {},
        content: all('SELECT * FROM content_pages'),
        transactions: user
          ? all(
              'SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100',
              String(user.id),
            )
          : [],
        scratchCards: user
          ? all(
              'SELECT id,game_id,price_points,prize_points,prize_label,created_at FROM scratch_cards WHERE user_id=? ORDER BY created_at DESC LIMIT 20',
              String(user.id),
            )
          : [],
      });
    }
    if (path === 'entries' && post) {
      const user = requireRegistration((await currentUser())!);
      rateLimit(`entry:${user.id}`, 30);
      return json(ticketReceipt(enterRound(String(user.id), entrySchema.parse(payload))), 201);
    }
    if (path === 'entries/groups' && post) {
      const user = requireRegistration((await currentUser())!);
      rateLimit(`entry:${user.id}`, 30);
      const input = entrySchema
        .extend({
          mode: z.enum(['grupo', 'cabeca', 'cercado']),
          selection: z.array(z.string()).min(1).max(25),
        })
        .parse(payload);
      return json(enterGroupBatch(String(user.id), input).map(ticketReceipt), 201);
    }
    if (path === 'tickets' && !post) return json(ownTickets(String((await currentUser())!.id)));
    if (path.startsWith('tickets/') && !post)
      return json(ownTicket(String((await currentUser())!.id), z.uuid().parse(path.split('/')[1])));
    if (path === 'check' && post) {
      throw new ApiError(
        403,
        'Conferências tradicionais estão desativadas. Consulte o resultado da Roleta Vegas.',
      );
    }
    if (path.startsWith('verify/')) {
      const row = one('SELECT * FROM rounds WHERE id=?', path.split('/')[1]);
      if (!row || row.state !== 'PUBLISHED')
        throw new ApiError(404, 'Resultado publicado não encontrado');
      const external = one('SELECT * FROM external_draws WHERE round_id=?', String(row.id));
      if (external)
        return json({
          valid:
            JSON.stringify(JSON.parse(String(row.result)).numbers) === external.numbers &&
            one('SELECT result FROM draw_results WHERE round_id=?', String(row.id))?.result ===
              row.result,
          result: JSON.parse(String(row.result)),
          source: 'YOUTUBE',
          videoUrl: external.video_url,
          algorithm:
            'Resultado informado pelo administrador a partir da transmissão externa; não derivado da semente',
          roundId: row.id,
        });
      const derived = draw(
        String(row.seed),
        String(row.id),
        row.type as 'ROULETTE' | 'TRADITIONAL',
      );
      return json({
        valid:
          commitment(String(row.id), String(row.seed)) === row.commitment &&
          JSON.stringify(derived) === row.result,
        commitment: row.commitment,
        seed: row.seed,
        result: derived,
        algorithm: 'SHA-256 / rejection sampling v1',
        roundId: row.id,
      });
    }
    if (path === 'preferences' && post) {
      const user = (await currentUser())!;
      const value = z
        .object({
          sound: z.boolean(),
          accessible: z.boolean(),
          theme: z.enum(['dark', 'light']),
          locale: z.enum(['pt', 'en', 'es']),
          favorites: z.array(z.number().int().min(1).max(25)).max(25),
          tutorial: z.boolean(),
        })
        .parse(payload);
      run('INSERT OR REPLACE INTO preferences VALUES(?,?)', String(user.id), JSON.stringify(value));
      return json({ ok: true });
    }
    if (path === 'notifications/read' && post) {
      const user = (await currentUser())!;
      run('UPDATE notifications SET read=1 WHERE user_id=?', String(user.id));
      return json({ ok: true });
    }
    if (path === 'points/reset' && post) {
      const user = (await currentUser())!;
      rateLimit(`reset:${user.id}`, 1, 86400000);
      transaction(() => {
        const current = one('SELECT points FROM users WHERE id=?', String(user.id))!;
        const amount = 1000 - Number(current.points);
        run('UPDATE users SET points=1000 WHERE id=?', String(user.id));
        run(
          'INSERT INTO transactions VALUES(?,?,?,?,?,?)',
          randomUUID(),
          String(user.id),
          null,
          amount,
          1000,
          new Date().toISOString(),
        );
        audit(String(user.id), 'DEMO_POINTS_RESET', { amount });
      });
      return json({ ok: true });
    }
    if (path === 'withdrawals' && !post) {
      const user = (await currentUser())!;
      return json(await listUserWithdrawals(String(user.id)));
    }
    if (path === 'withdrawals' && post) {
      const user = (await currentUser())!;
      const input = z.object({
        amountCents: z.number().int().min(100).max(100000),
        cpf: z.string().min(11).max(14).optional(),
        pixKey: z.string().max(200).optional(),
      }).parse(payload);
      return json(await createWithdrawal({ userId: String(user.id), ...input }), 201);
    }
    if (path === 'scratchcards' && post) {
      const user = requireRegistration((await currentUser())!);
      rateLimit(`scratch:${user.id}`, 30, 60_000);
      const input = z
        .object({ key: z.uuid(), gameId: z.string().min(1).max(40).optional() })
        .parse(payload);
      const config = (settings().scratch || defaultScratchConfig) as typeof defaultScratchConfig;
      if (!config.enabled) throw new ApiError(403, 'A raspadinha está temporariamente pausada');
      const game = input.gameId
        ? config.games?.find((item) => item.id === input.gameId && item.enabled)
        : undefined;
      if (input.gameId && !game) throw new ApiError(404, 'Este cartão não está disponível');
      const price = game?.price ?? config.price;
      const prizes = game?.prizes ?? config.prizes;
      const existing = one(
        'SELECT id,game_id,price_points,prize_points,prize_label,created_at FROM scratch_cards WHERE user_id=? AND idempotency_key=?',
        String(user.id),
        input.key,
      );
      if (existing) return json(existing);
      const result = transaction(() => {
        const duplicate = one(
          'SELECT id,game_id,price_points,prize_points,prize_label,created_at FROM scratch_cards WHERE user_id=? AND idempotency_key=?',
          String(user.id),
          input.key,
        );
        if (duplicate) return duplicate;
        const current = one('SELECT points FROM users WHERE id=?', String(user.id));
        if (!current) throw new ApiError(401, 'Entre novamente na sua conta');
        if (Number(current.points) < price)
          throw new ApiError(400, 'Créditos demonstrativos insuficientes');
        const prize = pickScratchPrize(prizes, randomInt(10_000));
        const id = randomUUID(),
          createdAt = new Date().toISOString();
        const afterPurchase = Number(current.points) - price;
        run('UPDATE users SET points=? WHERE id=?', afterPurchase, String(user.id));
        run(
          'INSERT INTO transactions VALUES(?,?,?,?,?,?)',
          randomUUID(),
          String(user.id),
          null,
          -price,
          afterPurchase,
          createdAt,
        );
        const finalBalance = afterPurchase + prize.points;
        if (prize.points > 0) {
          run('UPDATE users SET points=? WHERE id=?', finalBalance, String(user.id));
          run(
            'INSERT INTO transactions VALUES(?,?,?,?,?,?)',
            randomUUID(),
            String(user.id),
            null,
            prize.points,
            finalBalance,
            createdAt,
          );
        }
        run(
          'INSERT INTO scratch_cards(id,user_id,idempotency_key,price_points,prize_points,prize_label,created_at,game_id) VALUES(?,?,?,?,?,?,?,?)',
          id,
          String(user.id),
          input.key,
          price,
          prize.points,
          prize.label,
          createdAt,
          game?.id ?? 'ouro-vegas',
        );
        audit(String(user.id), 'SCRATCH_CARD_PLAYED', {
          id,
          gameId: game?.id ?? 'ouro-vegas',
          pricePoints: price,
          prizePoints: prize.points,
        });
        return {
          id,
          price_points: price,
          prize_points: prize.points,
          prize_label: prize.label,
          created_at: createdAt,
        };
      });
      return json(result, 201);
    }
    if (path === 'stats') {
      const rows = all(
        "SELECT * FROM rounds WHERE state='PUBLISHED' AND type='ROULETTE' ORDER BY published_at DESC",
      );
      const from = url.searchParams.get('from'),
        to = url.searchParams.get('to');
      const filtered = rows.filter(
        (x) =>
          (!from || String(x.published_at) >= from) &&
          (!to || String(x.published_at).slice(0, 10) <= to) &&
          x.type === 'ROULETTE',
      );
      const frequency = animals.map((a) => ({ ...a, count: 0 })),
        tens = Array.from({ length: 100 }, (_, i) => ({
          ten: String(i).padStart(2, '0'),
          count: 0,
        }));
      for (const r of filtered) {
        const result = JSON.parse(String(r.result));
        if (result.group) {
          const animal = animals[result.group - 1];
          frequency[result.group - 1].count++;
          for (const ten of animal.tens) tens[Number(ten)].count++;
        }
      }
      if (url.searchParams.get('format') === 'csv')
        return new Response(
          '\uFEFFgrupo,animal,frequencia\n' +
            frequency.map((x) => `${x.id},${x.name},${x.count}`).join('\n'),
          {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': 'attachment; filename="estatisticas-simuladas.csv"',
            },
          },
        );
      return json({ frequency, tens, rounds: filtered.length });
    }
    if (path.startsWith('admin')) {
      const admin = await requireAdmin();
      if (path === 'admin/audit-verify' && !post) return json({ valid: verifyAudit() });
      if (path === 'admin/reports' && !post) {
        const from = url.searchParams.get('from') || '';
        const to = url.searchParams.get('to') || '';
        const userId = url.searchParams.get('userId') || '';
        const searchText = (url.searchParams.get('q') || '').trim().slice(0, 100);
        if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)))
          throw new ApiError(400, 'Informe datas válidas no formato AAAA-MM-DD');
        const whereFor = (alias: string) => {
          const clauses: string[] = [];
          const params: (string | number | null)[] = [];
          if (from) { clauses.push(`${alias}.created_at>=?`); params.push(`${from}T00:00:00.000Z`); }
          if (to) { clauses.push(`${alias}.created_at<=?`); params.push(`${to}T23:59:59.999Z`); }
          if (userId) { clauses.push(`${alias}.user_id=?`); params.push(userId); }
          if (searchText) {
            clauses.push("LOWER(COALESCE(u.name,'') || ' ' || COALESCE(u.email,'')) LIKE ?");
            params.push(`%${searchText.toLowerCase()}%`);
          }
          return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
        };
        const rouletteWhere = whereFor('e');
        const roulette = all(
          `SELECT e.id,e.user_id,e.round_id,e.mode,e.selection,e.points,e.outcome,e.created_at,u.name,u.email FROM entries e JOIN rounds r ON r.id=e.round_id JOIN users u ON u.id=e.user_id WHERE r.type='ROULETTE'${rouletteWhere.sql} ORDER BY e.created_at DESC LIMIT 500`,
          ...rouletteWhere.params,
        );
        const scratchWhere = whereFor('s');
        const scratch = all(
          `SELECT s.id,s.user_id,s.game_id,s.price_points,s.prize_points,s.prize_label,s.created_at,u.name,u.email FROM scratch_cards s JOIN users u ON u.id=s.user_id WHERE 1=1${scratchWhere.sql} ORDER BY s.created_at DESC LIMIT 500`,
          ...scratchWhere.params,
        );
        const pixWhere = whereFor('p');
        const pix = all(
          `SELECT p.id,p.txid,p.amount_cents,p.status,p.created_at,p.confirmed_at,p.e2e_id,p.user_id,u.name,u.email FROM pix_deposits p JOIN users u ON u.id=p.user_id WHERE 1=1${pixWhere.sql} ORDER BY p.created_at DESC LIMIT 500`,
          ...pixWhere.params,
        );
        const genericWhere = whereFor('t');
        const movements = all(
          `SELECT t.id,t.user_id,t.amount,t.balance,t.created_at,u.name,u.email FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.entry_id IS NULL AND NOT EXISTS (SELECT 1 FROM scratch_cards s WHERE s.user_id=t.user_id AND s.created_at=t.created_at)${genericWhere.sql} ORDER BY t.created_at DESC LIMIT 200`,
          ...genericWhere.params,
        );
        const stats = (sql: string, params: (string | number | null)[]) => one(sql, ...params) || {};
        const rouletteStats = stats(
          `SELECT count(*) AS count,COALESCE(sum(e.points),0) AS wagered FROM entries e JOIN rounds r ON r.id=e.round_id JOIN users u ON u.id=e.user_id WHERE r.type='ROULETTE'${rouletteWhere.sql}`,
          rouletteWhere.params,
        );
        const rouletteOutcomes = all(
          `SELECT e.outcome FROM entries e JOIN rounds r ON r.id=e.round_id JOIN users u ON u.id=e.user_id WHERE r.type='ROULETTE'${rouletteWhere.sql}`,
          ...rouletteWhere.params,
        );
        const scratchStats = stats(
          `SELECT count(*) AS count,COALESCE(sum(s.price_points),0) AS spent,COALESCE(sum(s.prize_points),0) AS prizes FROM scratch_cards s JOIN users u ON u.id=s.user_id WHERE 1=1${scratchWhere.sql}`,
          scratchWhere.params,
        );
        const pixStats = stats(
          `SELECT COALESCE(sum(CASE WHEN p.status='CONFIRMED' THEN p.amount_cents ELSE 0 END),0) AS confirmed_cents,COALESCE(sum(CASE WHEN p.status='PENDING' THEN p.amount_cents ELSE 0 END),0) AS pending_cents,COALESCE(sum(CASE WHEN p.status='CONFIRMED' THEN 1 ELSE 0 END),0) AS confirmed_count,COALESCE(sum(CASE WHEN p.status='PENDING' THEN 1 ELSE 0 END),0) AS pending_count,COALESCE(sum(CASE WHEN p.status NOT IN ('CONFIRMED','PENDING') THEN 1 ELSE 0 END),0) AS other_count FROM pix_deposits p JOIN users u ON u.id=p.user_id WHERE 1=1${pixWhere.sql}`,
          pixWhere.params,
        );
        const configuredGames: { id: string; name: string }[] = Array.isArray(settings().scratch?.games) ? settings().scratch.games : [];
        const gameNames = new Map(configuredGames.map((game) => [game.id, game.name]));
        const allEvents = [
          ...roulette.map((row) => ({ ...row, created_at: String(row.created_at), category: 'ROULETTE', action: 'Aposta na roleta', detail: { roundId: row.round_id, mode: row.mode, selection: JSON.parse(String(row.selection)), outcome: row.outcome ? JSON.parse(String(row.outcome)) : null, points: Number(row.points) } })),
          ...scratch.map((row) => ({ ...row, created_at: String(row.created_at), category: 'SCRATCH', action: 'Raspadinha jogada', detail: { gameId: row.game_id, gameName: gameNames.get(String(row.game_id)) || (row.game_id ? 'Raspadinha removida/antiga' : 'Raspadinha sem identificação'), costPoints: Number(row.price_points), prizePoints: Number(row.prize_points), prize: row.prize_label } })),
          ...pix.map((row) => ({ ...row, created_at: String(row.created_at), category: 'PIX', action: 'Depósito Pix', detail: { amountCents: Number(row.amount_cents), status: row.status, txid: row.txid, endToEndId: row.e2e_id, confirmedAt: row.confirmed_at } })),
          ...movements.map((row) => ({ ...row, created_at: String(row.created_at), category: 'CREDITOS', action: 'Movimentação de créditos demonstrativos', detail: { points: Number(row.amount), balanceAfter: Number(row.balance) } })),
        ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const events = allEvents.slice(0, 1000);
        const rouletteWins = rouletteOutcomes.reduce((count, row) => {
          try { return count + (JSON.parse(String(row.outcome || '{}')).win ? 1 : 0); } catch { return count; }
        }, 0);
        return json({
          filters: { from, to, userId, q: searchText },
          roulette: { entries: Number(rouletteStats.count), pointsWagered: Number(rouletteStats.wagered), winningEntries: rouletteWins, prizePoints: 0 },
          scratch: { cards: Number(scratchStats.count), pointsSpent: Number(scratchStats.spent), prizePoints: Number(scratchStats.prizes), netPoints: Number(scratchStats.prizes) - Number(scratchStats.spent) },
          pix: { confirmedCents: Number(pixStats.confirmed_cents), pendingCents: Number(pixStats.pending_cents), confirmedCount: Number(pixStats.confirmed_count), pendingCount: Number(pixStats.pending_count), otherCount: Number(pixStats.other_count) },
          withdrawals: (() => {
            const wStats = one(`SELECT COALESCE(sum(CASE WHEN w.status='APPROVED' THEN w.amount_cents ELSE 0 END),0) AS approved_cents, COALESCE(sum(CASE WHEN w.status='PENDING' THEN w.amount_cents ELSE 0 END),0) AS pending_cents, COALESCE(sum(CASE WHEN w.status='APPROVED' THEN 1 ELSE 0 END),0) AS approved_count, COALESCE(sum(CASE WHEN w.status='PENDING' THEN 1 ELSE 0 END),0) AS pending_count, COALESCE(sum(CASE WHEN w.status NOT IN ('APPROVED','PENDING') THEN 1 ELSE 0 END),0) AS other_count FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE 1=1${pixWhere.sql}`, ...pixWhere.params);
            return { confirmedCents: Number(wStats?.approved_cents || 0), pendingCents: Number(wStats?.pending_cents || 0), confirmedCount: Number(wStats?.approved_count || 0), pendingCount: Number(wStats?.pending_count || 0), otherCount: Number(wStats?.other_count || 0), configured: true };
          })(),
          events,
          limited: allEvents.length > 1000 || roulette.length === 500 || scratch.length === 500 || pix.length === 500 || movements.length === 200,
        });
      }
      if (path === 'admin/efi' && !post) return json(efiStatus());
      if (path === 'admin/efi' && post) {
        const input = z
          .object({
            clientId: z.string().min(8).max(200),
            clientSecret: z.string().min(8).max(300),
            pixKey: z.string().min(3).max(120),
            certificateP12: z
              .string()
              .regex(/^[A-Za-z0-9+/=]+$/)
              .min(100)
              .max(250000),
            certificatePassword: z.string().max(200).default(''),
            environment: z.enum(['homologation', 'production']),
          })
          .parse(payload);
        saveEfiConfig(input, String(admin.id));
        return json(efiStatus());
      }
      if (path === 'admin/efi-test' && post) return json(await testEfiConnection());
      if (path === 'admin/pix-deposits' && !post)
        return json(
          all(
            'SELECT p.id,p.txid,p.amount_cents,p.status,p.created_at,p.confirmed_at,p.e2e_id,u.name,u.email FROM pix_deposits p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200',
          ),
        );
      if (path === 'admin/pix-refresh' && post) {
        const input = z.object({ id: z.uuid() }).parse(payload);
        rateLimit(`admin-pix-refresh:${admin.id}`, 30, 60000);
        return json(await refreshPixDepositAsAdmin(String(admin.id), input.id));
      }
      if (path === 'admin/mercadopago' && !post) return json(mercadoPagoStatus());
      if (path === 'admin/mercadopago' && post) {
        const input = z
          .object({
            accessToken: z.string().min(20).max(500),
            publicKey: z.string().min(20).max(500),
            // This field is optional in the admin form; an empty string is valid.
            webhookSecret: z.string().max(500).default(''),
            environment: z.enum(['sandbox', 'production']),
          })
          .parse(payload);
        saveMercadoPagoConfig(input, String(admin.id));
        return json(mercadoPagoStatus());
      }
      if (path === 'admin/mercadopago-test' && post) return json(await testMercadoPagoConnection());
      if (path === 'admin/mercadopago-deposits' && !post)
        return json(
          all(
            'SELECT p.id,p.external_reference,p.amount_cents,p.payment_method,p.status,p.created_at,p.confirmed_at,p.payment_id,p.qr_code,p.qr_code_base64,p.ticket_url,u.name,u.email FROM mercadopago_deposits p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200',
          ),
        );
      if (path === 'admin/mercadopago-refresh' && post) {
        const input = z.object({ id: z.uuid() }).parse(payload);
        rateLimit(`admin-mp-refresh:${admin.id}`, 30, 60000);
        return json(await refreshMercadoPagoDepositAsAdmin(String(admin.id), input.id));
      }
      if (path === 'admin/withdrawals' && !post)
        return json(
          all(
            `SELECT w.*, u.name, u.email FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.created_at DESC LIMIT 200`,
          ),
        );
      if (path === 'admin/withdrawals' && post) {
        const input = z.object({
          id: z.uuid(),
          action: z.enum(['approve', 'reject']),
          adminNote: z.string().max(500).optional(),
        }).parse(payload);
        return json(await processWithdrawalAsAdmin(String(admin.id), input.id, input.action, input.adminNote));
      }
      if (path === 'admin/modes' && !post) return json(settings().modeRules || {});
      if (path === 'admin/modes' && post) {
        const input = z
          .object({
            mode: entrySchema.shape.mode,
            enabled: z.boolean(),
            positions: z.number().int().min(1).max(5),
            passeSecond: z.number().int().min(2).max(5),
          })
          .parse(payload);
        const definition = modes.find((m) => m.id === input.mode)!;
        if (definition.positions === 'all' && input.positions < definition.count)
          throw new ApiError(400, 'Número de posições insuficiente para esta combinação');
        transaction(() => {
          const config = settings().modeRules || {};
          config[input.mode] = {
            enabled: input.enabled,
            positions: input.positions,
            passeSecond: input.passeSecond,
          };
          run('INSERT OR REPLACE INTO settings VALUES(?,?)', 'modeRules', JSON.stringify(config));
          audit(String(admin.id), 'MODE_CONFIGURED', input);
        });
        return json({ ok: true });
      }
      if (path === 'admin' && !post)
        return json({
          users: all(
            'SELECT id,name,email,role,blocked,points,created_at FROM users ORDER BY created_at DESC',
          ),
          rounds: all(
            "SELECT r.*,d.video_id,d.video_url FROM rounds r LEFT JOIN external_draws d ON d.round_id=r.id WHERE r.type='ROULETTE' ORDER BY r.created_at DESC LIMIT 100",
          ).map(publicRound),
          audit: all('SELECT * FROM audit_logs ORDER BY seq DESC LIMIT 200'),
          auditValid: null,
          counts: {
            users: Number(one('SELECT count(*) AS n FROM users')!.n),
            registered: Number(one('SELECT count(*) AS n FROM users WHERE email IS NOT NULL')!.n),
            active: Number(
              one(
                'SELECT count(DISTINCT user_id) AS n FROM sessions WHERE expires_at>?',
                new Date().toISOString(),
              )!.n,
            ),
            entries: Number(
              one(
                "SELECT count(*) AS n FROM entries e JOIN rounds r ON r.id=e.round_id WHERE r.type='ROULETTE'",
              )!.n,
            ),
            rounds: Number(
              one("SELECT count(*) AS n FROM rounds WHERE type='ROULETTE' AND state='PUBLISHED'")!
                .n,
            ),
            scheduled: Number(
              one(
                "SELECT count(*) AS n FROM rounds WHERE type='ROULETTE' AND state IN ('SCHEDULED','OPEN')",
              )!.n,
            ),
            errors: Number(
              one("SELECT count(*) AS n FROM audit_logs WHERE action LIKE '%FAILED%'")!.n,
            ),
          },
          settings: settings(),
        });
      if (path === 'admin/settings' && post) {
        const input = z
          .object({
            platform: z.string().trim().min(3).max(40),
            paused: z.boolean(),
            duration: z.number().int().min(6).max(10),
            announcement: z.string().max(500),
            scheduleSeconds: z.number().int().min(15).max(3600).optional(),
            logo: z
              .string()
              .max(12000)
              .refine(
                (v) => v === '' || /^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
                'Use logo PNG ou WebP',
              )
              .optional(),
            accent: z
              .string()
              .regex(/^#[a-fA-F0-9]{6}$/)
              .optional(),
            banner: z.string().max(200).optional(),
            locale: z.enum(['pt', 'en', 'es']).optional(),
            sound: z.boolean().optional(),
            animations: z.boolean().optional(),
            rules: z.object({
              positions: z.number().int().min(1).max(5),
              passeSecond: z.number().int().min(2).max(5),
            }),
            scratch: z
              .object({
                enabled: z.boolean(),
                price: z.number().int().min(1).max(1000),
                prizes: z
                  .array(
                    z.object({
                      label: z.string().trim().min(2).max(40),
                      points: z.number().int().min(0).max(10000),
                      chance: z.number().int().min(0).max(10000),
                    }),
                  )
                  .min(2)
                  .max(12),
                games: z
                  .array(
                    z.object({
                      id: z.string().regex(/^[a-z0-9-]{1,40}$/),
                      name: z.string().trim().min(2).max(30),
                      tagline: z.string().trim().min(2).max(80),
                      icon: z.string().max(12),
                      image: z
                        .string()
                        .max(500)
                        .refine(
                          (value) => !value || value.startsWith('/') || /^https:\/\//i.test(value),
                          'A imagem precisa usar caminho local ou HTTPS',
                        )
                        .optional(),
                      price: z.number().int().min(1).max(1000),
                      enabled: z.boolean(),
                      prizes: z
                        .array(
                          z.object({
                            label: z.string().trim().min(2).max(40),
                            points: z.number().int().min(0).max(10000),
                            chance: z.number().int().min(0).max(10000),
                            image: z
                              .string()
                              .max(500)
                              .refine(
                                (value) =>
                                  !value || value.startsWith('/') || /^https:\/\//i.test(value),
                                'A imagem precisa usar caminho local ou HTTPS',
                              )
                              .optional(),
                          }),
                        )
                        .min(2)
                        .max(12),
                    }),
                  )
                  .max(10)
                  .optional(),
              })
              .refine(
                (x) => x.prizes.reduce((sum, prize) => sum + prize.chance, 0) === 10000,
                'A soma das chances da raspadinha deve ser 10000 pontos-base (100%)',
              )
              .refine(
                (x) =>
                  !x.games ||
                  x.games.every(
                    (game) => game.prizes.reduce((sum, prize) => sum + prize.chance, 0) === 10000,
                  ),
                'Cada cartão deve ter chances que somem 100%',
              )
              .refine(
                (x) => !x.games || new Set(x.games.map((game) => game.id)).size === x.games.length,
                'Os identificadores dos cartões devem ser únicos',
              ),
          })
          .parse(payload);
        transaction(() => {
          for (const [key, value] of Object.entries(input))
            run('INSERT OR REPLACE INTO settings VALUES(?,?)', key, JSON.stringify(value));
          audit(String(admin.id), 'SETTINGS_UPDATED', input);
        });
        return json({ ok: true });
      }
      if (path === 'admin/users' && post) {
        const input = z
          .object({ id: z.uuid(), blocked: z.boolean(), role: z.enum(['USER', 'ADMIN']) })
          .parse(payload);
        if (input.id === admin.id && (input.blocked || input.role !== 'ADMIN'))
          throw new ApiError(400, 'Você não pode remover seu próprio acesso administrativo');
        transaction(() => {
          if (!one('SELECT id FROM users WHERE id=?', input.id))
            throw new ApiError(404, 'Usuário não encontrado');
          run(
            'UPDATE users SET blocked=?,role=? WHERE id=?',
            input.blocked ? 1 : 0,
            input.role,
            input.id,
          );
          if (input.blocked) run('DELETE FROM sessions WHERE user_id=?', input.id);
          audit(String(admin.id), 'USER_UPDATED', input);
        });
        return json({ ok: true });
      }
      if (path === 'admin/user-history') {
        const id = z.uuid().parse(url.searchParams.get('id'));
        return json({
          entries: all('SELECT * FROM entries WHERE user_id=? ORDER BY created_at DESC', id),
          transactions: all(
            'SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC',
            id,
          ),
          scratchCards: all('SELECT * FROM scratch_cards WHERE user_id=? ORDER BY created_at DESC', id),
          pixDeposits: all('SELECT id,txid,amount_cents,status,created_at,confirmed_at,e2e_id FROM pix_deposits WHERE user_id=? ORDER BY created_at DESC', id),
          audit: all('SELECT * FROM audit_logs WHERE actor=? ORDER BY seq DESC', id),
        });
      }
      if (path === 'admin/rounds' && post) {
        const input = z
          .object({
            action: z.enum(['schedule', 'cancel', 'lock']),
            id: z.uuid().optional(),
            type: z.literal('ROULETTE').optional(),
            opensAt: z.iso.datetime().optional(),
            seconds: z.number().int().min(15).max(86400).optional(),
          })
          .parse(payload);
        if (input.action === 'schedule') {
          if (!input.type || !input.opensAt || new Date(input.opensAt).getTime() < Date.now())
            throw new ApiError(400, 'Informe um horário futuro');
          if (input.type !== 'ROULETTE')
            throw new ApiError(400, 'A plataforma opera somente com a Roleta Vegas');
          const id = transaction(() =>
            scheduleRound('ROULETTE', input.opensAt, input.seconds || 90, String(admin.id)),
          );
          return json({ id });
        }
        if (!input.id) throw new ApiError(400, 'Informe a rodada');
        transaction(() => {
          const round = one('SELECT * FROM rounds WHERE id=?', input.id!);
          if (!round) throw new ApiError(404, 'Rodada não encontrada');
          if (input.action === 'cancel') {
            if (round.state !== 'SCHEDULED')
              throw new ApiError(409, 'Só é possível cancelar antes da abertura');
            run("UPDATE rounds SET state='CANCELLED' WHERE id=?", input.id!);
          } else {
            if (round.state !== 'OPEN') throw new ApiError(409, 'A rodada não está aberta');
            run(
              "UPDATE rounds SET state='LOCKED',locks_at=? WHERE id=?",
              new Date().toISOString(),
              input.id!,
            );
          }
          audit(String(admin.id), `ROUND_${input.action.toUpperCase()}`, { id: input.id });
        });
        if (
          input.action === 'lock' &&
          !one('SELECT round_id FROM external_draws WHERE round_id=?', input.id)
        )
          executeDraw(input.id);
        return json({ ok: true });
      }
      if (path === 'admin/participants') {
        return json(
          all(
            'SELECT e.*,u.name FROM entries e JOIN users u ON u.id=e.user_id WHERE round_id=?',
            url.searchParams.get('id') || '',
          ),
        );
      }
      if (path === 'admin/content' && post) {
        const input = z
          .object({
            slug: z.string().regex(/^[a-z-]{1,40}$/),
            title: z.string().min(2).max(80),
            body: z.string().min(1).max(8000),
          })
          .parse(payload);
        transaction(() => {
          run(
            'INSERT OR REPLACE INTO content_pages VALUES(?,?,?)',
            input.slug,
            input.title,
            input.body,
          );
          audit(String(admin.id), 'CONTENT_UPDATED', { slug: input.slug });
        });
        return json({ ok: true });
      }
    }
    throw new ApiError(404, 'Recurso não encontrado');
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json({ error: e.issues.map((x) => x.message).join('; ') }, 400);
    if (
      e instanceof Error &&
      /seleção|distintos|dígitos|Grupo|Extração|Configuração|Modalidade|Posições|posições/.test(
        e.message,
      )
    )
      return json({ error: e.message }, 400);
    console.error('API:', e instanceof Error ? e.message : 'Unknown error');
    try {
      transaction(() =>
        audit(null, 'SYSTEM_FAILED', {
          path: new URL(req.url).pathname,
          errorType: e instanceof Error ? e.name : 'Unknown',
        }),
      );
    } catch {}
    return json({ error: 'Não foi possível concluir a solicitação' }, 500);
  }
}
export const GET = handler;
export const POST = handler;
