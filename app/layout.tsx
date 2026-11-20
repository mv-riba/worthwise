import type { Metadata } from 'next';
import { Nunito, Fraunces } from 'next/font/google';
import './globals.css';

const body = Nunito({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap', weight: ['600', '700'] });

export const metadata: Metadata = {
  title: 'Worthwise – household net worth',
  description: 'Track your household net worth month by month.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
