import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { siteName, siteSubtitle } from '@/lib/brand';

export const metadata: Metadata = {
  title: `${siteName} · ${siteSubtitle}`,
  description: '个人念佛器：登录后敲木鱼计数，每满 5 声同步远端，每日零点当日归零、总数永久保留。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
