'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: '念佛' },
  { href: '/counters', label: '添加' },
  { href: '/settings', label: '设置' },
];

/** 五个受保护页面共用：移动端底部 / 桌面顶部。登录页不渲染本组件。 */
export function Nav() {
  const pathname = usePathname();
  const active = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/counters') return pathname === '/counters' || pathname.startsWith('/counter/');
    return pathname === href;
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur md:static md:border-b md:border-t-0 md:bg-transparent">
      <ul className="mx-auto flex w-full max-w-md md:justify-center md:gap-3 md:py-2">
        {items.map((it) => {
          const on = active(it.href);
          return (
            <li key={it.href} className="flex-1 md:flex-none">
              <Link
                href={it.href}
                aria-current={on ? 'page' : undefined}
                className={`tap-press flex h-14 items-center justify-center text-[15px] tracking-wide md:h-9 md:rounded-full md:px-8 ${
                  on ? 'text-accent md:bg-accent-soft' : 'text-muted'
                }`}
              >
                <span className="relative">
                  {it.label}
                  {on && (
                    <span className="absolute -bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent md:hidden" />
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
