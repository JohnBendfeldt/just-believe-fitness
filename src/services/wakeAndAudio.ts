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
  private voiceEl: HTMLAudioElement | null = null;
  private _enabled = true;

  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(val: boolean) {
    this._enabled = val;
    if (!val) {
      this.stopVoice();
    }
  }

  private ensureVoiceElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.voiceEl) {
      const el = new Audio();
      el.preload = 'auto';
      this.voiceEl = el;
    }
    return this.voiceEl;
  }

  /**
   * Call inside user click handlers (e.g. Start button) so mobile Safari / Chrome
   * unlock both Web Audio chimes and the persistent HTML5 MP3 coach player.
   */
  public unlock(): void {
    this.ensureContext();
    this.ensureVoiceElement();
  }

  public stopVoice(): void {
    if (!this.voiceEl) return;
    try {
      this.voiceEl.pause();
    } catch {
      // Ignore media pause errors in headless environments
    }
  }

  public playCoachClip(clipId: string, fallbackClipId?: string): void {
    if (!this._enabled) return;
    const el = this.ensureVoiceElement();
    if (!el) return;

    try {
      el.onerror = fallbackClipId
        ? () => {
            el.onerror = null;
            el.src = `/audio/coach/${fallbackClipId}.mp3`;
            const retry = el.play();
            if (retry && typeof retry.catch === 'function') {
              retry.catch(() => {});
            }
          }
        : null;

      el.src = `/audio/coach/${clipId}.mp3`;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch {
      // Never throw if browser autoplay policy blocks background audio
    }
  }

  public playSegmentCue(segmentId: string, cueType?: string): void {
    const fallback = cueType ? `cue-${cueType}` : undefined;
    this.playCoachClip(`seg-${segmentId}`, fallback);
  }

  private ensureContext(): AudioContext | null {
    if (!this._enabled || typeof window === 'undefined') return null;
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
