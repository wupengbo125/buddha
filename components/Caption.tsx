'use client';

import { useEffect, useState } from 'react';

export interface CaptionData {
  text: string;
  durationMs: number;
  token: number;
}

// 每次点按由父组件用新 token 作为 key 重新挂载，从而重置计时（连续点击重置计时）。
export function Caption({ data }: { data: CaptionData }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), data.durationMs);
    return () => clearTimeout(timer);
  }, [data.durationMs, data.token]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[18%] z-50 flex justify-center px-4">
      <div
        className={`caption-float max-w-[90%] rounded-2xl bg-ink/85 px-6 py-3 text-center text-xl font-medium text-[#fdf8ec] shadow-lg transition-opacity duration-300 sm:text-2xl ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {data.text}
      </div>
    </div>
  );
}
