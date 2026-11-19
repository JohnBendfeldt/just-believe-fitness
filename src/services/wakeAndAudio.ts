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

interface NavigatorWithAudioSession extends Navigator {
  audioSession?: {
    type: string;
  };
}

/**
 * Synthesizes interval chimes and plays pre-rendered Coach MP3 cues strictly via the
 * Web Audio API (`AudioContext` + `AudioBufferSourceNode`) rather than `<audio>` elements.
 *
 * Why this matters on mobile:
 * `HTMLAudioElement.play()` claims exclusive OS Media-Session / audio focus on Android
 * Chrome and iOS Safari, pausing Spotify / Apple Music / podcasts! Web Audio mixes cleanly
 * over background music without stealing media focus, and setting `navigator.audioSession.type
 * = 'ambient'` (where supported) explicitly tells the OS to mix with other audio apps.
 *
 * Defaults to muted (`enabled = false`) as an opt-in feature.
 */
export class WorkoutAudioCue {
  private ctx: AudioContext | null = null;
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly inflightLoads = new Map<string, Promise<AudioBuffer | null>>();
  private playbackGeneration = 0;
  private _enabled = false;

  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(val: boolean) {
    this._enabled = val;
    if (!val) {
      this.stopVoice();
      if (this.ctx && this.ctx.state === 'running' && typeof this.ctx.suspend === 'function') {
        void this.ctx.suspend().catch(() => {});
      }
    }
  }

  private configureAmbientAudioSession(): void {
    if (typeof navigator === 'undefined') return;
    try {
      const nav = navigator as NavigatorWithAudioSession;
      if (nav.audioSession) {
        nav.audioSession.type = 'ambient';
      }
    } catch {
      // Optional W3C Audio Session API
    }
  }

  /**
   * Call inside user click handlers when audio is opted-in so mobile browsers
   * unlock the ambient Web Audio mixer without touching OS media-player focus.
   */
  public unlock(): void {
    if (!this._enabled) return;
    this.configureAmbientAudioSession();
    this.ensureContext();
  }

  public stopVoice(): void {
    this.playbackGeneration++;
    if (!this.activeVoiceSource) return;
    try {
      this.activeVoiceSource.stop();
      this.activeVoiceSource.disconnect();
    } catch {
      // Ignore if source already ended
    } finally {
      this.activeVoiceSource = null;
    }
  }

  private async loadCoachBuffer(ctx: AudioContext, clipId: string): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(clipId);
    if (cached) return cached;

    const existing = this.inflightLoads.get(clipId);
    if (existing) return existing;

    const loadPromise = (async (): Promise<AudioBuffer | null> => {
      try {
        const resp = await fetch(`/audio/coach/${clipId}.mp3`);
        if (!resp.ok) return null;
        const arrayBuf = await resp.arrayBuffer();
        if (typeof ctx.decodeAudioData !== 'function') return null;
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        this.bufferCache.set(clipId, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.inflightLoads.delete(clipId);
      }
    })();

    this.inflightLoads.set(clipId, loadPromise);
    return loadPromise;
  }

  public playCoachClip(clipId: string, fallbackClipId?: string): void {
    if (!this._enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || typeof ctx.createBufferSource !== 'function') return;

    const gen = ++this.playbackGeneration;
    void (async () => {
      let buffer = await this.loadCoachBuffer(ctx, clipId);
      if (!buffer && fallbackClipId) {
        buffer = await this.loadCoachBuffer(ctx, fallbackClipId);
      }
      if (!buffer || !this._enabled || gen !== this.playbackGeneration) return;

      try {
        if (this.activeVoiceSource) {
          try {
            this.activeVoiceSource.stop();
            this.activeVoiceSource.disconnect();
          } catch {
            // Already stopped
          }
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = 0.92;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.onended = () => {
          if (this.activeVoiceSource === source) {
            this.activeVoiceSource = null;
          }
        };
        this.activeVoiceSource = source;
        source.start(0);
      } catch {
        // Never throw if audio output device changes mid-ride
      }
    })();
  }

  public playSegmentCue(segmentId: string, cueType?: string): void {
    const fallback = cueType ? `cue-${cueType}` : undefined;
    this.playCoachClip(`seg-${segmentId}`, fallback);
  }

  private ensureContext(): AudioContext | null {
    if (!this._enabled || typeof window === 'undefined') return null;
    this.configureAmbientAudioSession();
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
