import sharp from 'sharp';
import { copyFile } from 'node:fs/promises';

const width = 1200;
const height = 630;
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="glow"><stop stop-color="#293d31"/><stop offset="0.58" stop-color="#151c25"/><stop offset="1" stop-color="#080b12"/></radialGradient>
    <linearGradient id="gold"><stop stop-color="#75521f"/><stop offset="0.5" stop-color="#f0c75f"/><stop offset="1" stop-color="#75521f"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="30" y="30" width="1140" height="570" rx="26" fill="none" stroke="url(#gold)" stroke-opacity="0.62" stroke-width="2"/>
  <text x="600" y="539" fill="#e7d8ad" font-family="Arial,sans-serif" font-size="29" font-weight="700" text-anchor="middle" letter-spacing="3">ROLETA • 25 ANIMAIS • SORTEIOS AO VIVO</text>
</svg>`);
const logo = await sharp('public/bichos-vegas-logo.png').resize({ width: 990 }).png().toBuffer();
await sharp(background)
  .composite([{ input: logo, left: 105, top: 42 }])
  .png({ compressionLevel: 9 })
  .toFile('app/opengraph-image.png');
await copyFile('app/opengraph-image.png', 'app/twitter-image.png');
