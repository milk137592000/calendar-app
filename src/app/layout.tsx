import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '輪班表',
  description: '輪班排程管理系統',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
