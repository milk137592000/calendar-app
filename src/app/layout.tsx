import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '丁二烯請假系統',
  description: '丁二烯請假系統',
  icons: {
    icon: [
      {
        url: '/favicon.png',
        sizes: 'any',
      },
    ],
    apple: [
      {
        url: '/favicon.png',
        type: 'image/png',
        sizes: '180x180',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <head>
        <link rel="icon" href="/favicon.png" sizes="any" />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
