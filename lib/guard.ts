// 受保护页面的服务端登录守卫（middleware 之外的二次校验）。仅 server component 使用。

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, OWNER_ID } from './auth';
import { sessionOwner } from './session';

export async function requirePageSession(): Promise<string> {
  // fail-closed：密码缺失 / token 无效一律跳登录。
  const owner = await sessionOwner((await cookies()).get(SESSION_COOKIE)?.value);
  if (!owner) redirect('/login');
  return owner;
}
