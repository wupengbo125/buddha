// 专注提醒：念诵进行中随机 3–5 分钟出现一个点，点掉才继续；期间时间与次数冻结。
export const ATTENTION_MIN_MS = 3 * 60 * 1000;
export const ATTENTION_MAX_MS = 5 * 60 * 1000;

export function attentionDelay(random: () => number = Math.random): number {
  return ATTENTION_MIN_MS + Math.floor(random() * (ATTENTION_MAX_MS - ATTENTION_MIN_MS));
}
