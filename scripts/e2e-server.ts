import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH = `data/e2e-${randomUUID()}.sqlite`;
process.env.ADMIN_EMAIL = 'e2e-admin@example.test';
process.env.ADMIN_PASSWORD = 'e2e-local-only-password-123';
process.env.NEXT_DIST_DIR = '.next-e2e';
const seed = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
  env: process.env,
  stdio: 'inherit',
});
if (seed.status) process.exit(seed.status || 1);
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
