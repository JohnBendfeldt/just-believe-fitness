import { describe, expect, it, vi } from 'vitest';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  canvasToPngBlob,
  renderRideShareCanvas,
} from '../services/shareCardRenderer';
import { renderTelemetryHudCanvas } from '../services/pipHud';
import { ScreenWakeManager, WorkoutAudioCue } from '../services/wakeAndAudio';
import { DEFAULT_ATHLETE_PROFILE } from '../utils/zones';
import { makeSampleRide, makeSampleTelemetry } from '../test/fixtures';
import { getRecordedCanvasCalls } from '../test/setup';

describe('Post-Ride Photo & Stat Overlay Canvas Compositor (1080×1350)', () => {
  it('renders Studio Dark artwork and all 3 overlay styles (timeline, rings, minimal) with custom title & notes', async () => {
    const canvas = document.createElement('canvas');
    const ride = makeSampleRide({ burnPoints: 18 });

    for (const style of ['timeline', 'rings', 'minimal'] as const) {
      renderRideShareCanvas(canvas, {
        ride,
        photo: null,
        overlayStyle: style,
        customTitle: 'Saturday Power Spin',
        customCaption: 'Zero paywalls, pure watts!',
      });

      expect(canvas.width).toBe(SHARE_CARD_WIDTH);
      expect(canvas.height).toBe(SHARE_CARD_HEIGHT);

      const textCalls = getRecordedCanvasCalls(canvas)
        .filter((c) => c.op === 'fillText')
        .map((c) => String(c.args[0]));

      expect(textCalls.some((t) => t.includes('SATURDAY POWER SPIN'))).toBe(true);
      expect(textCalls.some((t) => t.includes('Zero paywalls, pure watts!'))).toBe(true);
      expect(textCalls.some((t) => t.includes('18 BURN PTS'))).toBe(true);
    }

    // Regression guard: 0 Burn Points omits the top-right BURN PTS pill across all 3 styles
    const zeroBurnRide = makeSampleRide({ burnPoints: 0 });
    for (const style of ['timeline', 'rings', 'minimal'] as const) {
      const zeroCanvas = document.createElement('canvas');
      renderRideShareCanvas(zeroCanvas, {
        ride: zeroBurnRide,
        photo: null,
        overlayStyle: style,
      });
      const zeroTexts = getRecordedCanvasCalls(zeroCanvas)
        .filter((c) => c.op === 'fillText')
        .map((c) => String(c.args[0]));
      expect(zeroTexts.some((t) => t.includes('BURN PTS'))).toBe(false);
    }

    const blob = await canvasToPngBlob(canvas);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('cover-crops user Camera / Selfie / Gallery photos with readability scrims', () => {
    const canvas = document.createElement('canvas');
    const img = new Image();
    Object.defineProperty(img, 'naturalWidth', { value: 1920 });
    Object.defineProperty(img, 'naturalHeight', { value: 1080 });

    renderRideShareCanvas(canvas, {
      ride: makeSampleRide(),
      photo: img,
      overlayStyle: 'rings',
    });

    const calls = getRecordedCanvasCalls(canvas);
    expect(calls.some((c) => c.op === 'drawImage')).toBe(true);
  });
});

describe('Floating PiP Telemetry HUD Canvas & Wake/Audio Services', () => {
  it('renders 640×360 floating PiP HUD in both Speedometer Rings and Classic Bars modes with universal BLE HR label', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;

    renderTelemetryHudCanvas(canvas, {
      telemetry: makeSampleTelemetry({ heartRateBpm: 0, hrName: 'Wahoo TICKR' }),
      profile: DEFAULT_ATHLETE_PROFILE,
      elapsedSec: 425,
      burnPoints: 7,
      gaugeMode: 'rings',
      segmentLabel: '2-Min Push Pace',
      segmentRemainingSec: 45,
    });

    const ringTexts = getRecordedCanvasCalls(canvas)
      .filter((c) => c.op === 'fillText')
      .map((c) => String(c.args[0]));
    expect(ringTexts.some((t) => t.includes('WAHOO TICKR READY'))).toBe(true);
    expect(ringTexts.some((t) => t.includes('00:45 LEFT'))).toBe(true);

    renderTelemetryHudCanvas(canvas, {
      telemetry: makeSampleTelemetry(),
      profile: DEFAULT_ATHLETE_PROFILE,
      elapsedSec: 600,
      burnPoints: 9,
      gaugeMode: 'bars',
    });
    const barCalls = getRecordedCanvasCalls(canvas);
    expect(barCalls.length).toBeGreaterThan(20);
  });

  it('acquires and releases Screen Wake Lock and synthesizes Web Audio interval cues', async () => {
    const releaseSpy = vi.fn(async () => {});
    const requestSpy = vi.fn(async () => ({
      released: false,
      release: releaseSpy,
    }));

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: requestSpy },
    });

    const wake = new ScreenWakeManager();
    await wake.setActive(true);
    expect(requestSpy).toHaveBeenCalledWith('screen');
    await wake.setActive(false);
    expect(releaseSpy).toHaveBeenCalledTimes(1);

    // Web Audio cue synthesis
    const startSpy = vi.fn();
    const stopSpy = vi.fn();
    class MockAudioContext {
      public state = 'running';
      public currentTime = 0;
      public destination = {};
      public resume = vi.fn(async () => {});
      public createOscillator() {
        return {
          type: 'sine',
          frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          start: startSpy,
          stop: stopSpy,
        };
      }
      public createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }
    }

    (window as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
    const cue = new WorkoutAudioCue();
    cue.playTick(false);
    cue.playTick(true);
    expect(startSpy).toHaveBeenCalledTimes(2);

    cue.enabled = false;
    cue.playTick(true);
    expect(startSpy).toHaveBeenCalledTimes(2); // Muted no-op

    // Pre-rendered Coach MP3 playback & instant mute
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    cue.enabled = true;
    cue.unlock();
    cue.playSegmentCue('w1', 'warmup');
    expect(playSpy).toHaveBeenCalledTimes(1);

    cue.enabled = false;
    expect(pauseSpy).toHaveBeenCalled();
    cue.playCoachClip('burn-first');
    expect(playSpy).toHaveBeenCalledTimes(1); // Muted no-op
  });
});
