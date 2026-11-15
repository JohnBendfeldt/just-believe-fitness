interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

export class ScreenWakeManager {
  private sentinel: WakeLockSentinelLike | null = null;
  private shouldHold = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.shouldHold) {
          void this.acquire();
        }
      });
    }
  }

  public async setActive(active: boolean): Promise<void> {
    this.shouldHold = active;
    if (active) {
      await this.acquire();
    } else {
      await this.release();
    }
  }

  private async acquire(): Promise<void> {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };
      if (nav.wakeLock && (!this.sentinel || this.sentinel.released)) {
        this.sentinel = await nav.wakeLock.request('screen');
      }
    } catch {
      // Ignore if unsupported or blocked by battery saver
    }
  }

  private async release(): Promise<void> {
    try {
      if (this.sentinel && !this.sentinel.released) {
        await this.sentinel.release();
      }
    } catch {
      // Ignore release errors
    } finally {
      this.sentinel = null;
    }
  }
}

export class WorkoutAudioCue {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public playTick(isGo = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 587.33, now);
    if (isGo) {
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.14);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(isGo ? 0.16 : 0.09, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (isGo ? 0.28 : 0.12));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (isGo ? 0.3 : 0.14));
  }
}
