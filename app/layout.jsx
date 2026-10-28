import { Barlow_Semi_Condensed, Zen_Kaku_Gothic_New } from 'next/font/google';
import AppShell from '@/components/AppShell';
import './globals.css';

const sans = Zen_Kaku_Gothic_New({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const num = Barlow_Semi_Condensed({ weight: ['500', '600', '700'], subsets: ['latin'], variable: '--font-num', display: 'swap' });

export const metadata = {
  title: '車検誘発ボード | GARAGE EVE.RYN',
  description: 'GARAGE EVE.RYN 車検誘発ボード',
  robots: { index: false, follow: false },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ffffff' };

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className={`${sans.variable} ${num.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
