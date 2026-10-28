import type { Metadata, Viewport } from 'next';
import { DM_Mono, Instrument_Sans, Newsreader } from 'next/font/google';
import { cx } from '@/ui/cx';
import { Providers } from './providers';
import './globals.css';

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-newsreader',
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
});

export const metadata: Metadata = {
  title: { default: 'Stay Flow', template: '%s · Stay Flow' },
  description:
    'Online booking and a front desk for small hotels, built so a room can never be sold twice.',
};

export const viewport: Viewport = {
  themeColor: '#f2f0ea',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={cx(newsreader.variable, instrumentSans.variable, dmMono.variable)}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
