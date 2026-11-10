import { randomUUID } from 'node:crypto';
import { all, audit, one, run, settings, transaction, type Row } from './db';
import { commitment, draw, newSeed } from './fairness';
import {
  animals,
  evaluate,
  normalizeSelection,
  normalizePositions,
  allowedPositions,
  type ModeId,
  type RuleConfig,
} from './game';
import { ApiError } from './auth';
export function publicRound(row: Row) {
  const { seed, ...rest } = row;
  const external = Object.hasOwn(row, 'video_id')
    ? (row.video_id ? { video_id: row.video_id, video_url: row.video_url } : undefined)
    : one('SELECT video_id,video_url FROM external_draws WHERE round_id=?', String(row.id));
  return {
    ...rest,
    source: external ? 'YOUTUBE' : 'SERVER',
    video_id: external?.video_id || null,
    video_url: external?.video_url || null,
    result: row.result ? JSON.parse(String(row.result)) : null,
    rules: JSON.parse(String(row.rules)),
    ...(row.state === 'PUBLISHED' ? { seed } : {}),
  };
}
export function youtubeVideo(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new ApiError(400, 'Link do YouTube inválido'); }
  if (parsed.protocol !== 'https:') throw new ApiError(400, 'Use HTTPS no link do YouTube');
  const host = parsed.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
    if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
    else if (/^\/(live|embed)\/[A-Za-z0-9_-]{11}$/.test(parsed.pathname)) id = parsed.pathname.split('/')[2];
  } else if (host === 'youtu.be') id = parsed.pathname.slice(1);
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new ApiError(400, 'Informe o link de um vídeo ou live do YouTube');
  return { id, url: `https://www.youtube.com/watch?v=${id}` };
}
export function scheduleYoutubeRound(opensAt: string, seconds: number, videoUrl: string, actor: string) {
  const video = youtubeVideo(videoUrl);
  const id = scheduleRound('TRADITIONAL', opensAt, seconds, actor);
  run('INSERT INTO external_draws VALUES(?,?,?,?,?)', id, video.id, video.url, null, null);
  audit(actor, 'YOUTUBE_ROUND_SCHEDULED', { id, videoUrl: video.url });
  return id;
}
export function scheduleRound(
  type: 'ROULETTE' | 'TRADITIONAL',
  opensAt = new Date().toISOString(),
  seconds = 90,
  actor: string | null = null,
) {
  const id = randomUUID(),
    seed = newSeed(),
    config = settings();
  run(
    'INSERT INTO rounds VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    id,
    type,
    'SCHEDULED',
    opensAt,
    new Date(new Date(opensAt).getTime() + seconds * 1000).toISOString(),
    null,
    seed,
    commitment(id, seed),
    null,
    JSON.stringify({ ...config.rules, modes: config.modeRules || {} }),
    new Date().toISOString(),
  );
  audit(actor, 'ROUND_SCHEDULED', { id, type, commitment: commitment(id, seed) });
  return id;
}
export function ensureRounds() {
  transaction(() => {
    if (settings().paused) return;
    if (
      !one(
        "SELECT id FROM rounds WHERE type='ROULETTE' AND state IN ('SCHEDULED','OPEN','LOCKED','DRAWING')",
      )
    )
      scheduleRound('ROULETTE', new Date().toISOString(), Number(settings().scheduleSeconds) || 90);
  });
}
function publishResult(row: Row, result: { group: number | null; numbers: string[] }, actor: string | null) {
    const id = String(row.id);
    const now = new Date().toISOString();
    run('INSERT INTO draw_results VALUES(?,?,?)', id, JSON.stringify(result), now);
    const numbers = result.group
      ? [animals[result.group - 1].tens[0].padStart(4, '0')]
      : result.numbers;
    for (const entry of all('SELECT * FROM entries WHERE round_id=?', id)) {
      const snapshot = one('SELECT * FROM entry_rules WHERE entry_id=?', String(entry.id));
      const outcome = evaluate(
        entry.mode as ModeId,
        JSON.parse(String(entry.selection)),
        numbers,
        JSON.parse(String(snapshot?.rules || row.rules)) as RuleConfig,
        snapshot ? JSON.parse(String(snapshot.positions)) : undefined,
      );
      run('UPDATE entries SET outcome=? WHERE id=?', JSON.stringify(outcome), String(entry.id));
      run(
        'INSERT INTO notifications VALUES(?,?,?,?,?)',
        randomUUID(),
        String(entry.user_id),
        `Rodada ${id.slice(0, 8)} publicada. ${outcome.win ? 'Sua seleção conferiu!' : 'Confira seu comprovante.'}`,
        0,
        now,
      );
    }
    run(
      "UPDATE rounds SET state='PUBLISHED',result=?,published_at=? WHERE id=?",
      JSON.stringify(result),
      now,
      id,
    );
    audit(actor, 'ROUND_PUBLISHED', { id, result, source: actor ? 'YOUTUBE' : 'SERVER' });
    return publicRound(one('SELECT * FROM rounds WHERE id=?', id)!);
}
export function executeDraw(id: string) {
  return transaction(() => {
    const row = one('SELECT * FROM rounds WHERE id=?', id);
    if (!row) throw new ApiError(404, 'Rodada não encontrada');
    if (row.state === 'PUBLISHED') return publicRound(row);
    if (row.state !== 'LOCKED') throw new ApiError(409, 'A rodada precisa estar bloqueada');
    if (one('SELECT round_id FROM external_draws WHERE round_id=?', id))
      throw new ApiError(409, 'O resultado da live deve ser publicado pelo administrador');
    run("UPDATE rounds SET state='DRAWING' WHERE id=? AND state='LOCKED'", id);
    audit(null, 'ROUND_DRAWING', { id });
    return publishResult(row, draw(String(row.seed), id, row.type as 'ROULETTE' | 'TRADITIONAL'), null);
  });
}
export function publishYoutubeResult(id: string, numbers: string[], actor: string) {
  return transaction(() => {
    const row = one('SELECT * FROM rounds WHERE id=?', id);
    const external = one('SELECT * FROM external_draws WHERE round_id=?', id);
    if (!row || !external) throw new ApiError(404, 'Sorteio do YouTube não encontrado');
    if (row.state !== 'LOCKED') throw new ApiError(409, 'Encerre as participações antes de publicar');
    if (numbers.length !== 5 || numbers.some((n) => !/^\d{4}$/.test(n)))
      throw new ApiError(400, 'Informe cinco milhares com quatro dígitos');
    run("UPDATE rounds SET state='DRAWING' WHERE id=? AND state='LOCKED'", id);
    const now = new Date().toISOString();
    run('UPDATE external_draws SET numbers=?,published_at=? WHERE round_id=?', JSON.stringify(numbers), now, id);
    audit(actor, 'YOUTUBE_RESULT_ENTERED', { id, numbers, videoUrl: external.video_url });
    return publishResult(row, { group: null, numbers }, actor);
  });
}
export function advanceRounds() {
  const now = new Date().toISOString();
  transaction(() => {
    for (const r of all("SELECT * FROM rounds WHERE state='SCHEDULED' AND opens_at<=?", now)) {
      run("UPDATE rounds SET state='OPEN' WHERE id=?", String(r.id));
      audit(null, 'ROUND_OPEN', { id: r.id });
    }
    for (const r of all("SELECT * FROM rounds WHERE state='OPEN' AND locks_at<=?", now)) {
      run("UPDATE rounds SET state='LOCKED' WHERE id=?", String(r.id));
      audit(null, 'ROUND_LOCKED', { id: r.id });
    }
  });
  for (const r of all("SELECT id FROM rounds WHERE state='LOCKED' AND id NOT IN (SELECT round_id FROM external_draws)")) executeDraw(String(r.id));
  ensureRounds();
}
function createEntry(
  userId: string,
  input: {
    roundId: string;
    mode: ModeId;
    selection: string[];
    points: number;
    key: string;
    positions?: number[];
  },
) {
  const existing = one(
    'SELECT * FROM entries WHERE user_id=? AND idempotency_key=?',
    userId,
    input.key,
  );
  if (existing) {
    const saved = one('SELECT * FROM entry_rules WHERE entry_id=?', String(existing.id));
    const source = one('SELECT rules FROM rounds WHERE id=?', String(existing.round_id))!;
    const positions = normalizePositions(
      input.mode,
      JSON.parse(String(saved?.rules || source.rules)),
      input.positions,
    );
    if (
      existing.round_id !== input.roundId ||
      existing.mode !== input.mode ||
      Number(existing.points) !== input.points ||
      existing.selection !== JSON.stringify(normalizeSelection(input.mode, input.selection)) ||
      (saved && saved.positions !== JSON.stringify(positions))
    )
      throw new ApiError(409, 'Chave já usada para outra participação');
    return existing;
  }
  const user = one('SELECT * FROM users WHERE id=?', userId),
    round = one('SELECT * FROM rounds WHERE id=?', input.roundId);
  if (!user || user.blocked) throw new ApiError(401, 'Usuário indisponível');
  if (!round || round.state !== 'OPEN' || String(round.locks_at) <= new Date().toISOString())
    throw new ApiError(409, 'A rodada encerrou as participações');
  if (round.type === 'ROULETTE' && !['grupo', 'cabeca', 'cercado'].includes(input.mode))
    throw new ApiError(
      400,
      'A roleta aceita modalidades de um grupo; use a extração para números e combinações',
    );
  const selection = normalizeSelection(input.mode, input.selection);
  const rules = JSON.parse(String(round.rules)) as RuleConfig;
  if (rules.modes?.[input.mode]?.enabled === false)
    throw new ApiError(400, 'Modalidade indisponível nesta extração');
  const positions = normalizePositions(
    input.mode,
    rules,
    input.positions || allowedPositions(input.mode, rules),
  );
  if (!Number.isInteger(input.points) || input.points < 1 || input.points > 100)
    throw new ApiError(400, 'Informe um valor de R$ 0,01 a R$ 1,00');
  if (Number(user.points) < input.points)
    throw new ApiError(400, 'Pontos demonstrativos insuficientes');
  const id = randomUUID(),
    now = new Date().toISOString(),
    balance = Number(user.points) - input.points;
  run('UPDATE users SET points=? WHERE id=?', balance, userId);
  run(
    'INSERT INTO entries VALUES(?,?,?,?,?,?,?,?,?)',
    id,
    userId,
    input.roundId,
    input.mode,
    JSON.stringify(selection),
    input.points,
    input.key,
    null,
    now,
  );
  run(
    'INSERT INTO transactions VALUES(?,?,?,?,?,?)',
    randomUUID(),
    userId,
    id,
    -input.points,
    balance,
    now,
  );
  run(
    'INSERT INTO entry_rules VALUES(?,?,?)',
    id,
    JSON.stringify(positions),
    JSON.stringify(rules),
  );
  audit(userId, 'ENTRY_CREATED', { id, roundId: input.roundId, points: input.points });
  return one('SELECT * FROM entries WHERE id=?', id)!;
}
export function enterRound(userId: string, input: Parameters<typeof createEntry>[1]) {
  return transaction(() => createEntry(userId, input));
}
export function enterGroupBatch(userId: string, input: Parameters<typeof createEntry>[1]) {
  if (!['grupo', 'cabeca', 'cercado'].includes(input.mode))
    throw new ApiError(400, 'Use uma modalidade de grupo individual');
  if (!input.selection.length || input.selection.length > 25)
    throw new ApiError(400, 'Selecione de 1 a 25 animais');
  const groups = input.selection.map((g) => normalizeSelection(input.mode, [g])[0]).sort();
  if (new Set(groups).size !== groups.length) throw new ApiError(400, 'Escolha animais distintos');
  return transaction(() => {
    const existing = all(
      'SELECT * FROM entries WHERE user_id=? AND idempotency_key LIKE ? ORDER BY selection',
      userId,
      input.key + ':%',
    );
    if (
      existing.length &&
      (existing.length !== groups.length ||
        existing.some((e, i) => JSON.parse(String(e.selection))[0] !== groups[i]))
    )
      throw new ApiError(409, 'Chave já usada para outra participação');
    return groups.map((group) =>
      createEntry(userId, { ...input, selection: [group], key: input.key + ':' + group }),
    );
  });
}
const runtime = globalThis as unknown as { royaleTimer?: ReturnType<typeof setInterval> };
export function startScheduler() {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PASSWORD) {
    return;
  }
  if (!runtime.royaleTimer) {
    ensureRounds();
    advanceRounds();
    runtime.royaleTimer = setInterval(() => {
      try {
        advanceRounds();
      } catch (e) {
        console.error('Round scheduler:', e instanceof Error ? e.message : 'Unknown error');
      }
    }, 1000);
    runtime.royaleTimer.unref();
  }
}
