import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/session';

// PWA 清单与图标必须匿名可读：iOS「添加到主屏幕」时抓取这些资源，此时还没有登录态。
// 都是 Next 生成的静态资源（manifest / icon / apple-icon），不含任何用户数据。
// public/ 下的 icon-192 / icon-512 / apple-touch-icon 由 assets 直出，不经过本中间件。
const PUBLIC_ASSETS = new Set([
  '/manifest.webmanifest',
  '/icon.png',
  '/apple-icon.png',
]);

/** 未登录一律挡在门外：页面 302 /login，数据 API 401；已登录别再进 /login。 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (PUBLIC_ASSETS.has(pathname)) return NextResponse.next();

  if ((req.method === 'GET' || req.method === 'HEAD') &&
      (pathname === '/discover' || pathname.startsWith('/discover/') ||
       pathname === '/api/discover' || pathname.startsWith('/api/discover/'))) {
    return NextResponse.next();
  }

  // 放行登录与 me（前者校验凭据、后者报告登录态，均不暴露数据）。
  // 其余 /api/*（含 logout、所有数据 API）未登录一律 401。
  if (isApi && (pathname === '/api/auth/login' || pathname === '/api/auth/me')) {
    return NextResponse.next();
  }

  const loggedIn = await readSession(req);

  if (isApi) {
    if (!loggedIn) return NextResponse.json({ error: '未登录' }, { status: 401 });
    return NextResponse.next();
  }

  if (pathname === '/login') {
    return loggedIn ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  }

  if (!loggedIn) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = {
  // 只放行 Next 内部资源与 favicon；其余页面 / API（含 /api/img/...）全部过守卫。
  matcher: ['/((?!_next/|favicon.ico).*)'],
};
