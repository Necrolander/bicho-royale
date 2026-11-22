// This fixture runner is used only by the isolated local browser-test server.
if (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PASSWORD || !/^data\/e2e-[a-f0-9-]+\.sqlite$/.test(process.env.DATABASE_PATH || '')) {
  throw new Error('Browser fixtures require an isolated local test database.');
}
const {createUser} = await import('../lib/auth');
const {run} = await import('../lib/db');
const {testCpf} = await import('../e2e/test-cpf');
for (const project of ['desktop','mobile']) {
  const id=createUser('Cliente Pix '+project, 'withdrawal-'+project+'@example.test', 'withdrawal-local-only-123', 'USER', undefined, testCpf());
  run('UPDATE users SET points=10000 WHERE id=?',id);
}
export {};
