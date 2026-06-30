import './globals.css';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { Nav } from './components/nav';

const geistSans = Geist({ subsets: ['latin'], variable: '--okf-font-sans', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--okf-font-mono', display: 'swap' });

export const metadata = { title: 'OKF Hub', description: 'OKF team knowledge hub' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className="okf-app">
          <Nav />
          <div className="okf-main okf-grid">{children}</div>
        </div>
      </body>
    </html>
  );
}
