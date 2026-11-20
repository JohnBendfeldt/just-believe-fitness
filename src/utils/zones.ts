import type {
  AthleteProfile,
  EffortCue,
  LiveTelemetry,
  ZoneDefinition,
  ZoneId,
} from '../types/fitness';

export const DEFAULT_ATHLETE_PROFILE: AthleteProfile = {
  name: 'Rider',
  heightFeet: 5,
  heightInches: 8,
  weightLbs: 165,
  ftpWatts: 150,
  maxHrBpm: 180,
  restingHrBpm: 65,
  powerCurve: 'auto',
  wattGain: 1.0,
};

export const ZONE_PALETTE: Record<
  ZoneId,
  {
    key: ZoneDefinition['key'];
    name: string;
    stageLabel: string;
    color: string;
    colorSoft: string;
    colorStrong: string;
    textOnFill: string;
  }
> = {
  1: {
    key: 'grey',
    name: 'Zone 1 · Recovery',
    stageLabel: 'VERY LIGHT',
    color: '#7A8699',
    colorSoft: 'rgba(122, 134, 153, 0.18)',
    colorStrong: '#5B6678',
    textOnFill: '#F8FAFC',
  },
  2: {
    key: 'blue',
    name: 'Zone 2 · Endurance',
    stageLabel: 'WARM UP',
    color: '#1898F2',
    colorSoft: 'rgba(24, 152, 242, 0.18)',
    colorStrong: '#0C7CD5',
    textOnFill: '#F8FAFC',
  },
  3: {
    key: 'green',
    name: 'Zone 3 · Base Pace',
    stageLabel: 'BASE PACE',
    color: '#12B981',
    colorSoft: 'rgba(18, 185, 129, 0.18)',
    colorStrong: '#099668',
    textOnFill: '#041E15',
  },
  4: {
    key: 'orange',
    name: 'Zone 4 · Push Pace',
    stageLabel: 'PUSH · BURN',
    color: '#F97316',
    colorSoft: 'rgba(249, 115, 22, 0.2)',
    colorStrong: '#EA580C',
    textOnFill: '#1C0A00',
  },
  5: {
    key: 'red',
    name: 'Zone 5 · All Out',
    stageLabel: 'ALL OUT · BURN',
    color: '#EF4444',
    colorSoft: 'rgba(239, 68, 68, 0.22)',
    colorStrong: '#DC2626',
    textOnFill: '#FFF5F5',
  },
};

export function lbsToKg(lbs: number): number {
  return Math.max(30, lbs) * 0.45359237;
}

export function feetInchesToCm(feet: number, inches: number): number {
  const totalInches = Math.max(48, feet * 12 + inches);
  return totalInches * 2.54;
}

export function formatHeightImperial(feet: number, inches: number): string {
  return `${feet}'${inches}"`;
}

export function computeWattsPerKg(watts: number, weightLbs: number): number {
  const kg = lbsToKg(weightLbs);
  if (kg <= 0) return 0;
  return watts / kg;
}

/**
 * Estimates virtual flat-road indoor cycling speed (mph & m/s) using
 * DuBois body surface area derived from rider height & weight for aerodynamic CdA
 * plus rolling resistance.
 */
export function estimateIndoorSpeedMps(watts: number, profile: AthleteProfile): number {
  if (watts <= 1) return 0;
  const weightKg = lbsToKg(profile.weightLbs);
  const heightCm = feetInchesToCm(profile.heightFeet, profile.heightInches);
  const bikeMassKg = 9.0;
  const totalMassKg = weightKg + bikeMassKg;

  // DuBois Body Surface Area (m^2): 5'9", 168 lbs => ~1.92 m^2
  const bsa = 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725);
  const cda = 0.168 * bsa;
  const airDensity = 1.225;
  const crr = 0.004;
  const drivetrainEfficiency = 0.96;
  const effectivePower = watts * drivetrainEfficiency;

  const kAero = 0.5 * airDensity * cda;
  const fRoll = crr * totalMassKg * 9.80665;
  let v = 7.5;
  for (let i = 0; i < 12; i++) {
    const f = kAero * v * v * v + fRoll * v - effectivePower;
    const df = 3 * kAero * v * v + fRoll;
    v = Math.max(0.2, v - f / df);
  }
  return v;
}

export const METERS_PER_MILE = 1609.344;

export function mpsToMph(mps: number): number {
  return mps * 2.23693629;
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

/** Formats a live distance readout (e.g. "49.82 km" or "31.07 mi"). */
export function formatDistanceValue(
  meters: number,
  unit: 'km' | 'mi',
  decimals = 2
): string {
  const safeMeters = Math.max(0, meters);
  const val = unit === 'km' ? safeMeters / 1000 : metersToMiles(safeMeters);
  return `${val.toFixed(decimals)} ${unit}`;
}

/** Formats a clean route/stage target label (e.g. "50 km", "100 mi", "1.5 mi"). */
export function formatDistanceTarget(meters: number, unit: 'km' | 'mi'): string {
  const safeMeters = Math.max(0, meters);
  const val = unit === 'km' ? safeMeters / 1000 : metersToMiles(safeMeters);
  const rounded = Math.round(val * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} ${unit}`;
}

/**
 * Estimates remaining seconds to finish a distance challenge using a smooth blend
 * of overall ride average speed and live instantaneous speed so ETA doesn't jump
 * wildly during brief standing surges or water breaks.
 */
export function estimateDistanceEtaSec(
  remainingMeters: number,
  currentSpeedMps: number,
  avgSpeedMps: number
): number | null {
  if (remainingMeters <= 0) return 0;
  const hasAvg = avgSpeedMps > 0.5;
  const hasCurr = currentSpeedMps > 0.5;
  let effectiveSpeedMps = 0;
  if (hasAvg && hasCurr) {
    effectiveSpeedMps = avgSpeedMps * 0.65 + currentSpeedMps * 0.35;
  } else if (hasAvg) {
    effectiveSpeedMps = avgSpeedMps;
  } else if (hasCurr) {
    effectiveSpeedMps = currentSpeedMps;
  } else {
    return null;
  }
  return Math.max(1, Math.round(remainingMeters / effectiveSpeedMps));
}

/**
 * Calculates instantaneous kcal/sec burn rate from mechanical power (preferred)
 * or heart-rate + rider mass fallback when pedaling without power.
 */
export function estimateKcalPerSecond(
  watts: number,
  heartRateBpm: number,
  profile: AthleteProfile
): number {
  if (watts > 3) {
    const baseKcalPerSec = watts / 1000;
    const hrFactor =
      heartRateBpm > 0
        ? 0.94 + 0.12 * Math.min(1.15, heartRateBpm / Math.max(120, profile.maxHrBpm))
        : 1.0;
    return baseKcalPerSec * hrFactor;
  }

  if (heartRateBpm > 85) {
    const weightKg = lbsToKg(profile.weightLbs);
    const kcalPerMin = Math.max(
      1.2,
      (-55.0969 + 0.6309 * heartRateBpm + 0.1988 * weightKg + 0.2017 * 34) / 4.184
    );
    return kcalPerMin / 60;
  }

  return 0;
}

/**
 * JBF 5 Heart Rate Zones oriented around athlete's Max HR:
 * Z1 Grey:   < 61% Max HR
 * Z2 Blue:   61% - 70% Max HR
 * Z3 Green:  71% - 83% Max HR (Base)
 * Z4 Orange: 84% - 91% Max HR (Push / Burn Zone)
 * Z5 Red:    92% - 100%+ Max HR (All Out / Burn Zone)
 */
export function getHrZones(maxHrBpm: number): ZoneDefinition[] {
  const maxHr = Math.max(120, Math.round(maxHrBpm));
  const z2Min = Math.round(maxHr * 0.61);
  const z3Min = Math.round(maxHr * 0.71);
  const z4Min = Math.round(maxHr * 0.84);
  const z5Min = Math.round(maxHr * 0.92);

  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      minPct: 0,
      maxPct: 60,
      minValue: 0,
      maxValue: z2Min - 1,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      minPct: 61,
      maxPct: 70,
      minValue: z2Min,
      maxValue: z3Min - 1,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      minPct: 71,
      maxPct: 83,
      minValue: z3Min,
      maxValue: z4Min - 1,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      minPct: 84,
      maxPct: 91,
      minValue: z4Min,
      maxValue: z5Min - 1,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      minPct: 92,
      maxPct: 100,
      minValue: z5Min,
      maxValue: maxHr,
    },
  ];
}

/**
 * JBF 5-Color Power Zones oriented around athlete's FTP (e.g. 257 W):
 * Z1 Grey:   0% - 55% FTP   (Active Recovery)
 * Z2 Blue:   56% - 75% FTP  (Endurance)
 * Z3 Green:  76% - 90% FTP  (Tempo / Sweet Spot Base)
 * Z4 Orange: 91% - 105% FTP (Threshold Push)
 * Z5 Red:    106%+ FTP      (VO2 Max / Anaerobic All-Out)
 */
export function getPowerZones(ftpWatts: number): ZoneDefinition[] {
  const ftp = Math.max(60, Math.round(ftpWatts));
  const z2Min = Math.round(ftp * 0.56);
  const z3Min = Math.round(ftp * 0.76);
  const z4Min = Math.round(ftp * 0.91);
  const z5Min = Math.round(ftp * 1.06);

  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Z1 · Recovery',
      stageLabel: 'RECOVERY',
      minPct: 0,
      maxPct: 55,
      minValue: 0,
      maxValue: z2Min - 1,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Z2 · Endurance',
      stageLabel: 'ENDURANCE',
      minPct: 56,
      maxPct: 75,
      minValue: z2Min,
      maxValue: z3Min - 1,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Z3 · Tempo Base',
      stageLabel: 'BASE POWER',
      minPct: 76,
      maxPct: 90,
      minValue: z3Min,
      maxValue: z4Min - 1,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'Z4 · Threshold',
      stageLabel: 'PUSH POWER',
      minPct: 91,
      maxPct: 105,
      minValue: z4Min,
      maxValue: z5Min - 1,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Z5 · VO2 / All Out',
      stageLabel: 'ALL OUT POWER',
      minPct: 106,
      maxPct: 150,
      minValue: z5Min,
      maxValue: Math.round(ftp * 1.5),
    },
  ];
}

/**
 * 5-Color Indoor Spin Cadence Zones (RPM):
 * Z1 Grey:   < 55 RPM  (Easy Spin)
 * Z2 Blue:   55-69 RPM (Heavy Climb)
 * Z3 Green:  70-89 RPM (Rhythm / Base Spin)
 * Z4 Orange: 90-104 RPM (Fast Push Spin)
 * Z5 Red:    105+ RPM  (All-Out Sprint)
 */
export function getCadenceZones(): ZoneDefinition[] {
  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Easy Spin',
      stageLabel: 'EASY SPIN',
      minPct: 0,
      maxPct: 45,
      minValue: 0,
      maxValue: 54,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Heavy Climb',
      stageLabel: 'CLIMB GRIND',
      minPct: 46,
      maxPct: 58,
      minValue: 55,
      maxValue: 69,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Base Rhythm',
      stageLabel: 'RHYTHM',
      minPct: 59,
      maxPct: 75,
      minValue: 70,
      maxValue: 89,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'Fast Surge',
      stageLabel: 'FAST SPIN',
      minPct: 76,
      maxPct: 87,
      minValue: 90,
      maxValue: 104,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Sprint RPM',
      stageLabel: 'SPRINT',
      minPct: 88,
      maxPct: 100,
      minValue: 105,
      maxValue: 130,
    },
  ];
}

/**
 * 5-Color Echelon EX-3 Resistance Zones (Levels 1-32):
 * Z1 Grey:   1-8   (Light Spin)
 * Z2 Blue:   9-15  (Flat Road)
 * Z3 Green:  16-21 (Base Gear)
 * Z4 Orange: 22-26 (Heavy Push)
 * Z5 Red:    27-32 (Max Climb)
 */
export function getResistanceZones(): ZoneDefinition[] {
  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Light Gear',
      stageLabel: 'LIGHT GEAR',
      minPct: 0,
      maxPct: 25,
      minValue: 1,
      maxValue: 8,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Flat Road',
      stageLabel: 'FLAT ROAD',
      minPct: 26,
      maxPct: 47,
      minValue: 9,
      maxValue: 15,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Base Gear',
      stageLabel: 'BASE GEAR',
      minPct: 48,
      maxPct: 66,
      minValue: 16,
      maxValue: 21,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'Push Climb',
      stageLabel: 'PUSH GEAR',
      minPct: 67,
      maxPct: 81,
      minValue: 22,
      maxValue: 26,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Max Climb',
      stageLabel: 'MAX CLIMB',
      minPct: 82,
      maxPct: 100,
      minValue: 27,
      maxValue: 32,
    },
  ];
}

export function resolveZone(value: number, zones: ZoneDefinition[]): ZoneDefinition {
  if (value <= 0) return zones[0];
  for (let i = zones.length - 1; i >= 0; i--) {
    if (value >= zones[i].minValue) {
      return zones[i];
    }
  }
  return zones[0];
}

/**
 * Computes normalized 0..100% needle position across the 5-segment zone bar
 * so each of the 5 visual blocks represents 20% width while positioning the
 * marker proportionally within the active zone's numeric span.
 */
export function computeSegmentedGaugeProgress(value: number, zones: ZoneDefinition[]): number {
  if (value <= 0) return 0;
  const active = resolveZone(value, zones);
  const idx = active.zone - 1;
  const segStart = idx * 20;
  const minVal = active.minValue;
  const maxVal = active.maxValue ?? minVal * 1.25;
  const span = Math.max(1, maxVal - minVal);
  const localRatio = Math.min(1, Math.max(0, (value - minVal) / span));
  return Math.min(99.2, Math.max(0.8, segStart + localRatio * 20));
}

/**
 * Determines overall JBF studio intensity banner zone:
 * Uses Heart Rate zone when HR is streaming, or seamlessly falls back to Power zone (% FTP)
 * if riding without an HR sensor, or reflects immediate Zone 4/5 power surges.
 */
export function resolveHeadlineEffortZone(
  hrBpm: number,
  watts: number,
  profile: AthleteProfile
): { zoneDef: ZoneDefinition; driver: 'hr' | 'power' } {
  const hrZones = getHrZones(profile.maxHrBpm);
  const powerZones = getPowerZones(profile.ftpWatts);

  if (hrBpm > 40 && watts > 0) {
    const hrZ = resolveZone(hrBpm, hrZones);
    const pwrZ = resolveZone(watts, powerZones);
    if (pwrZ.zone >= 4 && pwrZ.zone > hrZ.zone) {
      return { zoneDef: pwrZ, driver: 'power' };
    }
    return { zoneDef: hrZ, driver: 'hr' };
  }

  if (hrBpm > 40) {
    return { zoneDef: resolveZone(hrBpm, hrZones), driver: 'hr' };
  }

  return { zoneDef: resolveZone(watts, powerZones), driver: 'power' };
}

export function cueDisplayLabel(cue: EffortCue): string {
  switch (cue) {
    case 'warmup':
      return 'WARM UP';
    case 'base':
      return 'BASE PACE';
    case 'push':
      return 'PUSH PACE';
    case 'all-out':
      return 'ALL OUT';
    case 'recovery':
      return 'ACTIVE RECOVERY';
  }
}

export function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function computeNormalizedPower(wattsSeries: number[]): number {
  if (wattsSeries.length === 0) return 0;
  if (wattsSeries.length < 30) {
    const avg = wattsSeries.reduce((a, b) => a + b, 0) / wattsSeries.length;
    return Math.round(avg);
  }
  let rollingSum = 0;
  let fourthPowerSum = 0;
  let count = 0;
  for (let i = 0; i < wattsSeries.length; i++) {
    rollingSum += wattsSeries[i];
    if (i >= 30) {
      rollingSum -= wattsSeries[i - 30];
    }
    if (i >= 29) {
      const avg30 = rollingSum / 30;
      fourthPowerSum += Math.pow(avg30, 4);
      count++;
    }
  }
  if (count === 0) return 0;
  return Math.round(Math.pow(fourthPowerSum / count, 0.25));
}

/**
 * Computes the highest average power (watts) over any contiguous `windowSec`-second
 * window in a 1 Hz power series in O(n) time. Returns null if the series is shorter than `windowSec`.
 */
export function computeBestWindowAvgWatts(
  wattsSeries: number[],
  windowSec: number
): number | null {
  if (windowSec <= 0 || wattsSeries.length < windowSec) return null;
  let sum = 0;
  for (let i = 0; i < windowSec; i++) {
    sum += wattsSeries[i];
  }
  let maxSum = sum;
  for (let i = windowSec; i < wattsSeries.length; i++) {
    sum += wattsSeries[i] - wattsSeries[i - windowSec];
    if (sum > maxSum) maxSum = sum;
  }
  return Math.round(maxSum / windowSec);
}

/**
 * Evaluates a completed ride for an FTP Test result (95% of 20-minute average power).
 * - On dedicated 20-Min FTP Test rides: returns a result whenever the rider completes at least
 *   19:00 (1140s) with meaningful power (>= 30W), using the exact best 1200s window if >= 20:00.
 * - On any other ride (e.g. Endurance or Century): returns a breakthrough PR result only when
 *   the rider's best 20-minute rolling window (1200s) yields an FTP strictly higher than current FTP.
 */
export function evaluateRideFtpResult(
  wattsSeries: number[],
  previousFtpWatts: number,
  isDedicatedTest: boolean
): {
  avg20MinWatts: number;
  estimatedFtpWatts: number;
  previousFtpWatts: number;
  completedFull20Min: boolean;
  isDedicatedTest: boolean;
} | undefined {
  if (wattsSeries.length === 0) return undefined;

  const best20Min = computeBestWindowAvgWatts(wattsSeries, 1200);
  if (best20Min !== null) {
    if (best20Min < 30) return undefined;
    const estimatedFtpWatts = Math.round(best20Min * 0.95);
    if (!isDedicatedTest && estimatedFtpWatts <= previousFtpWatts) {
      return undefined;
    }
    return {
      avg20MinWatts: best20Min,
      estimatedFtpWatts,
      previousFtpWatts,
      completedFull20Min: true,
      isDedicatedTest,
    };
  }

  // Dedicated 20-Min FTP Test: allow finishing up to 60s early (e.g. 19:55) without losing the benchmark
  if (isDedicatedTest && wattsSeries.length >= 1140) {
    const avg = Math.round(wattsSeries.reduce((a, b) => a + b, 0) / wattsSeries.length);
    if (avg < 30) return undefined;
    return {
      avg20MinWatts: avg,
      estimatedFtpWatts: Math.round(avg * 0.95),
      previousFtpWatts,
      completedFull20Min: wattsSeries.length >= 1185,
      isDedicatedTest: true,
    };
  }

  return undefined;
}

export function formatBikeGearBadge(telemetry: LiveTelemetry): string {
  const maxRes = telemetry.bikeMaxResistance ?? 32;
  if (!telemetry.bikeConnected) {
    return `GEAR ${telemetry.resistance}/${maxRes}`;
  }
  switch (telemetry.bikeFamily) {
    case 'power-meter-bike':
      return 'DIRECT POWER';
    case 'cadence-bike':
      return `EST GEAR ${telemetry.resistance}/32`;
    case 'echelon-sport-knob':
      return `KNOB ${telemetry.resistance}/32`;
    case 'ftms-bike':
      return `RES ${telemetry.resistance}/${maxRes}`;
    case 'echelon-ex-motorized': {
      const prefix = (telemetry.bikeShortLabel || 'ECH').toUpperCase();
      return `${prefix} RES ${telemetry.resistance}/32`;
    }
    default:
      return `RES ${telemetry.resistance}/${maxRes}`;
  }
}
