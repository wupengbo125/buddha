// 受保护页面的服务端登录守卫（middleware 之外的二次校验）。仅 server component 使用。

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from './auth';
import { verifyToken } from './session';

export async function requirePageSession(): Promise<void> {
  // verifyToken 内部 fail-closed：密码缺失 / 上下文异常一律 false，不会抛错吞掉 redirect。
  if (!(await verifyToken((await cookies()).get(SESSION_COOKIE)?.value))) {
    redirect('/login');
  }
}
