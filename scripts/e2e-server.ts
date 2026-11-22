import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH = `data/e2e-${randomUUID()}.sqlite`;
process.env.ADMIN_EMAIL = 'e2e-admin@example.test';
process.env.ADMIN_PASSWORD = 'e2e-local-only-password-123';
process.env.NEXT_DIST_DIR = '.next-e2e';
// Keep local browser tests isolated from cloud credentials in .env.local.
process.env.DATABASE_URL = '';
process.env.POSTGRES_URL = '';
process.env.DATABASE_PASSWORD = '';
process.env.MERCADOPAGO_PAYMENTS_ENABLED = 'false';
process.env.EFI_PAYMENTS_ENABLED = 'false';
const seed = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
  env: process.env,
  stdio: 'inherit',
});
if (seed.status) process.exit(seed.status || 1);
const mobileSeed = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
  env: { ...process.env, ADMIN_EMAIL: 'e2e-admin-mobile@example.test' },
  stdio: 'inherit',
});
if (mobileSeed.status) process.exit(mobileSeed.status || 1);
const fixtures = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/e2e-fixtures.ts'], {env: process.env, stdio: 'inherit'});
if (fixtures.status) process.exit(fixtures.status || 1);
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3011'],
  { env: process.env, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    child.kill();
    process.exit();
  });
child.on('exit', (code) => process.exit(code || 0));
