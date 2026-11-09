import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { siteName, siteSubtitle } from '@/lib/brand';
import { THEME_KEY } from '@/lib/theme';

export const metadata: Metadata = {
  title: `${siteName} · ${siteSubtitle}`,
  description: '敲木鱼、念佛计数，每日记录，累计珍藏。',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: siteName },
  // app/icon.png / app/apple-icon.png / app/favicon.ico 由 Next 自动识别生成 link，这里不重复声明。
  other: { 'color-scheme': 'light dark' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafbf9' },
    { media: '(prefers-color-scheme: dark)', color: '#171d1a' },
  ],
};

// hydrate 前同步设好 <html data-theme>，刷新 / 冷启动不白闪；短小、无依赖、try/catch 兜底。
// 显式 light/dark 会绕过 iOS PWA standalone 里不跟随系统的 prefers-color-scheme。
const themeBootScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)}),r=document.documentElement;if(t==='light'||t==='dark'){r.setAttribute('data-theme',t)}else{r.removeAttribute('data-theme')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {children}
      </body>
    </html>
  );
}
