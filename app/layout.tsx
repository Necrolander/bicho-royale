import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://bichos-vegas.vercel.app'),
  title: 'Bichos Vegas — Roleta Vegas',
  description:
    'Gire a Roleta Vegas, veja os últimos animais premiados e confira os resultados.',
  openGraph: {
    title: 'Bichos Vegas — Roleta Vegas',
    description: 'Veja os últimos bichos premiados e as dezenas correspondentes aos grupos da Roleta Vegas.',
    siteName: 'Bichos Vegas',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#080b12' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
