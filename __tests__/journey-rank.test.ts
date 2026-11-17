import { describe, expect, it } from 'vitest';
import { JOURNEY_HOURS } from '@/lib/journey';
import { journeyRank } from '@/lib/journey-rank';

const round = JOURNEY_HOURS * 3600;

describe('西游等级图标', () => {
  it('每完成一轮得一颗星', () => {
    expect(journeyRank(round - 1).starsTotal).toBe(0);
    expect(journeyRank(round).starsTotal).toBe(1);
    expect(journeyRank(round * 3 + 100).starsTotal).toBe(3);
  });

  it('4 星 = 1 月，4 月 = 1 日，4 日 = 1 冠', () => {
    expect(journeyRank(round * 4)).toMatchObject({ moon: 1, star: 0 });
    expect(journeyRank(round * 15)).toMatchObject({ moon: 3, star: 3 });
    expect(journeyRank(round * 16)).toMatchObject({ sun: 1, moon: 0, star: 0 });
    expect(journeyRank(round * 64)).toMatchObject({ crown: 1, sun: 0, moon: 0, star: 0 });
    expect(journeyRank(round * 67)).toMatchObject({ crown: 1, moon: 0, star: 3 });
  });
});
