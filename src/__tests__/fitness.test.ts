import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ATHLETE_PROFILE,
  METERS_PER_MILE,
  ZONE_PALETTE,
  computeBestWindowAvgWatts,
  computeNormalizedPower,
  computeSegmentedGaugeProgress,
  computeWattsPerKg,
  cueDisplayLabel,
  estimateDistanceEtaSec,
  estimateIndoorSpeedMps,
  estimateKcalPerSecond,
  evaluateRideFtpResult,
  feetInchesToCm,
  formatBikeGearBadge,
  formatDistanceTarget,
  formatDistanceValue,
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
  resolveEffectivePowerCurve,
  suggestBikeResistance,
  suggestEx3Resistance,
} from '../services/ble/echelonPowerCurve';
import {
  WORKOUT_TEMPLATES,
  formatWorkoutOptionLabel,
  getDistanceStageIndex,
  getSegmentTargetsForAthlete,
  getTotalWorkoutDistanceMeters,
  getTotalWorkoutDurationSec,
  groupWorkoutTemplates,
  isDistanceWorkout,
} from '../data/workouts';
import {
  enterBrowserFullscreen,
  exitBrowserFullscreen,
  isBrowserFullscreen,
  toggleBrowserFullscreen,
} from '../utils/fullscreen';
import { buildYouTubeEmbedSrc } from '../utils/youtube';
import type { AthleteProfile, LiveTelemetry } from '../types/fitness';

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

describe('Universal Stationary Bike Power Curves, Gear Badges & Guided Workouts', () => {
  it('calculates monotonic watts across EX-Series Heavy, Sport/EX-15 Compact, and Classic Freeride curves with auto-detection', () => {
    expect(calculateEchelonWatts(20, 0, 'ex3-vector')).toBe(0);
    expect(calculateEchelonWatts(20, 0, 'sport-compact')).toBe(0);
    expect(calculateEchelonWatts(20, 0, 'echelon-official')).toBe(0);

    // Auto curve resolves to sport-compact on manual-knob Echelon Sport/EX-15/Prime/GT+ and ex3-vector otherwise
    expect(resolveEffectivePowerCurve('auto', 'echelon-sport-knob')).toBe('sport-compact');
    expect(resolveEffectivePowerCurve('auto', 'echelon-ex-motorized')).toBe('ex3-vector');
    expect(resolveEffectivePowerCurve('auto', null)).toBe('ex3-vector');
    expect(resolveEffectivePowerCurve('sport-compact', 'echelon-ex-motorized')).toBe('sport-compact');

    const low = calculateEchelonWatts(16, 80, 'ex3-vector');
    const high = calculateEchelonWatts(24, 90, 'ex3-vector');
    expect(high).toBeGreaterThan(low);

    // Compact 15-lb flywheel (Connect Sport / EX-15) produces realistic lower top-end watts than 33-lb EX-3/EX-5
    const sportMax85 = calculateEchelonWatts(32, 85, 'auto', 1.0, 'echelon-sport-knob');
    const ex3Max85 = calculateEchelonWatts(32, 85, 'auto', 1.0, 'echelon-ex-motorized');
    expect(sportMax85).toBeGreaterThan(220);
    expect(sportMax85).toBeLessThan(340);
    expect(ex3Max85).toBeGreaterThan(sportMax85 + 150);

    // Sport/EX-15 recommends a slightly higher 1-32 knob gear than EX-3 to hit the same target watts
    const ex3Gear = suggestBikeResistance(160, 88, 'auto', 1.0, 'echelon-ex-motorized');
    const sportGear = suggestBikeResistance(160, 88, 'auto', 1.0, 'echelon-sport-knob');
    expect(sportGear).toBeGreaterThanOrEqual(ex3Gear);
    expect(suggestEx3Resistance(150, 88, 'ex3-vector', 1.0)).toBeGreaterThanOrEqual(16);

    // FTMS 0-100 resistance scale normalizes proportionally when directWatts are absent
    const ftms50 = calculateEchelonWatts(50, 85, 'ex3-vector', 1.0, 'ftms-bike', 100);
    const echelon16 = calculateEchelonWatts(16, 85, 'ex3-vector', 1.0, 'echelon-ex-motorized', 32);
    expect(ftms50).toBe(echelon16);

    // Watt gain scales output proportionally
    const scaled = calculateEchelonWatts(20, 85, 'ex3-vector', 1.1);
    const unscaled = calculateEchelonWatts(20, 85, 'ex3-vector', 1.0);
    expect(scaled).toBeGreaterThan(unscaled);
  });

  it('formats adaptive gauge gear badges for motorized Echelon, manual knob Echelon, FTMS 0-100, Power Pedals, and Cadence pods', () => {
    const baseTelemetry: LiveTelemetry = {
      powerWatts: 150,
      cadenceRpm: 88,
      resistance: 21,
      heartRateBpm: 145,
      speedMph: 18.5,
      distanceMeters: 1200,
      bikeConnected: false,
      bikeName: null,
      bikeStatus: 'disconnected',
      hrConnected: false,
      hrName: null,
      hrStatus: 'disconnected',
      isSimulating: true,
    };

    expect(formatBikeGearBadge(baseTelemetry)).toBe('GEAR 21/32');
    expect(
      formatBikeGearBadge({
        ...baseTelemetry,
        bikeConnected: true,
        bikeFamily: 'echelon-ex-motorized',
        bikeShortLabel: 'EX-5',
      })
    ).toBe('EX-5 RES 21/32');
    expect(
      formatBikeGearBadge({
        ...baseTelemetry,
        bikeConnected: true,
        bikeFamily: 'echelon-sport-knob',
        resistance: 24,
      })
    ).toBe('KNOB 24/32');
    expect(
      formatBikeGearBadge({
        ...baseTelemetry,
        bikeConnected: true,
        bikeFamily: 'ftms-bike',
        resistance: 65,
        bikeMaxResistance: 100,
      })
    ).toBe('RES 65/100');
    expect(
      formatBikeGearBadge({
        ...baseTelemetry,
        bikeConnected: true,
        bikeFamily: 'power-meter-bike',
      })
    ).toBe('DIRECT POWER');
    expect(
      formatBikeGearBadge({
        ...baseTelemetry,
        bikeConnected: true,
        bikeFamily: 'cadence-bike',
        resistance: 18,
      })
    ).toBe('EST GEAR 18/32');
  });

  it('validates all workout templates, durations, distance challenges, cues, and dynamic targets without prohibited terms', () => {
    expect(WORKOUT_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    const bannedTerms = ['ot' + 'f', 'orange' + 'theory', 'sp' + 'lat', 'sp' + 'lats'];
    const bannedPattern = new RegExp(`\\b(${bannedTerms.join('|')})\\b`, 'i');

    for (const zId of [1, 2, 3, 4, 5] as const) {
      expect(ZONE_PALETTE[zId].name).not.toMatch(bannedPattern);
      expect(ZONE_PALETTE[zId].stageLabel).not.toMatch(bannedPattern);
    }

    for (const cue of ['warmup', 'base', 'push', 'all-out', 'recovery'] as const) {
      expect(cueDisplayLabel(cue).length).toBeGreaterThan(3);
    }

    const seenTemplateIds = new Set<string>();
    const seenSegmentIds = new Set<string>();

    for (const tpl of WORKOUT_TEMPLATES) {
      expect(seenTemplateIds.has(tpl.id)).toBe(false);
      seenTemplateIds.add(tpl.id);

      expect(tpl.name).not.toMatch(bannedPattern);
      expect(tpl.subtitle).not.toMatch(bannedPattern);

      if (tpl.isFreeRide) {
        expect(getTotalWorkoutDurationSec(tpl)).toBe(0);
        expect(formatWorkoutOptionLabel(tpl)).toBe(tpl.name);
      } else if (isDistanceWorkout(tpl)) {
        const targetMeters = getTotalWorkoutDistanceMeters(tpl);
        const stageSumMeters = tpl.segments.reduce((acc, s) => acc + (s.distanceMeters ?? 0), 0);
        expect(targetMeters).toBeGreaterThanOrEqual(50_000);
        expect(Math.abs(stageSumMeters - targetMeters)).toBeLessThan(1);
        expect(tpl.distanceUnit === 'km' || tpl.distanceUnit === 'mi').toBe(true);
        expect(formatWorkoutOptionLabel(tpl)).toBe(tpl.name);
        expect(formatWorkoutOptionLabel(tpl, 'm')).toBe(tpl.name);

        for (const seg of tpl.segments) {
          expect(seenSegmentIds.has(seg.id)).toBe(false);
          seenSegmentIds.add(seg.id);

          expect(seg.distanceMeters).toBeGreaterThan(0);
          expect(seg.coachingNote).not.toMatch(bannedPattern);
          const starterTargets = getSegmentTargetsForAthlete(seg, DEFAULT_ATHLETE_PROFILE);
          expect(starterTargets.maxWatts).toBeGreaterThanOrEqual(starterTargets.minWatts);
          expect(starterTargets.suggestedResistanceLow).toBeGreaterThanOrEqual(1);
          expect(starterTargets.suggestedResistanceHigh).toBeLessThanOrEqual(32);

          const strongerAthlete: AthleteProfile = { ...DEFAULT_ATHLETE_PROFILE, ftpWatts: 260 };
          const strongerTargets = getSegmentTargetsForAthlete(seg, strongerAthlete);
          expect(strongerTargets.midWatts).toBeGreaterThan(starterTargets.midWatts);
        }
      } else {
        expect(getTotalWorkoutDurationSec(tpl)).toBeGreaterThanOrEqual(1200);
        expect(formatWorkoutOptionLabel(tpl)).toBe(tpl.name);
        expect(formatWorkoutOptionLabel(tpl, 'm')).toBe(tpl.name);
        for (const seg of tpl.segments) {
          expect(seenSegmentIds.has(seg.id)).toBe(false);
          seenSegmentIds.add(seg.id);

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

    // Long endurance rides hit exact 1-hour, 2-hour, and 3-hour totals without redundant duration suffixes
    const enduranceSpecs = [
      { id: 'endurance-1hr', name: '1-Hour Endurance', expectedSec: 3600 },
      { id: 'endurance-2hr', name: '2-Hour Endurance', expectedSec: 7200 },
      { id: 'endurance-3hr', name: '3-Hour Endurance', expectedSec: 10800 },
    ] as const;

    for (const spec of enduranceSpecs) {
      const ride = WORKOUT_TEMPLATES.find((w) => w.id === spec.id);
      expect(ride).toBeDefined();
      expect(ride?.name).toBe(spec.name);
      expect(ride?.category).toBe('endurance');
      expect(getTotalWorkoutDurationSec(ride!)).toBe(spec.expectedSec);
      expect(formatWorkoutOptionLabel(ride!)).toBe(spec.name);
      expect(formatWorkoutOptionLabel(ride!, 'm')).toBe(spec.name);
    }

    // Distance challenges hit exact 50K, 50 mi, Metric Century (100K), and Full Century (100 mi) targets
    const distanceSpecs = [
      { id: 'distance-50k', name: '50K Challenge', expectedMeters: 50_000, unit: 'km' as const },
      {
        id: 'distance-50mi',
        name: '50-Mile Half Century',
        expectedMeters: 50 * METERS_PER_MILE,
        unit: 'mi' as const,
      },
      {
        id: 'distance-100k',
        name: 'Metric Century (100K)',
        expectedMeters: 100_000,
        unit: 'km' as const,
      },
      {
        id: 'distance-100mi',
        name: 'Full Century (100 Mi)',
        expectedMeters: 100 * METERS_PER_MILE,
        unit: 'mi' as const,
      },
    ];

    for (const spec of distanceSpecs) {
      const ride = WORKOUT_TEMPLATES.find((w) => w.id === spec.id);
      expect(ride).toBeDefined();
      expect(ride?.name).toBe(spec.name);
      expect(ride?.category).toBe('distance');
      expect(ride?.distanceUnit).toBe(spec.unit);
      expect(getTotalWorkoutDistanceMeters(ride!)).toBeCloseTo(spec.expectedMeters, 2);
      expect(getDistanceStageIndex(ride!, 0)).toBe(0);
      expect(getDistanceStageIndex(ride!, spec.expectedMeters / 2)).toBeGreaterThan(0);
      expect(getDistanceStageIndex(ride!, spec.expectedMeters / 2)).toBeLessThan(
        ride!.segments.length
      );
      expect(getDistanceStageIndex(ride!, spec.expectedMeters)).toBe(ride!.segments.length);
      expect(getDistanceStageIndex(ride!, spec.expectedMeters + 500)).toBe(ride!.segments.length);
    }

    // Distance formatting, ETA estimation, and dropdown grouping
    expect(formatDistanceValue(50_000, 'km')).toBe('50.00 km');
    expect(formatDistanceValue(50 * METERS_PER_MILE, 'mi')).toBe('50.00 mi');
    expect(formatDistanceTarget(100_000, 'km')).toBe('100 km');
    expect(formatDistanceTarget(1.5 * METERS_PER_MILE, 'mi')).toBe('1.5 mi');
    expect(estimateDistanceEtaSec(10_000, 0, 0)).toBeNull();
    expect(estimateDistanceEtaSec(0, 8, 8)).toBe(0);
    expect(estimateDistanceEtaSec(10_000, 10, 10)).toBe(1000);

    // 20-Min FTP Test template validation & 95% FTP calculation
    const ftpTest = WORKOUT_TEMPLATES.find((w) => w.id === 'jbf-20-ftp-test');
    expect(ftpTest).toBeDefined();
    expect(ftpTest?.name).toBe('20-Min FTP Test');
    expect(ftpTest?.isFtpTest).toBe(true);
    expect(ftpTest?.segments.length).toBe(4);
    expect(getTotalWorkoutDurationSec(ftpTest!)).toBe(1200);
    expect(formatWorkoutOptionLabel(ftpTest!)).toBe('20-Min FTP Test');
    expect(formatWorkoutOptionLabel(ftpTest!, 'm')).toBe('20-Min FTP Test');

    expect(computeBestWindowAvgWatts([100, 200, 300], 5)).toBeNull();
    expect(computeBestWindowAvgWatts([100, 100, 200, 200, 200, 100], 3)).toBe(200);

    // Full 20-min test (220W avg -> 209W FTP)
    const steady220 = Array.from({ length: 1200 }, () => 220);
    expect(evaluateRideFtpResult(steady220, 150, true)).toEqual({
      avg20MinWatts: 220,
      estimatedFtpWatts: 209,
      previousFtpWatts: 150,
      completedFull20Min: true,
      isDedicatedTest: true,
    });

    // Dedicated test finished slightly early at 19:30 (1170s) still calculates result
    const early1930 = Array.from({ length: 1170 }, () => 200);
    expect(evaluateRideFtpResult(early1930, 180, true)).toEqual({
      avg20MinWatts: 200,
      estimatedFtpWatts: 190,
      previousFtpWatts: 180,
      completedFull20Min: false,
      isDedicatedTest: true,
    });

    // Incomplete dedicated test (< 19:00) returns undefined
    expect(evaluateRideFtpResult(Array.from({ length: 600 }, () => 250), 150, true)).toBeUndefined();

    // Non-test long ride detects new FTP PR only when 95% of best 20-min beats current FTP
    const enduranceWithBreakthrough = [
      ...Array.from({ length: 300 }, () => 130),
      ...Array.from({ length: 1200 }, () => 200),
      ...Array.from({ length: 300 }, () => 120),
    ];
    expect(evaluateRideFtpResult(enduranceWithBreakthrough, 180, false)).toEqual({
      avg20MinWatts: 200,
      estimatedFtpWatts: 190,
      previousFtpWatts: 180,
      completedFull20Min: true,
      isDedicatedTest: false,
    });
    expect(evaluateRideFtpResult(enduranceWithBreakthrough, 195, false)).toBeUndefined();

    const groups = groupWorkoutTemplates(WORKOUT_TEMPLATES);
    expect(groups.map((g) => g.label)).toEqual([
      'Open Studio',
      'Studio Workouts',
      'Endurance Rides',
      'Distance Challenges',
    ]);
    expect(groups.reduce((sum, g) => sum + g.workouts.length, 0)).toBe(WORKOUT_TEMPLATES.length);

    // Custom workout without duration in its name still appends "(15 min)" / "(15m)"
    const customNoTime = {
      ...WORKOUT_TEMPLATES[1],
      name: 'Tabata Power',
      segments: [{ ...WORKOUT_TEMPLATES[1].segments[0], durationSec: 900 }],
    };
    expect(formatWorkoutOptionLabel(customNoTime)).toBe('Tabata Power (15 min)');
    expect(formatWorkoutOptionLabel(customNoTime, 'm')).toBe('Tabata Power (15m)');
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
    expect(buildYouTubeEmbedSrc('https://www.youtube.com/watch?v=../../evil')).toBeNull();
    expect(buildYouTubeEmbedSrc('https://youtu.be/bad?param=1')).toBeNull();
    expect(buildYouTubeEmbedSrc('https://www.youtube.com/playlist?list=<script>')).toBeNull();
  });
});
