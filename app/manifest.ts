import type { MetadataRoute } from 'next';
import { siteName } from '@/lib/brand';

// Web App Manifest：standalone + 深浅 theme_color / background_color + 图标。
// 深浅配色以 layout.tsx 导出的 viewport.themeColor 两个 <meta> 为准（HTML meta 优先于
// manifest 的单值），这里保留静态浅色单值作为启动画面 / 状态栏兜底。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: siteName,
    description: '敲木鱼、念佛计数，每日记录，累计珍藏。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fafbf9',
    theme_color: '#fafbf9',
    lang: 'zh-CN',
    // Next 的 Manifest 类型把 purpose 限成单值，规范允许空格分隔的 'any maskable'；
    // 做一次类型兜底保留运行时值，避免 typecheck 报错。
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ] as unknown as MetadataRoute.Manifest['icons'],
  };
}
