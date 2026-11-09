export function shouldPlaySound(enabled: boolean): boolean {
  return enabled;
}

export function shouldVibrate(enabled: boolean, reducedMotion: boolean): boolean {
  return enabled && !reducedMotion;
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
let iosAudioUnlocked = false;

/** 首次用户手势内创建 AudioContext。任何异常静默收口到 null。 */
function getAudioContext(): AudioContext | null {
  try {
    const Ctor =
      typeof window === 'undefined'
        ? null
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

/** 极短静音 wav（44 字节 RIFF 头），用于 iOS PWA 音频会话解锁。 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/** iOS PWA 音频会话解锁：用户手势栈内播一次极短静音。模块级 bool 保证只执行一次。 */
function unlockIosAudioOnce(): void {
  if (iosAudioUnlocked) return;
  iosAudioUnlocked = true;
  try {
    const a = new Audio(SILENT_WAV);
    a.play().catch(() => {});
  } catch {
    /* 静默 */
  }
}

/** Web Audio 合成短促木鱼声：低频三角波快速下滑 + 极快衰减包络（约 110ms），无外部资源文件。 */
function scheduleWoodFish(ac: AudioContext): void {
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
}

export function playWoodFish(): void {
  try {
    unlockIosAudioOnce();
    const ac = getAudioContext();
    if (!ac) return;
    const state = ac.state as string;
    if (state === 'suspended' || state === 'interrupted') {
      // iOS PWA：suspended 时 currentTime 冻结，必须等 resume 后再排包络
      ac.resume()
        .then(() => scheduleWoodFish(ac))
        .catch(() => {});
    } else {
      scheduleWoodFish(ac);
    }
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
