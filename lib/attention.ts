// 专注提醒：念诵进行中随机 3–5 分钟出现一个点，点掉才继续；期间时间与次数冻结。
export const ATTENTION_MIN_MS = 3 * 60 * 1000;
export const ATTENTION_MAX_MS = 5 * 60 * 1000;

/** level = 分钟档位（1/2/3）；在 N 分钟的 80%–120% 之间随机。0 表示关闭。 */
export function attentionDelay(level: number, random: () => number = Math.random): number | null {
  if (!Number.isFinite(level) || level <= 0) return null;
  const base = Math.round(level) * 60 * 1000;
  const min = Math.round(base * 0.8);
  const max = Math.round(base * 1.2);
  return min + Math.floor(random() * (max - min));
}
