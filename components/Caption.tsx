'use client';

import { useEffect, useState } from 'react';

export interface CaptionData {
  text: string;
  durationMs: number;
  token: number;
}

// 每次点按由父组件用新 token 作为 key 重新挂载，从而重置计时（连续点击重置计时）。
// 禅意字幕：墨色药丸 + 宣纸色字，浮在屏幕中上部，无卡片阴影。
export function Caption({ data }: { data: CaptionData }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), data.durationMs);
    return () => clearTimeout(timer);
  }, [data.durationMs, data.token]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[19%] z-50 flex justify-center px-4">
      <div
        className={`caption-float max-w-[90%] rounded-full bg-ink/90 px-7 py-3 text-center text-lg font-semibold tracking-[0.22em] text-bg transition-opacity duration-300 sm:text-xl ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {data.text}
      </div>
    </div>
  );
}
