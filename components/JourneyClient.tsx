'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Crown, Lock, Moon, Sparkles, Star, Sun, X } from 'lucide-react';
import { JOURNEY_HOURS, JOURNEY_LEVELS, JOURNEY_TARGETS, journeyState, hm } from '@/lib/journey';
import { journeyRank } from '@/lib/journey-rank';
import type { JourneyStats } from '@/lib/journey-stats';
import styles from './JourneyPages.module.css';

export function JourneyClient({ stats }: { stats: JourneyStats }) {
  const state = journeyState(stats.seconds);
  const rank = journeyRank(stats.seconds);
  const [celebrating, setCelebrating] = useState<number | null>(null);

  useEffect(() => {
    let previous = 0;
    try { previous = Number(window.localStorage.getItem('buddha:journey-cleared') ?? '0'); } catch {}
    if (state.cleared > previous) {
      try { window.localStorage.setItem('buddha:journey-cleared', String(state.cleared)); } catch {}
      setCelebrating(state.cleared);
    } else if (previous === 0 && state.cleared > 0) {
      try { window.localStorage.setItem('buddha:journey-cleared', String(state.cleared)); } catch {}
    }
  }, [state.cleared]);

  const clearedLevel = celebrating ? JOURNEY_LEVELS[celebrating - 1] : null;
  const progress = state.completed ? 100 : Math.min(100, (state.currentDone / Math.max(1, state.currentTarget)) * 100);
  const remain = state.completed ? 0 : Math.max(0, state.nextAt - state.seconds);

  return (
    <main className={`page ${styles.root}`}>
      <header className="page-header">
        <div><p className="eyebrow">修行里程</p><h1 className="page-title">西游取经</h1></div>
        <Link href="/practices" className={styles.link}>我的发愿</Link>
      </header>

      <div className={styles.rank} aria-label="修行等级">
        {Array.from({ length: rank.crown }, (_, index) => <Crown key={`crown-${index}`} size={18} aria-hidden />)}
        {Array.from({ length: rank.sun }, (_, index) => <Sun key={`sun-${index}`} size={18} aria-hidden />)}
        {Array.from({ length: rank.moon }, (_, index) => <Moon key={`moon-${index}`} size={18} aria-hidden />)}
        {Array.from({ length: rank.star }, (_, index) => <Star key={`star-${index}`} size={18} aria-hidden />)}
      </div>

      {state.completed ? <section className={styles.hero}>
        <img className={styles.heroImage} src={JOURNEY_LEVELS[JOURNEY_LEVELS.length - 1].image} alt="" />
        <div className={styles.heroBody}>
          <p className={styles.heroKicker}>功德圆满</p>
          <h2 className={styles.heroTitle}>灵山真经已取，普度东土</h2>
          <p className={styles.heroMeta}>全程 {JOURNEY_HOURS} 小时 · 四十关皆过</p>
        </div>
      </section> : <section className={styles.hero}>
        <img className={styles.heroImage} src={state.current!.image} alt="" />
        <div className={styles.heroBody}>
          <p className={styles.heroKicker}>第 {state.current!.id} 关 / 40</p>
          <h2 className={styles.heroTitle}>{state.current!.name}</h2>
          <p className={styles.heroMeta}>{state.current!.summary}</p>
        </div>
      </section>}

      {!state.completed && <>
        <div className={styles.progressBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label={`第 ${state.current!.id} 关进度`}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.progressRow}>
          <span>本关 {hm(state.currentDone)} / {hm(state.currentTarget)}</span>
          <span>{hrsPercent(state)}</span>
        </div>
        <p className={styles.remain}>累计修行 {hm(state.seconds)} · 距「{JOURNEY_LEVELS[state.cleared]?.name}」还差 {hm(remain)}</p>
      </>}

      <section className={styles.stats} aria-label="修行统计">
        <div><span>本周</span><b>{hm(stats.week)}</b></div>
        <div><span>历史</span><b>{hm(stats.seconds)}</b></div>
        <div><span>已通关</span><b>{state.cleared} / 40</b></div>
      </section>

      <section aria-labelledby="route-title">
        <h2 id="route-title" className={styles.sectionTitle}>取经路线</h2>
        <ol className={styles.route}>
          {JOURNEY_LEVELS.map((level, index) => {
            const done = index < state.cleared;
            const current = index === state.cleared && !state.completed;
            return <li key={level.id} className={`${styles.level} ${done ? styles.done : ''} ${current ? styles.current : ''}`}>
              <span className={styles.levelIndex}>{String(level.id).padStart(2, '0')}</span>
              <img className={styles.levelThumb} src={level.image} alt="" loading="lazy" />
              <div className={styles.grow}>
                <h3 className={styles.levelName}>{level.name}</h3>
                <p className={styles.levelSummary}>{level.summary}</p>
                <p className={styles.levelMeta}>{done ? '已圆满' : current ? `进行中 · 差 ${hm(Math.max(0, JOURNEY_TARGETS[index] - state.seconds))}` : `本关 ${level.hours} 小时`}</p>
              </div>
              {done ? <Check size={17} className={styles.stateIcon} /> : current ? <Sparkles size={17} className={styles.stateIcon} /> : <Lock size={15} className={styles.lockIcon} />}
            </li>;
          })}
        </ol>
      </section>

      {clearedLevel && <div className={styles.overlay} onClick={() => setCelebrating(null)} role="dialog" aria-modal="true" aria-label="通关">
        <div className={styles.celebration} onClick={(event) => event.stopPropagation()}>
          <button type="button" className={styles.close} aria-label="关闭" onClick={() => setCelebrating(null)}><X size={18} /></button>
          <img className={styles.celebrationImage} src={clearedLevel.image} alt="" />
          <p className={styles.heroKicker}>第 {clearedLevel.id} 关已圆满</p>
          <h2 className={styles.celebrationTitle}>{clearedLevel.name}</h2>
          {state.completed
            ? <p className={styles.celebrationText}>真经已取，功德圆满。</p>
            : <p className={styles.celebrationText}>下一关：{JOURNEY_LEVELS[clearedLevel.id]?.name} · {JOURNEY_LEVELS[clearedLevel.id]?.hours} 小时</p>}
          <button type="button" className="primary-button" onClick={() => setCelebrating(null)}>继续</button>
        </div>
      </div>}
    </main>
  );
}

function hrsPercent(state: ReturnType<typeof journeyState>): string {
  const done = Math.round((state.currentDone / Math.max(1, state.currentTarget)) * 100);
  return `${done}%`;
}
