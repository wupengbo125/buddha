'use client';

// 「本次 / 今日·累计」展示：时长与次数两种念诵共用，避免各写一套。
export function ChantCounts(props: {
  /** 本次的数字（次数=声数，时长=已格式化时间）。 */
  main: string;
  today: string;
  total: string;
  /** 追加在「累计」后的量词，例如 ' 声'；时长模式传空串。 */
  unit?: string;
  paused?: boolean;
  /** 0-100 的进度；null/undefined 表示不显示进度条。 */
  progress?: number | null;
}) {
  const { main, today, total, unit = '', paused = false, progress = null } = props;
  return (
    <>
      <div className={`count-row ${paused ? 'count-row-paused' : ''}`} aria-label={`本次 ${main}${unit}，今日 ${today}${unit}，累计 ${total}${unit}`}>
        <span className="count-row-label">本次</span>
        <span className="count-row-num count-row-today">{main}</span>
        <span className="count-row-sub">今日 {today} · 累计 {total}{unit}</span>
      </div>
      {progress !== null && (
        <div className="count-progress" aria-label={`进度 ${Math.round(progress)}%`}>
          <div className="count-progress-track"><i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>
        </div>
      )}
    </>
  );
}
