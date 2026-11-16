import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ATHLETE_PROFILE,
  ZONE_PALETTE,
  computeNormalizedPower,
  computeSegmentedGaugeProgress,
  computeWattsPerKg,
  cueDisplayLabel,
  estimateIndoorSpeedMps,
  estimateKcalPerSecond,
  feetInchesToCm,
  formatDuration,
  formatHeightImperial,
  getCadenceZones,
  getHrZones,
  getPowerZones,
  getResistanceZones,
  lbsToKg,
  metersToMiles,
  mpsToMph,
  resolveHeadlineEffortZone,
  resolveZone,
} from '../utils/zones';
import {
  calculateEchelonWatts,
  suggestEx3Resistance,
} from '../services/ble/echelonPowerCurve';
import {
  WORKOUT_TEMPLATES,
  getSegmentTargetsForAthlete,
  getTotalWorkoutDurationSec,
} from '../data/workouts';
import {
  enterBrowserFullscreen,
  exitBrowserFullscreen,
  isBrowserFullscreen,
  toggleBrowserFullscreen,
} from '../utils/fullscreen';
import { buildYouTubeEmbedSrc } from '../utils/youtube';
import type { AthleteProfile } from '../types/fitness';

describe('Safe Generic Starter Athlete Defaults & Unit Conversions', () => {
  it('starts with safe, conservative recreational defaults (Rider, 5\'8", 165#, 150W FTP, 180 Max HR) so new riders do not overexert', () => {
    expect(DEFAULT_ATHLETE_PROFILE.name).toBe('Rider');
    expect(DEFAULT_ATHLETE_PROFILE.heightFeet).toBe(5);
    expect(DEFAULT_ATHLETE_PROFILE.heightInches).toBe(8);
    expect(DEFAULT_ATHLETE_PROFILE.weightLbs).toBe(165);
    expect(DEFAULT_ATHLETE_PROFILE.ftpWatts).toBe(150);
    expect(DEFAULT_ATHLETE_PROFILE.maxHrBpm).toBe(180);
    expect(DEFAULT_ATHLETE_PROFILE.restingHrBpm).toBe(65);

    const starterWkg = computeWattsPerKg(
      DEFAULT_ATHLETE_PROFILE.ftpWatts,
      DEFAULT_ATHLETE_PROFILE.weightLbs
    );
    // ~2.00 W/kg is an approachable recreational indoor cycling threshold
    expect(starterWkg).toBeGreaterThan(1.95);
    expect(starterWkg).toBeLessThan(2.1);
  });

  it('converts height, weight, distance, speed, and durations accurately', () => {
    expect(formatHeightImperial(5, 8)).toBe('5\'8"');
    expect(feetInchesToCm(5, 8)).toBeCloseTo(172.72, 2);
    expect(lbsToKg(165)).toBeCloseTo(74.84, 1);
    expect(metersToMiles(1609.344)).toBeCloseTo(1.0, 4);
    expect(mpsToMph(10)).toBeCloseTo(22.369, 2);
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(95)).toBe('01:35');
    expect(formatDuration(3665)).toBe('1:01:05');
  });

  it('scales Power, HR, Cadence, and EX-3 Resistance 5-zone models dynamically for both starter and advanced riders', () => {
    // Starter 150W FTP & 180 Max HR
    const starterPower = getPowerZones(150);
    expect(starterPower).toHaveLength(5);
    expect(starterPower[3].minValue).toBe(137); // 91% of 150W
    expect(starterPower[4].minValue).toBe(159); // 106% of 150W
    expect(resolveZone(150, starterPower).zone).toBe(4);
    expect(resolveZone(165, starterPower).zone).toBe(5);

    const starterHr = getHrZones(180);
    expect(starterHr).toHaveLength(5);
    expect(starterHr[3].minValue).toBe(151); // 84% of 180 bpm
    expect(starterHr[4].minValue).toBe(166); // 92% of 180 bpm
    expect(resolveZone(154, starterHr).zone).toBe(4);

    // Advanced custom profile (e.g. 260W FTP, 195 Max HR)
    const customPower = getPowerZones(260);
    expect(customPower[3].minValue).toBe(237);
    expect(resolveZone(250, customPower).zone).toBe(4);

    const cadZones = getCadenceZones();
    expect(resolveZone(48, cadZones).zone).toBe(1);
    expect(resolveZone(62, cadZones).zone).toBe(2);
    expect(resolveZone(85, cadZones).zone).toBe(3);
    expect(resolveZone(96, cadZones).zone).toBe(4);
    expect(resolveZone(110, cadZones).zone).toBe(5);

    const resZones = getResistanceZones();
    expect(resolveZone(6, resZones).zone).toBe(1);
    expect(resolveZone(18, resZones).zone).toBe(3);
    expect(resolveZone(24, resZones).zone).toBe(4);
    expect(resolveZone(30, resZones).zone).toBe(5);
  });

  it('computes monotonic speedometer needle progress and resolves headline studio zone (HR vs Power surge)', () => {
    const pwrZones = getPowerZones(150);
    expect(computeSegmentedGaugeProgress(0, pwrZones)).toBe(0);
    const p1 = computeSegmentedGaugeProgress(60, pwrZones);
    const p3 = computeSegmentedGaugeProgress(125, pwrZones);
    const p5 = computeSegmentedGaugeProgress(180, pwrZones);
    expect(p3).toBeGreaterThan(p1);
    expect(p5).toBeGreaterThan(p3);
    expect(p5).toBeLessThanOrEqual(99.2);

    // Without HR sensor, Power drives headline zone
    const powerOnly = resolveHeadlineEffortZone(0, 145, DEFAULT_ATHLETE_PROFILE);
    expect(powerOnly.driver).toBe('power');
    expect(powerOnly.zoneDef.zone).toBe(4);

    // Steady state with HR: HR drives headline zone
    const steadyHr = resolveHeadlineEffortZone(135, 120, DEFAULT_ATHLETE_PROFILE);
    expect(steadyHr.driver).toBe('hr');
    expect(steadyHr.zoneDef.zone).toBe(3);

    // Immediate All-Out power surge while HR lags in Zone 2: Power surge takes headline immediately
    const sprintSurge = resolveHeadlineEffortZone(120, 195, DEFAULT_ATHLETE_PROFILE);
    expect(sprintSurge.driver).toBe('power');
    expect(sprintSurge.zoneDef.zone).toBe(5);
  });

  it('computes Normalized Power, aerodynamic virtual speed, and calorie burn rates', () => {
    expect(computeNormalizedPower([])).toBe(0);
    expect(computeNormalizedPower([100, 150, 200])).toBe(150);
    const steady160 = Array.from({ length: 60 }, () => 160);
    expect(computeNormalizedPower(steady160)).toBe(160);

    const speedZero = estimateIndoorSpeedMps(0, DEFAULT_ATHLETE_PROFILE);
    expect(speedZero).toBe(0);
    const speed150W = mpsToMph(estimateIndoorSpeedMps(150, DEFAULT_ATHLETE_PROFILE));
    expect(speed150W).toBeGreaterThan(17);
    expect(speed150W).toBeLessThan(23);

    // Mechanical watts path vs HR-only fallback vs rest
    expect(estimateKcalPerSecond(0, 60, DEFAULT_ATHLETE_PROFILE)).toBe(0);
    expect(estimateKcalPerSecond(150, 150, DEFAULT_ATHLETE_PROFILE)).toBeGreaterThan(0.14);
    expect(estimateKcalPerSecond(0, 150, DEFAULT_ATHLETE_PROFILE)).toBeGreaterThan(0.08);
  });
});

describe('Echelon EX-3 Power Curves & Guided Workout Templates', () => {
  it('calculates monotonic watts across both EX-3 Vector and Echelon Freeride curves', () => {
    expect(calculateEchelonWatts(20, 0, 'ex3-vector')).toBe(0);
    expect(calculateEchelonWatts(20, 0, 'echelon-official')).toBe(0);

    const low = calculateEchelonWatts(16, 80, 'ex3-vector');
    const high = calculateEchelonWatts(24, 90, 'ex3-vector');
    expect(high).toBeGreaterThan(low);

    // Watt gain scales output proportionally
    const scaled = calculateEchelonWatts(20, 85, 'ex3-vector', 1.1);
    const unscaled = calculateEchelonWatts(20, 85, 'ex3-vector', 1.0);
    expect(scaled).toBeGreaterThan(unscaled);

    const gear = suggestEx3Resistance(150, 88, 'ex3-vector', 1.0);
    expect(gear).toBeGreaterThanOrEqual(16);
    expect(gear).toBeLessThanOrEqual(25);
  });

  it('validates all workout templates, durations, cues, and dynamic segment targets without prohibited terms', () => {
    expect(WORKOUT_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    const bannedTerms = ['ot' + 'f', 'orange' + 'theory', 'sp' + 'lat', 'sp' + 'lats'];
    const bannedPattern = new RegExp(`\\b(${bannedTerms.join('|')})\\b`, 'i');

    for (const zId of [1, 2, 3, 4, 5] as const) {
      expect(ZONE_PALETTE[zId].name).not.toMatch(bannedPattern);
      expect(ZONE_PALETTE[zId].stageLabel).not.toMatch(bannedPattern);
    }

    for (const cue of ['warmup', 'base', 'push', 'all-out', 'recovery'] as const) {
      expect(cueDisplayLabel(cue).length).toBeGreaterThan(3);
    }

    for (const tpl of WORKOUT_TEMPLATES) {
      expect(tpl.name).not.toMatch(bannedPattern);
      expect(tpl.subtitle).not.toMatch(bannedPattern);

      if (tpl.isFreeRide) {
        expect(getTotalWorkoutDurationSec(tpl)).toBe(0);
      } else {
        expect(getTotalWorkoutDurationSec(tpl)).toBeGreaterThanOrEqual(1200);
        for (const seg of tpl.segments) {
          expect(seg.durationSec).toBeGreaterThan(0);
          expect(seg.coachingNote).not.toMatch(bannedPattern);
          const starterTargets = getSegmentTargetsForAthlete(seg, DEFAULT_ATHLETE_PROFILE);
          expect(starterTargets.maxWatts).toBeGreaterThanOrEqual(starterTargets.minWatts);
          expect(starterTargets.suggestedResistanceLow).toBeGreaterThanOrEqual(1);
          expect(starterTargets.suggestedResistanceHigh).toBeLessThanOrEqual(32);

          const strongerAthlete: AthleteProfile = { ...DEFAULT_ATHLETE_PROFILE, ftpWatts: 260 };
          const strongerTargets = getSegmentTargetsForAthlete(seg, strongerAthlete);
          expect(strongerTargets.midWatts).toBeGreaterThan(starterTargets.midWatts);
        }
      }
    }
  });
});

describe('Fullscreen & YouTube Utilities', () => {
  it('handles standard and webkit fullscreen enter, exit, and toggle gracefully', async () => {
    let activeFsEl: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => activeFsEl,
    });
    document.documentElement.requestFullscreen = vi.fn(async () => {
      activeFsEl = document.documentElement;
    });
    document.exitFullscreen = vi.fn(async () => {
      activeFsEl = null;
    });

    expect(isBrowserFullscreen()).toBe(false);
    await expect(enterBrowserFullscreen()).resolves.toBe(true);
    expect(isBrowserFullscreen()).toBe(true);

    await expect(toggleBrowserFullscreen()).resolves.toBe(false);
    expect(isBrowserFullscreen()).toBe(false);

    await exitBrowserFullscreen(); // No-op when already exited
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('parses watch, short, shorts, embed, live, playlist, and raw 11-char YouTube video identifiers', () => {
    expect(buildYouTubeEmbedSrc('dQw4w9WgXcQ')).toContain('youtube.com/embed/dQw4w9WgXcQ');
    expect(buildYouTubeEmbedSrc('https://www.youtube.com/watch?v=BHACKCNDMW8')).toContain(
      'youtube.com/embed/BHACKCNDMW8'
    );
    expect(buildYouTubeEmbedSrc('https://youtu.be/eKFTSSKCzWA')).toContain(
      'youtube.com/embed/eKFTSSKCzWA'
    );
    expect(buildYouTubeEmbedSrc('https://www.youtube.com/shorts/4xDzrJKXOOY')).toContain(
      'youtube.com/embed/4xDzrJKXOOY'
    );
    expect(buildYouTubeEmbedSrc('https://www.youtube.com/live/4xDzrJKXOOY')).toContain(
      'youtube.com/embed/4xDzrJKXOOY'
    );
    expect(
      buildYouTubeEmbedSrc('https://www.youtube.com/playlist?list=PL1234567890ABCDEF')
    ).toContain('videoseries?list=PL1234567890ABCDEF');
    expect(buildYouTubeEmbedSrc('')).toBeNull();
    expect(buildYouTubeEmbedSrc('not-a-valid-url')).toBeNull();
  });
});
