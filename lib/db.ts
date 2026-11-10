import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { animals, modes, defaultRules } from './game';
import { sha256 } from './fairness';
import { defaultScratchConfig, type ScratchConfig } from './scratchcards';
export type Row = Record<string, unknown>;
const globalDb = globalThis as unknown as { royaleDb?: DatabaseSync };
const globalPg = globalThis as unknown as {
  royaleWorker?: Worker;
  royaleReady?: boolean;
  royaleDepth?: number;
  royaleBuffer?: SharedArrayBuffer;
};
// Supabase's Vercel integration exposes POSTGRES_URL by default. Accept it as
// the primary URL too, so connecting the integration is enough to enable Postgres.
const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL;
const cloudEnabled = () => Boolean(databaseUrl() || process.env.DATABASE_PASSWORD);
class DatabaseQueryTimeoutError extends Error {
  constructor(statement: string) {
    super(`Database query timed out: ${statement.slice(0, 180)}`);
    this.name = 'DatabaseQueryTimeoutError';
  }
}
function cloudQuery(sql: string, params: (string | number | null)[]): Row[] {
  if (!globalPg.royaleWorker) {
    globalPg.royaleWorker = new Worker(new URL('./pg-worker.mjs', import.meta.url), {
      workerData: {
        url: databaseUrl(),
        password: process.env.DATABASE_PASSWORD,
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        port: process.env.DATABASE_PORT,
        database: process.env.DATABASE_NAME,
      },
    });
    globalPg.royaleWorker.unref();
  }
  // DB calls block this thread until the worker signals completion, so this buffer
  // can be reused safely. Allocating 16 MiB for every SQL query exhausted Vercel's
  // function memory under repeated bootstrap polling.
  const buffer = (globalPg.royaleBuffer ??= new SharedArrayBuffer(8 + 4 * 1024 * 1024));
  const state = new Int32Array(buffer, 0, 2);
  Atomics.store(state, 0, 0);
  Atomics.store(state, 1, 0);
  globalPg.royaleWorker.postMessage({ buffer, statement: sql, params });
  if (Atomics.wait(state, 0, 0, 15000) === 'timed-out') {
    // A worker that did not answer can no longer safely share the response
    // buffer. Terminate it so its Postgres connection is released and the next
    // request gets a clean worker instead of waiting behind a stuck query.
    const stuckWorker = globalPg.royaleWorker;
    globalPg.royaleWorker = undefined;
    globalPg.royaleBuffer = undefined;
    void stuckWorker?.terminate();
    throw new DatabaseQueryTimeoutError(sql);
  }
  const result = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, Atomics.load(state, 1))));
  if (result.error) throw new Error(result.error);
  return result.rows;
}
export function initialize() {
  if (!cloudEnabled() || globalPg.royaleReady) return;
  if (cloudEnabled()) {
    // Most Vercel invocations are fresh isolates. Once the database has been
    // seeded, avoid reopening a serialized write transaction on every cold
    // start just to reinsert rows that already exist.
    if (one("SELECT 1 AS ready FROM settings WHERE key='platform'")) {
      globalPg.royaleReady = true;
      return;
    }
    // A serverless cold start must not seed each row with a separate network
    // round trip through Supabase's transaction pooler. Batch the idempotent
    // seed data into a handful of statements; the schema is installed by the
    // checked-in Supabase migration.
    transaction(() => {
      run('INSERT OR IGNORE INTO roles VALUES(?),(?)', 'USER', 'ADMIN');
      const animalValues = animals.map(() => '(?,?,?)').join(',');
      run(
        `INSERT OR IGNORE INTO animals VALUES${animalValues}`,
        ...animals.flatMap((animal) => [animal.id, animal.name, JSON.stringify(animal.tens)]),
      );
      const modeValues = modes.map(() => '(?,?)').join(',');
      run(
        `INSERT OR IGNORE INTO modes VALUES${modeValues}`,
        ...modes.flatMap((mode) => [mode.id, JSON.stringify(mode)]),
      );
      const defaults = Object.entries({
        platform: 'BICHOS VEGAS', paused: false, duration: 7, scheduleSeconds: 90,
        logo: '', accent: '#D4AF37', banner: '', locale: 'pt', sound: false,
        animations: true, rules: defaultRules,
        announcement: 'Uma experiência de entretenimento. Todos os créditos são fictícios e não transferíveis.',
        scratch: defaultScratchConfig,
      });
      const settingValues = defaults.map(() => '(?,?)').join(',');
      run(
        `INSERT OR IGNORE INTO settings VALUES${settingValues}`,
        ...defaults.flatMap(([key, value]) => [key, JSON.stringify(value)]),
      );
      run(
        'INSERT OR IGNORE INTO content_pages VALUES(?,?,?)',
        'faq', 'Central de ajuda',
        'Os créditos têm valor? Não. São pontos demonstrativos, sem conversão, transferência ou resgate.\nComo conferir? Abra Resultados e selecione Verificar. A semente publicada deve reproduzir o compromisso e o resultado.\nAs extrações são oficiais? Não. Todos os sorteios são simulações independentes.',
      );
    });
    globalPg.royaleReady = true;
    return;
  }
  transaction(() => {
    ['USER', 'ADMIN'].forEach((x) => run('INSERT OR IGNORE INTO roles VALUES(?)', x));
    animals.forEach((x) => run('INSERT OR IGNORE INTO animals VALUES(?,?,?)', x.id, x.name, JSON.stringify(x.tens)));
    modes.forEach((x) => run('INSERT OR IGNORE INTO modes VALUES(?,?)', x.id, JSON.stringify(x)));
    for (const [key, value] of Object.entries({
      platform: 'BICHOS VEGAS', paused: false, duration: 7, scheduleSeconds: 90,
      logo: '', accent: '#D4AF37', banner: '', locale: 'pt', sound: false,
      animations: true, rules: defaultRules,
      announcement: 'Uma experiência de entretenimento. Todos os créditos são fictícios e não transferíveis.',
      scratch: defaultScratchConfig,
    })) run('INSERT OR IGNORE INTO settings VALUES(?,?)', key, JSON.stringify(value));
    run('CREATE TABLE IF NOT EXISTS scratch_cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),idempotency_key TEXT NOT NULL,price_points INTEGER NOT NULL,prize_points INTEGER NOT NULL,prize_label TEXT NOT NULL,created_at TEXT NOT NULL,game_id TEXT,UNIQUE(user_id,idempotency_key))');
    run('ALTER TABLE scratch_cards ADD COLUMN IF NOT EXISTS game_id TEXT');
    run('INSERT OR IGNORE INTO content_pages VALUES(?,?,?)', 'faq', 'Central de ajuda', 'Os créditos têm valor? Não. São pontos demonstrativos, sem conversão, transferência ou resgate.\nComo conferir? Abra Resultados e selecione Verificar. A semente publicada deve reproduzir o compromisso e o resultado.\nAs extrações são oficiais? Não. Todos os sorteios são simulações independentes.');
  });
  globalPg.royaleReady = true;
}
export function db() {
  if (globalDb.royaleDb) return globalDb.royaleDb;
  const path = resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH || 'data/bicho-royale.sqlite',
  );
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS roles (name TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE,password_hash TEXT,role TEXT NOT NULL REFERENCES roles(name),blocked INTEGER NOT NULL DEFAULT 0,points INTEGER NOT NULL DEFAULT 1000 CHECK(points>=0),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS animals(id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 25),name TEXT NOT NULL,tens TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS modes(id TEXT PRIMARY KEY,definition TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('ROULETTE','TRADITIONAL')),state TEXT NOT NULL CHECK(state IN ('SCHEDULED','OPEN','LOCKED','DRAWING','PUBLISHED','CANCELLED')),opens_at TEXT NOT NULL,locks_at TEXT NOT NULL,published_at TEXT,seed TEXT NOT NULL,commitment TEXT NOT NULL,result TEXT,rules TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS draw_results(round_id TEXT PRIMARY KEY REFERENCES rounds(id),result TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),round_id TEXT NOT NULL REFERENCES rounds(id),mode TEXT NOT NULL REFERENCES modes(id),selection TEXT NOT NULL,points INTEGER NOT NULL CHECK(points>0),idempotency_key TEXT NOT NULL,outcome TEXT,created_at TEXT NOT NULL,UNIQUE(user_id,idempotency_key));
 CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),entry_id TEXT UNIQUE REFERENCES entries(id),amount INTEGER NOT NULL,balance INTEGER NOT NULL CHECK(balance>=0),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS entry_rules(entry_id TEXT PRIMARY KEY REFERENCES entries(id),positions TEXT NOT NULL,rules TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS immutable_entry_rules_update BEFORE UPDATE ON entry_rules BEGIN SELECT RAISE(ABORT,'Ticket rules are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_entry_rules_delete BEFORE DELETE ON entry_rules BEGIN SELECT RAISE(ABORT,'Ticket rules are immutable'); END;
 CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),message TEXT NOT NULL,read INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit_logs(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,actor TEXT,action TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS content_pages(slug TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS scratch_cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),idempotency_key TEXT NOT NULL,price_points INTEGER NOT NULL,prize_points INTEGER NOT NULL,prize_label TEXT NOT NULL,created_at TEXT NOT NULL,game_id TEXT,UNIQUE(user_id,idempotency_key));
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS external_draws(round_id TEXT PRIMARY KEY REFERENCES rounds(id),video_id TEXT NOT NULL,video_url TEXT NOT NULL,numbers TEXT,published_at TEXT);
 CREATE TABLE IF NOT EXISTS efi_configs(id INTEGER PRIMARY KEY CHECK(id=1),encrypted TEXT NOT NULL,environment TEXT NOT NULL,pix_key_hint TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pix_deposits(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),txid TEXT UNIQUE NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),status TEXT NOT NULL,copy_paste TEXT,created_at TEXT NOT NULL,confirmed_at TEXT,e2e_id TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS mercadopago_configs(id INTEGER PRIMARY KEY CHECK(id=1),encrypted TEXT NOT NULL,environment TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mercadopago_deposits(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),external_reference TEXT UNIQUE NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),payment_method TEXT NOT NULL,status TEXT NOT NULL,init_point TEXT,sandbox_init_point TEXT,created_at TEXT NOT NULL,confirmed_at TEXT,payment_id TEXT,qr_code TEXT,qr_code_base64 TEXT,ticket_url TEXT);
 CREATE TABLE IF NOT EXISTS scratch_cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),idempotency_key TEXT NOT NULL,price_points INTEGER NOT NULL,prize_points INTEGER NOT NULL,prize_label TEXT NOT NULL,created_at TEXT NOT NULL,game_id TEXT,UNIQUE(user_id,idempotency_key));
 CREATE INDEX IF NOT EXISTS idx_round_state ON rounds(state,locks_at);
 CREATE INDEX IF NOT EXISTS idx_entry_user ON entries(user_id,created_at);
 CREATE INDEX IF NOT EXISTS idx_entry_round ON entries(round_id);
 CREATE INDEX IF NOT EXISTS idx_session_user ON sessions(user_id);
 CREATE INDEX IF NOT EXISTS idx_notify_user ON notifications(user_id,created_at);
 CREATE INDEX IF NOT EXISTS idx_scratch_user_created ON scratch_cards(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_mp_user ON mercadopago_deposits(user_id,created_at);
 CREATE TRIGGER IF NOT EXISTS immutable_published BEFORE UPDATE ON rounds WHEN OLD.state='PUBLISHED' BEGIN SELECT RAISE(ABORT,'Published round is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_result_update BEFORE UPDATE ON draw_results BEGIN SELECT RAISE(ABORT,'Result is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_result_delete BEFORE DELETE ON draw_results BEGIN SELECT RAISE(ABORT,'Result is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_audit_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_audit_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'Audit is immutable'); END;`);
  if (!d.prepare('PRAGMA table_info(scratch_cards)').all().some((column) => column.name === 'game_id'))
    d.exec('ALTER TABLE scratch_cards ADD COLUMN game_id TEXT');
  globalDb.royaleDb = d;
  ['USER', 'ADMIN'].forEach((x) => d.prepare('INSERT OR IGNORE INTO roles VALUES(?)').run(x));
  animals.forEach((x) =>
    d
      .prepare('INSERT OR IGNORE INTO animals VALUES(?,?,?)')
      .run(x.id, x.name, JSON.stringify(x.tens)),
  );
  modes.forEach((x) =>
    d.prepare('INSERT OR IGNORE INTO modes VALUES(?,?)').run(x.id, JSON.stringify(x)),
  );
  for (const [key, value] of Object.entries({
    platform: 'BICHOS VEGAS',
    paused: false,
    duration: 7,
    scheduleSeconds: 90,
    logo: '',
    accent: '#D4AF37',
    banner: '',
    locale: 'pt',
    sound: false,
    animations: true,
    rules: defaultRules,
    announcement:
      'Uma experiência de entretenimento. Todos os créditos são fictícios e não transferíveis.',
    scratch: defaultScratchConfig,
  }))
    d.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run(key, JSON.stringify(value));
  d.prepare('INSERT OR IGNORE INTO content_pages VALUES(?,?,?)').run(
    'faq',
    'Central de ajuda',
    'Os créditos têm valor? Não. São pontos demonstrativos, sem conversão, transferência ou resgate.\nComo conferir? Abra Resultados e selecione Verificar. A semente publicada deve reproduzir o compromisso e o resultado.\nAs extrações são oficiais? Não. Todos os sorteios são simulações independentes.',
  );
  return d;
}
export function all(sql: string, ...params: (string | number | null)[]): Row[] {
  if (cloudEnabled()) return cloudQuery(sql, params);
  return db()
    .prepare(sql)
    .all(...params) as Row[];
}
export function one(sql: string, ...params: (string | number | null)[]): Row | undefined {
  if (cloudEnabled()) return cloudQuery(sql, params)[0];
  return db()
    .prepare(sql)
    .get(...params) as Row | undefined;
}
export function run(sql: string, ...params: (string | number | null)[]) {
  if (cloudEnabled()) return cloudQuery(sql, params);
  return db()
    .prepare(sql)
    .run(...params);
}
export function transaction<T>(fn: () => T): T {
  if (cloudEnabled()) {
    if (globalPg.royaleDepth) return fn();
    cloudQuery('BEGIN', []);
    globalPg.royaleDepth = 1;
    try {
      cloudQuery('SELECT pg_advisory_xact_lock(8372691)', []);
      const value = fn();
      cloudQuery('COMMIT', []);
      return value;
    } catch (error) {
      if (!(error instanceof DatabaseQueryTimeoutError)) cloudQuery('ROLLBACK', []);
      throw error;
    } finally { globalPg.royaleDepth = 0; }
  }
  db().exec('BEGIN IMMEDIATE');
  try {
    const v = fn();
    db().exec('COMMIT');
    return v;
  } catch (e) {
    db().exec('ROLLBACK');
    throw e;
  }
}
export function audit(actor: string | null, action: string, detail: unknown): void {
  if (cloudEnabled() && !globalPg.royaleDepth) {
    transaction(() => audit(actor, action, detail));
    return;
  }
  const previous = one('SELECT hash FROM audit_logs ORDER BY seq DESC LIMIT 1');
  const id = randomUUID(),
    time = new Date().toISOString(),
    json = JSON.stringify(detail),
    prev = String(previous?.hash || 'GENESIS');
  run(
    'INSERT INTO audit_logs(id,actor,action,detail,created_at,previous_hash,hash) VALUES(?,?,?,?,?,?,?)',
    id,
    actor,
    action,
    json,
    time,
    prev,
    sha256(JSON.stringify([id, actor, action, json, time, prev])),
  );
}
export function settings() {
  const result = Object.fromEntries(
    all('SELECT * FROM settings').map((x) => [x.key, JSON.parse(String(x.value))]),
  );
  const savedScratch = result.scratch as Partial<ScratchConfig> | undefined;
  if (savedScratch) {
    const savedGames = savedScratch.games ?? defaultScratchConfig.games ?? [];
    const defaults = new Map((defaultScratchConfig.games ?? []).map((game) => [game.id, game]));
    const legacyPrizeSets: Record<string, string[]> = {
      'ouro-vegas': [
        '0:7000,25:2400,100:550,250:50',
        '0:6500,10:1800,25:1000,50:450,100:200,250:45,500:5',
      ],
      'sete-da-sorte': [
        '0:7600,50:2100,200:280,500:20',
        '0:7000,25:1800,50:850,100:250,200:80,500:19,1000:1',
      ],
      'trevo-premiado': [
        '0:8000,100:1700,400:280,1000:20',
        '0:7400,50:1800,100:600,200:150,400:45,1000:5',
      ],
    };
    const prizeSignature = (prizes: ScratchConfig['prizes']) =>
      prizes
        .map((prize) => `${prize.points}:${prize.chance}`)
        .sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]))
        .join(',');
    result.scratch = {
      ...defaultScratchConfig,
      ...savedScratch,
      games: savedGames.map((game) => {
        const fallback = defaults.get(game.id);
        const prizeDefaults = new Map((fallback?.prizes ?? []).map((prize) => [prize.points, prize]));
        const storedPrizes = Array.isArray(game.prizes) ? game.prizes : [];
        const prizes =
          fallback && legacyPrizeSets[game.id]?.includes(prizeSignature(storedPrizes))
            ? fallback.prizes
            : storedPrizes;
        return {
          ...fallback,
          ...game,
          image: game.image || fallback?.image || '',
          prizes: prizes.map((prize) => ({
            ...prize,
            image: prize.image || prizeDefaults.get(prize.points)?.image || '',
          })),
        };
      }),
    };
  }
  return result;
}
export function verifyAudit(batchSize = 5000) {
  let prev = 'GENESIS';
  let lastSeq = 0;
  while (true) {
    const batch = all('SELECT * FROM audit_logs WHERE seq>? ORDER BY seq LIMIT ?', lastSeq, batchSize);
    if (!batch.length) return true;
    for (const x of batch) {
      if (
        x.previous_hash !== prev ||
        x.hash !== sha256(JSON.stringify([x.id, x.actor, x.action, x.detail, x.created_at, prev]))
      )
        return false;
      prev = String(x.hash);
      lastSeq = Number(x.seq);
    }
  }
}
