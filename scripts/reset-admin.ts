import { randomBytes } from 'node:crypto';
import { passwordHash } from '../lib/auth';
import { one, run, transaction, audit } from '../lib/db';
const email = process.env.ADMIN_EMAIL || 'admin@bichoroyale.local',
  user = one("SELECT * FROM users WHERE email=? AND role='ADMIN'", email);
if (!user) {
  console.error('Administrador não encontrado. Execute o seed ou informe ADMIN_EMAIL.');
  process.exit(1);
}
const password = randomBytes(18).toString('base64url');
transaction(() => {
  run(
    'UPDATE users SET password_hash=?,blocked=0 WHERE id=?',
    passwordHash(password),
    String(user.id),
  );
  run('DELETE FROM sessions WHERE user_id=?', String(user.id));
  audit(String(user.id), 'LOCAL_ADMIN_PASSWORD_RESET', {});
});
console.log(
  `Administrador: ${email}\nNova senha: ${password}\nSessões anteriores revogadas. Guarde esta senha.`,
);
