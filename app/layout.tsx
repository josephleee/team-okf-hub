import './globals.css';
import type { ReactNode } from 'react';
import { Nav } from './components/nav';

export const metadata = { title: 'OKF Hub', description: 'OKF team knowledge hub' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
