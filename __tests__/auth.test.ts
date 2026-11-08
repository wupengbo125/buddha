// 鉴权 / session / 去 device_id 的纯逻辑测试：不依赖 Cloudflare 上下文、不依赖网络。
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  OWNER_ID,
  OWNER_USERNAME,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  deriveSecret,
  signSession,
  timingSafeEqual,
  verifyCredentials,
  verifySession,
} from '@/lib/auth';
import { imageUrlFor } from '@/lib/image-access';

const PW = 'aB3-xY9!zQ7';

describe('密码校验（常量时间比较；用户名错 / 密码错同一个通用结果）', () => {
  it('正确账号 + 正确密码 → 通过', () => {
    expect(verifyCredentials(OWNER_USERNAME, PW, PW)).toBe(true);
  });

  it('密码错误 → 拒绝（对应登录 401）', () => {
    expect(verifyCredentials(OWNER_USERNAME, 'wrong', PW)).toBe(false);
  });

  it('用户名错误 → 拒绝，且与密码错误不区分（都 false）', () => {
    const badUser = verifyCredentials('someone-else', PW, PW);
    const badPass = verifyCredentials(OWNER_USERNAME, 'wrong', PW);
    expect(badUser).toBe(false);
    expect(badUser).toBe(badPass);
  });

  it('未配置密码（空）→ 一律拒绝', () => {
    expect(verifyCredentials(OWNER_USERNAME, PW, '')).toBe(false);
    expect(verifyCredentials(OWNER_USERNAME, '', '')).toBe(false);
  });

  it('timingSafeEqual：相等 true，内容 / 长度不同 false', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('session 签发 / 校验', () => {
  it('secret 由密码派生：同密码稳定、不同密码不同（不引入第二个 secret）', async () => {
    const a = await deriveSecret(PW);
    const b = await deriveSecret(PW);
    const c = await deriveSecret('other');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(c);
  });

  it('未登录（无 / 空 token）→ 校验不通过', async () => {
    const secret = await deriveSecret(PW);
    expect(await verifySession('', secret)).toBeNull();
    expect(await verifySession('not-a-jwt', secret)).toBeNull();
  });

  it('登录后签发的 token 可校验通过，sub 为账号', async () => {
    const secret = await deriveSecret(PW);
    const token = await signSession(secret);
    const payload = await verifySession(token, secret);
    expect(payload).toEqual({ sub: OWNER_USERNAME });
  });

  it('守卫判定：未登录 401 / 登录后放行（纯逻辑映射）', async () => {
    const secret = await deriveSecret(PW);
    const token = await signSession(secret);
    const gate = async (t: string | undefined) =>
      (t && (await verifySession(t, secret)) ? 200 : 401);
    expect(await gate(undefined)).toBe(401);
    expect(await gate('garbage')).toBe(401);
    expect(await gate(token)).toBe(200);
  });

  it('篡改 token / 错误密钥 / subject 不符 → null', async () => {
    const secret = await deriveSecret(PW);
    const token = await signSession(secret);
    expect(await verifySession(token.slice(0, -2) + 'xx', secret)).toBeNull();
    expect(await verifySession(token, await deriveSecret('other'))).toBeNull();

    const wrongSub = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('impostor')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(wrongSub, secret)).toBeNull();
  });

  it('过期 token → null', async () => {
    const secret = await deriveSecret(PW);
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(OWNER_USERNAME)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 100)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(expired, secret)).toBeNull();
  });

  it('cookie 名 / 有效期常量符合约定', () => {
    expect(SESSION_COOKIE).toBe('buddha_session');
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });
});

describe('去掉 device_id 后跨请求数据一致', () => {
  it('OWNER_ID 固定为 owner：不同请求写入归属同一账号一份数据', () => {
    expect(OWNER_ID).toBe('owner');
    // 模拟两次不同请求写入，归属 id 恒定，不随浏览器而变
    const writeA = OWNER_ID;
    const writeB = OWNER_ID;
    expect(writeA).toBe(writeB);
  });

  it('图片回显 URL 不含 device_id，同一 key 每次生成一致', () => {
    const key = 'c1/01HZX-avatar.png';
    expect(imageUrlFor(key)).toBe('/api/img/c1/01HZX-avatar.png');
    expect(imageUrlFor(key)).not.toContain('device_id');
    expect(imageUrlFor(key)).toBe(imageUrlFor(key));
  });

  it('两次独立请求用同一密码派生出同一密钥 → 跨请求签名校验一致', async () => {
    const s1 = await deriveSecret(PW);
    const s2 = await deriveSecret(PW);
    const token = await signSession(s1);
    expect(await verifySession(token, s2)).toEqual({ sub: OWNER_USERNAME });
  });
});
