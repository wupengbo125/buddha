'use client';

import { useRef, useState } from 'react';

interface Ripple {
  id: number;
}

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
      className="wooden-fish"
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="fish-ripple"
        />
      ))}
      <img src="/wooden-fish.png" width={720} height={720} alt="" draggable={false} />
    </button>
  );
}
