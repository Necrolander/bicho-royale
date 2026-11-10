import { randomBytes } from 'node:crypto';
import { createUser } from '../lib/auth';
import { one, run, transaction, audit, initialize } from '../lib/db';
import { scheduleRound, executeDraw, ensureRounds } from '../lib/rounds';
const email = process.env.ADMIN_EMAIL || 'admin@bichoroyale.local';
initialize();
if (!one('SELECT id FROM users WHERE email=?', email)) {
  const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url');
  createUser('Administrador', email, password, 'ADMIN');
  console.log(
    process.env.ADMIN_PASSWORD
      ? `Administrador local criado. E-mail: ${email}. Senha recebida do ambiente.`
      : `Administrador local criado. E-mail: ${email}\nSenha temporária: ${password}\nGuarde-a; não será exibida novamente.`,
  );
} else console.log('Administrador já existe; senha preservada.');
if (!one("SELECT id FROM rounds WHERE state='PUBLISHED'")) {
  for (let i = 12; i > 0; i--) {
    const id = transaction(() => {
      const time = new Date(Date.now() - i * 3600000).toISOString();
      const id = scheduleRound(i % 2 ? 'ROULETTE' : 'TRADITIONAL', time, 90);
      run("UPDATE rounds SET state='OPEN' WHERE id=?", id);
      audit(null, 'ROUND_OPEN', { id, seedDemo: true });
      run("UPDATE rounds SET state='LOCKED' WHERE id=?", id);
      audit(null, 'ROUND_LOCKED', { id, seedDemo: true });
      return id;
    });
    executeDraw(id);
    run('INSERT OR IGNORE INTO settings VALUES(?,?)', 'seed_demo', JSON.stringify(true));
  }
}
ensureRounds();
console.log(
  'Seed concluído: animais, modalidades e administrador. Histórico simulado existente preservado.',
);
