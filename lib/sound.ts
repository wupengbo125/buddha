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
let woodenFishBuffer: AudioBuffer | null = null;
let iosAudioUnlocked = false;
let audioDataPromise: Promise<ArrayBuffer | null> | null =
  typeof window !== 'undefined'
    ? fetch('/wooden-fish.wav')
        .then((r) => r.arrayBuffer() as Promise<ArrayBuffer>)
        .catch(() => null)
    : null;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && audioCtx) {
      try { audioCtx.close(); } catch {}
      audioCtx = null;
    }
  });
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

/** 首次用户手势内创建 AudioContext。任何异常静默收口到 null。 */
function getAudioContext(): AudioContext | null {
  try {
    const Ctor =
      typeof window === 'undefined'
        ? null
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (audioCtx && ((audioCtx.state as string) === 'interrupted' || audioCtx.state === 'closed')) {
      try { audioCtx.close(); } catch {}
      audioCtx = null;
    }
    if (!audioCtx) {
      audioCtx = new Ctor();
      const p = audioDataPromise ?? fetch('/wooden-fish.wav').then((r) => r.arrayBuffer() as Promise<ArrayBuffer>);
      p.then((buf) => {
        if (buf && audioCtx) {
          return audioCtx.decodeAudioData(buf.slice(0));
        }
      })
        .then((decoded) => {
          if (decoded) woodenFishBuffer = decoded;
        })
        .catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** 播放预加载的木鱼音频 buffer。 */
function playBuffer(ac: AudioContext): void {
  if (woodenFishBuffer) {
    try {
      const src = ac.createBufferSource();
      src.buffer = woodenFishBuffer;
      src.connect(ac.destination);
      src.start();
      return;
    } catch {
      woodenFishBuffer = null;
    }
  }
  if (audioDataPromise) {
    audioDataPromise
      .then((buf) => buf && ac.decodeAudioData(buf.slice(0)))
      .then((decoded) => {
        if (!decoded || ac.state === 'closed') return;
        woodenFishBuffer = decoded;
        const src = ac.createBufferSource();
        src.buffer = decoded;
        src.connect(ac.destination);
        src.start();
      })
      .catch(() => {});
  }
}

export function playWoodFish(): void {
  try {
    unlockIosAudioOnce();
    const ac = getAudioContext();
    if (!ac) return;
    if (ac.state === 'suspended') {
      ac.resume().catch(() => {});
    }
    playBuffer(ac);
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
