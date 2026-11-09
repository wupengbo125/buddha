// 点按反馈：Web Audio 合成短木鱼声（无资源文件）+ 两级开关判定 + Android 震动渐进增强。
// 音效只由「全局总开关 × 每计数器 sound_enabled」决定；prefers-reduced-motion 只抑制
// 视觉涟漪 / 震动这类 motion 反馈，不影响音效（音效非 motion）。

/**
 * 两级开关判定：总开关 off → 全静音；总开关 on → 看各计数器自己的开关。
 * reducedMotion 不参与音效结果（音效非 motion 反馈），仅为便于集中判定而保留参数。
 */
export function shouldPlaySound(globalEnabled: boolean, counterEnabled: boolean, reducedMotion = false): boolean {
  void reducedMotion;
  return globalEnabled && counterEnabled;
}

/** 震动是 motion 类反馈：两级开关都开且未要求减少动态效果时才触发。 */
export function shouldVibrate(globalEnabled: boolean, counterEnabled: boolean, reducedMotion: boolean): boolean {
  return shouldPlaySound(globalEnabled, counterEnabled) && !reducedMotion;
}

/** 读取 prefers-reduced-motion；node 测试环境 / 不支持时返回 false。 */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

let audioCtx: AudioContext | null = null;

/** 首次用户手势内创建 / 恢复 AudioContext（iOS 要求手势内 resume）。任何异常静默收口到 null。 */
function getAudioContext(): AudioContext | null {
  try {
    const Ctor =
      typeof window === 'undefined'
        ? null
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Web Audio 合成短促木鱼声：低频三角波快速下滑 + 极快衰减包络（约 110ms），无外部资源文件。 */
export function playWoodFish(): void {
  try {
    const ac = getAudioContext();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.004); // 极短起音
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11); // 木质敲击快速衰减
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(now);
    osc.stop(now + 0.12);
  } catch {
    /* 任何异常静默失败，绝不阻塞计数 */
  }
}

/** Android navigator.vibrate 短脉冲；iOS / 不支持 / reduced-motion 静默 no-op。 */
export function vibrateShort(reducedMotion = false): void {
  if (reducedMotion) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12);
    }
  } catch {
    /* 静默 */
  }
}
