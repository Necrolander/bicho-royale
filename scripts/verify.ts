import { commitment, draw } from '../lib/fairness';
const id = process.argv[2],
  seed = process.argv[3],
  type = process.argv[4];
if (!id || !seed || !['ROULETTE', 'TRADITIONAL'].includes(type)) {
  console.error('Uso: npx tsx scripts/verify.ts ID SEMENTE ROULETTE|TRADITIONAL');
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      id,
      commitment: commitment(id, seed),
      result: draw(seed, id, type as 'ROULETTE' | 'TRADITIONAL'),
    },
    null,
    2,
  ),
);
