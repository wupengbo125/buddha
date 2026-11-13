'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleDot, SlidersHorizontal, BookOpen, Compass } from 'lucide-react';

const items = [
  { href: '/', label: '念佛', icon: CircleDot },
  { href: '/practices', label: '发愿', icon: BookOpen },
  { href: '/discover', label: '广场', icon: Compass },
  { href: '/settings', label: '设置', icon: SlidersHorizontal },
];

export function Nav() {
  const pathname = usePathname();
  const active = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/practices') return pathname === '/practices' || pathname === '/practice-collections' || pathname.startsWith('/counter/');
    if (href === '/discover') return pathname.startsWith('/discover');
    return pathname === href;
  };

  return (
    <nav className="bottom-nav" aria-label="主导航">
      <ul className="flex w-full">
        {items.map((it) => {
          const on = active(it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-current={on ? 'page' : undefined}
                className={`nav-item ${on ? 'nav-item-active' : ''}`}
              >
                <it.icon size={21} strokeWidth={on ? 2 : 1.6} />
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
