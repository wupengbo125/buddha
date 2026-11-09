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
      <p
        className={`caption-float pointer-events-none transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {data.text}
      </p>
  );
}
