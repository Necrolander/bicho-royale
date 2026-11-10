import { parentPort, workerData } from 'node:worker_threads';
import postgres from 'postgres';

const connection = workerData.url || {
  host: workerData.host,
  port: Number(workerData.port) || 6543,
  database: workerData.database || 'postgres',
  username: workerData.user,
  password: workerData.password,
};
const options = {
  max: 1,
  prepare: false,
  ssl: 'require',
  idle_timeout: 20,
  connect_timeout: 10,
};
const sql = workerData.url ? postgres(workerData.url, options) : postgres({ ...connection, ...options });
const columns = {
  preferences: ['user_id', 'value'],
  settings: ['key', 'value'],
  content_pages: ['slug', 'title', 'body'],
  rate_limits: ['key', 'count', 'reset_at'],
  efi_configs: ['id', 'encrypted', 'environment', 'pix_key_hint', 'updated_at'],
};
function translate(input) {
  let index = 0;
  let query = input.replace(/\?/g, () => `$${++index}`);
  if (/^INSERT OR IGNORE INTO /i.test(input)) {
    query = query.replace(/^INSERT OR IGNORE INTO /i, 'INSERT INTO ') + ' ON CONFLICT DO NOTHING';
  }
  const match = /^INSERT OR REPLACE INTO (\w+) VALUES\(([^)]+)\)$/i.exec(input);
  if (match) {
    const table = match[1];
    const cols = columns[table];
    if (!cols) throw new Error(`Unsupported upsert: ${table}`);
    query = `INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (${cols[0]}) DO UPDATE SET ${cols.slice(1).map(c => `${c}=EXCLUDED.${c}`).join(',')}`;
  }
  if (query === 'BEGIN IMMEDIATE') query = 'BEGIN';
  return query;
}
let pending = Promise.resolve();
parentPort.on('message', ({ buffer, statement, params }) => {
  pending = pending.then(async () => {
    const flags = new Int32Array(buffer, 0, 2);
    const bytes = new Uint8Array(buffer, 8);
    try {
      const result = await sql.unsafe(translate(statement), params);
      const payload = new TextEncoder().encode(JSON.stringify({ rows: Array.from(result) }));
      if (payload.length > bytes.length) throw new Error('Database response too large');
      bytes.set(payload);
      Atomics.store(flags, 1, payload.length);
      Atomics.store(flags, 0, 1);
    } catch (error) {
      const payload = new TextEncoder().encode(JSON.stringify({ error: error instanceof Error ? error.message : 'Database error', code: error?.code }));
      bytes.set(payload.subarray(0, bytes.length));
      Atomics.store(flags, 1, Math.min(payload.length, bytes.length));
      Atomics.store(flags, 0, 2);
    }
    Atomics.notify(flags, 0);
  });
});
