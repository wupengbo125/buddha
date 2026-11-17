import { JOURNEY_HOURS } from './journey';

// QQ 等级：4 星 = 1 月，4 月 = 1 日，4 日 = 1 冠。走完一轮西游（437 小时）得 1 颗星。
export interface JourneyRank {
  /** 总星数（每一轮西游一颗）。 */
  starsTotal: number;
  crown: number;
  sun: number;
  moon: number;
  star: number;
}

export function journeyRank(seconds: number): JourneyRank {
  const stars = Math.floor(Math.max(0, seconds) / (JOURNEY_HOURS * 3600));
  const moons = Math.floor(stars / 4);
  const suns = Math.floor(moons / 4);
  const crowns = Math.floor(suns / 4);
  return { starsTotal: stars, crown: crowns, sun: suns % 4, moon: moons % 4, star: stars % 4 };
}
