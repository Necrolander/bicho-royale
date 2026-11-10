export type ScratchPrize = { label: string; points: number; chance: number; image?: string };
export type ScratchGame = {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  image?: string;
  price: number;
  enabled: boolean;
  prizes: ScratchPrize[];
};
export type ScratchConfig = {
  enabled: boolean;
  price: number;
  prizes: ScratchPrize[];
  games?: ScratchGame[];
};

const catalogPhoto = (tile: number) => `/scratch-prizes/vegas-catalog-3x3.png#tile=${tile}`;

export const defaultScratchConfig: ScratchConfig = {
  enabled: true,
  price: 50,
  prizes: [
    { label: 'Não foi desta vez', points: 0, chance: 5500 },
    { label: '10 créditos', points: 10, chance: 1800, image: catalogPhoto(8) },
    { label: '25 créditos', points: 25, chance: 1100, image: catalogPhoto(4) },
    { label: '50 créditos', points: 50, chance: 700, image: catalogPhoto(3) },
    { label: '100 créditos', points: 100, chance: 500, image: catalogPhoto(0) },
    { label: '250 créditos', points: 250, chance: 250, image: catalogPhoto(5) },
    { label: '500 créditos', points: 500, chance: 100, image: catalogPhoto(6) },
    { label: '1.000 créditos', points: 1000, chance: 40, image: catalogPhoto(2) },
    { label: '5.000 créditos', points: 5000, chance: 9, image: catalogPhoto(1) },
    { label: '10.000 créditos', points: 10000, chance: 1, image: catalogPhoto(7) },
  ],
  games: [
    {
      id: 'ouro-vegas',
      name: 'Ouro Vegas',
      tagline: 'Três símbolos iguais liberam o prêmio',
      icon: '👑',
      image: '/scratch-prizes/relogio.jpg',
      price: 50,
      enabled: true,
      prizes: [
        { label: 'Não foi desta vez', points: 0, chance: 5500 },
        { label: '10 créditos', points: 10, chance: 1800, image: catalogPhoto(8) },
        { label: '25 créditos', points: 25, chance: 1100, image: catalogPhoto(4) },
        { label: '50 créditos', points: 50, chance: 700, image: catalogPhoto(3) },
        { label: '100 créditos', points: 100, chance: 500, image: catalogPhoto(0) },
        { label: '250 créditos', points: 250, chance: 250, image: catalogPhoto(5) },
        { label: '500 créditos', points: 500, chance: 100, image: catalogPhoto(6) },
        { label: '1.000 créditos', points: 1000, chance: 40, image: catalogPhoto(2) },
        { label: '5.000 créditos', points: 5000, chance: 9, image: catalogPhoto(1) },
        { label: '10.000 créditos', points: 10000, chance: 1, image: catalogPhoto(7) },
      ],
    },
    {
      id: 'sete-da-sorte',
      name: 'Sete da Sorte',
      tagline: 'Encontre três setes dourados',
      icon: '7️⃣',
      image: '/scratch-prizes/playstation.jpg',
      price: 100,
      enabled: true,
      prizes: [
        { label: 'Não foi desta vez', points: 0, chance: 6000 },
        { label: '25 créditos', points: 25, chance: 1800, image: catalogPhoto(8) },
        { label: '50 créditos', points: 50, chance: 1000, image: catalogPhoto(4) },
        { label: '100 créditos', points: 100, chance: 700, image: catalogPhoto(3) },
        { label: '200 créditos', points: 200, chance: 350, image: catalogPhoto(0) },
        { label: '500 créditos', points: 500, chance: 100, image: catalogPhoto(5) },
        { label: '1.000 créditos', points: 1000, chance: 40, image: catalogPhoto(6) },
        { label: '2.500 créditos', points: 2500, chance: 8, image: catalogPhoto(2) },
        { label: '5.000 créditos', points: 5000, chance: 1, image: catalogPhoto(1) },
        { label: '10.000 créditos', points: 10000, chance: 1, image: catalogPhoto(7) },
      ],
    },
    {
      id: 'trevo-premiado',
      name: 'Trevo Premiado',
      tagline: 'Raspe os campos e procure o trevo',
      icon: '🍀',
      image: '/scratch-prizes/moto.jpg',
      price: 200,
      enabled: true,
      prizes: [
        { label: 'Não foi desta vez', points: 0, chance: 6400 },
        { label: '50 créditos', points: 50, chance: 1800, image: catalogPhoto(8) },
        { label: '100 créditos', points: 100, chance: 900, image: catalogPhoto(4) },
        { label: '250 créditos', points: 250, chance: 450, image: catalogPhoto(3) },
        { label: '500 créditos', points: 500, chance: 250, image: catalogPhoto(0) },
        { label: '1.000 créditos', points: 1000, chance: 130, image: catalogPhoto(5) },
        { label: '2.500 créditos', points: 2500, chance: 50, image: catalogPhoto(6) },
        { label: '5.000 créditos', points: 5000, chance: 15, image: catalogPhoto(2) },
        { label: '7.500 créditos', points: 7500, chance: 4, image: catalogPhoto(1) },
        { label: '10.000 créditos', points: 10000, chance: 1, image: catalogPhoto(7) },
      ],
    },
  ],
};

export function pickScratchPrize(prizes: ScratchPrize[], draw: number): ScratchPrize {
  const total = prizes.reduce((sum, prize) => sum + prize.chance, 0);
  if (!Number.isInteger(draw) || draw < 0 || draw >= total || total !== 10_000)
    throw new Error('Configuração de chances inválida');
  let boundary = 0;
  for (const prize of prizes) {
    boundary += prize.chance;
    if (draw < boundary) return prize;
  }
  throw new Error('Não foi possível sortear o prêmio');
}
