'use client';

import { useRef, useState } from 'react';

interface Ripple {
  id: number;
}

/** 念佛页主体：一个大的、视觉上像木鱼的点按区（内联 SVG 木鱼 + 按压缩放 + 淡出涟漪）。 */
export function WoodenFish({ onTap, disabled }: { onTap: () => void; disabled?: boolean }) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const seq = useRef(0);

  const handle = () => {
    if (disabled) return;
    onTap();
    const id = ++seq.current;
    setRipples((r) => [...r, { id }]);
    window.setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 680);
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      aria-label="敲木鱼，念一声"
      className="tap-press relative flex h-[min(62vw,248px)] w-[min(62vw,248px)] items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-bg disabled:opacity-50"
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="fish-ripple pointer-events-none absolute inset-0 rounded-full border-2 border-accent/40"
        />
      ))}
      <svg viewBox="0 0 240 240" className="h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="wood" cx="38%" cy="30%" r="78%">
            <stop offset="0%" stopColor="#b07d51" />
            <stop offset="52%" stopColor="#8a5a3b" />
            <stop offset="100%" stopColor="#5f3c25" />
          </radialGradient>
        </defs>

        {/* 木鱼主体：圆润木质，克制的一层径向质感（非背景渐变） */}
        <circle cx="120" cy="120" r="108" fill="url(#wood)" stroke="#5b3a24" strokeWidth="3" />
        <circle cx="120" cy="120" r="100" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />

        {/* 木纹：几道同心弧 */}
        <path d="M 38 120 A 82 82 0 0 1 202 120" fill="none" stroke="rgba(60,36,20,0.16)" strokeWidth="2" />
        <path d="M 50 120 A 70 70 0 0 1 190 120" fill="none" stroke="rgba(60,36,20,0.12)" strokeWidth="1.5" />
        <path d="M 30 150 A 90 90 0 0 0 210 150" fill="none" stroke="rgba(60,36,20,0.10)" strokeWidth="1.5" />

        {/* 柔和高光 */}
        <ellipse cx="88" cy="74" rx="34" ry="18" fill="rgba(255,255,255,0.12)" transform="rotate(-28 88 74)" />

        {/* 木鱼开口（C 形音孔） */}
        <path d="M 56 128 Q 120 176 184 128" fill="none" stroke="#3f2716" strokeWidth="16" strokeLinecap="round" opacity="0.85" />
        <path d="M 56 128 Q 120 176 184 128" fill="none" stroke="#6b4429" strokeWidth="9" strokeLinecap="round" />
        <path d="M 60 120 Q 120 162 180 120" fill="none" stroke="rgba(255,235,205,0.35)" strokeWidth="2" strokeLinecap="round" />

        {/* 鱼眼 / 旋涡：金色极少量点缀 */}
        <circle cx="120" cy="72" r="9" fill="#5b3a24" />
        <circle cx="120" cy="72" r="4" fill="#c9a45c" />
        <path d="M 96 92 Q 120 84 144 92" fill="none" stroke="rgba(60,36,20,0.18)" strokeWidth="2" strokeLinecap="round" />

        {/* 敲击点 */}
        <circle cx="120" cy="120" r="3" fill="rgba(201,164,92,0.55)" />
      </svg>
    </button>
  );
}
