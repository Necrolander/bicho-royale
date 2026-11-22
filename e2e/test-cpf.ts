import { randomInt } from 'node:crypto';
export function testCpf() {
  const digits = Array.from({length: 9}, () => randomInt(10));
  for (const size of [9, 10]) {
    const sum = digits.reduce((total, digit, index) => total + digit * (size + 1 - index), 0);
    const value = (sum * 10) % 11;
    digits.push(value === 10 ? 0 : value);
  }
  return digits.join('');
}
