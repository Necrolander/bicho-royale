import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { all, audit, one, run, transaction, type Row } from './db';
import { sha256 } from './fairness';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password: string, hash: string) {
  const [salt, value] = hash.split(':');
  if (!salt || !value) return false;
  const actual = scryptSync(password, salt, 64),
    expected = Buffer.from(value, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function publicUser(user: Row) {
  return {
    id: user.id,
    name: user.name,
    fullName: user.full_name,
    cpf: user.cpf,
    email: user.email,
    role: user.role,
    points: user.points,
    created_at: user.created_at,
    guest: !user.email,
  };
}
export async function currentUser(required = true) {
  const token = (await cookies()).get('royale_session')?.value;
  const user = token
    ? one(
        'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?',
        sha256(token),
        new Date().toISOString(),
      )
    : undefined;
  if (!user || user.blocked) {
    if (required) throw new ApiError(401, 'Entre na sua conta para continuar');
    return undefined;
  }
  return user;
}
export async function requireAdmin() {
  const u = (await currentUser())!;
  if (u.role !== 'ADMIN') throw new ApiError(403, 'Acesso reservado à administração');
  return u;
}
export function requireRegistration(user: Row) {
  if (!user.email || !user.password_hash)
    throw new ApiError(403, 'Cadastre-se ou entre na sua conta antes de apostar');
  return user;
}
export function updateProfileName(userId: string, name: string) {
  transaction(() => {
    run('UPDATE users SET name=? WHERE id=? AND email IS NOT NULL', name, userId);
    audit(userId, 'PROFILE_UPDATED', { fields: ['name'] });
  });
  return publicUser(one('SELECT * FROM users WHERE id=?', userId)!);
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 86400000);
  run('INSERT INTO sessions VALUES(?,?,?)', sha256(token), userId, expires.toISOString());
  (await cookies()).set('royale_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
}
export function rateLimit(key: string, limit = 30, window = 60000) {
  transaction(() => {
    const now = Date.now(),
      row = one('SELECT * FROM rate_limits WHERE key=?', key);
    if (!row || Number(row.reset_at) <= now) {
      run('INSERT OR REPLACE INTO rate_limits VALUES(?,?,?)', key, 1, now + window);
    } else {
      if (Number(row.count) >= limit)
        throw new ApiError(429, 'Muitas tentativas. Aguarde antes de tentar novamente.');
      run('UPDATE rate_limits SET count=count+1 WHERE key=?', key);
    }
  });
}
export function createUser(
  name: string,
  email: string | null,
  password: string | null,
  role = 'USER',
  fullName?: string,
  cpf?: string,
) {
  const id = randomUUID();
  transaction(() => {
    run(
      'INSERT INTO users(id,name,full_name,cpf,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?,?)',
      id,
      name,
      fullName || null,
      cpf || null,
      email,
      password ? passwordHash(password) : null,
      role,
      new Date().toISOString(),
    );
    run(
      'INSERT INTO transactions VALUES(?,?,?,?,?,?)',
      randomUUID(),
      id,
      null,
      1000,
      1000,
      new Date().toISOString(),
    );
    audit(id, 'USER_CREATED', { role, guest: !email });
  });
  return id;
}
export function cleanupSessions() {
  run('DELETE FROM sessions WHERE expires_at<?', new Date().toISOString());
  all('SELECT id FROM users LIMIT 1');
}
