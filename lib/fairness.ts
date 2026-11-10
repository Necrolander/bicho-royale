import { createHash, randomBytes } from 'node:crypto';
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const newSeed = () => randomBytes(32).toString('hex');
export const commitment = (id: string, seed: string) => sha256(`bicho-royale:v1:${id}:${seed}`);
export function derive(seed: string, id: string, max: number, count: number): number[] {
  if (!/^[a-f0-9]{64}$/.test(seed) || max < 1 || max > 10000) throw new Error('Entrada inválida');
  const out: number[] = [];
  let counter = 0;
  const ceiling = Math.floor(0x100000000 / max) * max;
  while (out.length < count) {
    const hash = createHash('sha256')
      .update(`bicho-royale:draw:v1:${id}:${seed}:${counter++}`)
      .digest();
    for (let i = 0; i < hash.length && out.length < count; i += 4) {
      const value = hash.readUInt32BE(i);
      if (value < ceiling) out.push(value % max);
    }
  }
  return out;
}
export function draw(seed: string, id: string, type: 'ROULETTE' | 'TRADITIONAL') {
  return type === 'ROULETTE'
    ? { group: derive(seed, id, 25, 1)[0] + 1, numbers: [] as string[] }
    : { group: null, numbers: derive(seed, id, 10000, 5).map((n) => String(n).padStart(4, '0')) };
}
