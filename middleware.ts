import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/session';

/** 未登录一律挡在门外：页面 302 /login，数据 API 401；已登录别再进 /login。 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

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
