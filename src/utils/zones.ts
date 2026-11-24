import type {
  AthleteProfile,
  EffortCue,
  LiveTelemetry,
  SportMode,
  ZoneDefinition,
  ZoneId,
} from '../types/fitness';

export const DEFAULT_RUN_THRESHOLD_PACE_SEC_PER_MILE = 540; // 9:00 /mi (~6.67 mph)

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
  runThresholdPaceSecPerMile: DEFAULT_RUN_THRESHOLD_PACE_SEC_PER_MILE,
  rowFtpWatts: 150,
};

export function getEffectiveRunThresholdPaceSec(profile: AthleteProfile): number {
  const raw = profile.runThresholdPaceSecPerMile;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 240 && raw <= 1200) {
    return Math.round(raw);
  }
  return DEFAULT_RUN_THRESHOLD_PACE_SEC_PER_MILE;
}

export function getEffectiveRowFtpWatts(profile: AthleteProfile): number {
  const raw = profile.rowFtpWatts;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 60 && raw <= 550) {
    return Math.round(raw);
  }
  return Math.max(60, Math.round(profile.ftpWatts));
}

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

/** Formats a live distance readout (e.g. "49.82 km", "31.07 mi", or "2,000 m"). */
export function formatDistanceValue(
  meters: number,
  unit: 'km' | 'mi' | 'm',
  decimals = 2
): string {
  const safeMeters = Math.max(0, meters);
  if (unit === 'm') {
    return `${Math.round(safeMeters).toLocaleString('en-US')} m`;
  }
  const val = unit === 'km' ? safeMeters / 1000 : metersToMiles(safeMeters);
  return `${val.toFixed(decimals)} ${unit}`;
}

/** Formats a clean route/stage target label (e.g. "50 km", "100 mi", "2,000 m", "1.5 mi"). */
export function formatDistanceTarget(meters: number, unit: 'km' | 'mi' | 'm'): string {
  const safeMeters = Math.max(0, meters);
  if (unit === 'm') {
    return `${Math.round(safeMeters).toLocaleString('en-US')} m`;
  }
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
 * 5-Color Indoor Cycling Speed Zones (MPH):
 * Z1 Grey:   < 12 mph   (Easy Roll)
 * Z2 Blue:   12-15 mph  (Endurance Cruise)
 * Z3 Green:  16-19 mph  (Tempo Pace)
 * Z4 Orange: 20-23 mph  (Fast Push)
 * Z5 Red:    24+ mph    (Breakaway Sprint)
 */
export function getSpeedZones(): ZoneDefinition[] {
  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Easy Roll',
      stageLabel: 'EASY ROLL',
      minPct: 0,
      maxPct: 40,
      minValue: 0,
      maxValue: 11.9,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Cruise Pace',
      stageLabel: 'CRUISE',
      minPct: 41,
      maxPct: 55,
      minValue: 12,
      maxValue: 15.9,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Tempo Speed',
      stageLabel: 'TEMPO',
      minPct: 56,
      maxPct: 70,
      minValue: 16,
      maxValue: 19.9,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'Fast Push',
      stageLabel: 'FAST PUSH',
      minPct: 71,
      maxPct: 85,
      minValue: 20,
      maxValue: 23.9,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Sprint Speed',
      stageLabel: 'SPRINT',
      minPct: 86,
      maxPct: 100,
      minValue: 24,
      maxValue: 32,
    },
  ];
}

/**
 * 5-Stage Distance Progress Zones.
 * Scales dynamically to a distance challenge target (e.g. 50 km or 100 mi),
 * or uses clean indoor ride milestones (0 / 3 / 6 / 10 / 15+ mi) for open/timed rides.
 */
export function getDistanceZones(targetValue?: number): ZoneDefinition[] {
  if (typeof targetValue === 'number' && targetValue > 0) {
    const step = targetValue / 5;
    const roundStep = (n: number) =>
      targetValue >= 15 ? Math.round(n) : Math.round(n * 10) / 10;
    const z2 = roundStep(step);
    const z3 = roundStep(step * 2);
    const z4 = roundStep(step * 3);
    const z5 = roundStep(step * 4);
    return [
      {
        zone: 1,
        ...ZONE_PALETTE[1],
        name: 'Stage 1 · Launch',
        stageLabel: 'STAGE 1',
        minPct: 0,
        maxPct: 20,
        minValue: 0,
        maxValue: z2,
      },
      {
        zone: 2,
        ...ZONE_PALETTE[2],
        name: 'Stage 2 · Settling In',
        stageLabel: 'STAGE 2',
        minPct: 20,
        maxPct: 40,
        minValue: z2,
        maxValue: z3,
      },
      {
        zone: 3,
        ...ZONE_PALETTE[3],
        name: 'Stage 3 · Mid-Route',
        stageLabel: 'STAGE 3',
        minPct: 40,
        maxPct: 60,
        minValue: z3,
        maxValue: z4,
      },
      {
        zone: 4,
        ...ZONE_PALETTE[4],
        name: 'Stage 4 · Home Stretch',
        stageLabel: 'STAGE 4',
        minPct: 60,
        maxPct: 80,
        minValue: z4,
        maxValue: z5,
      },
      {
        zone: 5,
        ...ZONE_PALETTE[5],
        name: 'Stage 5 · Final Kick',
        stageLabel: 'FINAL KICK',
        minPct: 80,
        maxPct: 100,
        minValue: z5,
        maxValue: roundStep(targetValue),
      },
    ];
  }

  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Warm-Up Miles',
      stageLabel: 'OPENING',
      minPct: 0,
      maxPct: 20,
      minValue: 0,
      maxValue: 2.9,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Rolling Cruise',
      stageLabel: 'CRUISE',
      minPct: 20,
      maxPct: 40,
      minValue: 3,
      maxValue: 5.9,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Endurance Block',
      stageLabel: 'ENDURANCE',
      minPct: 40,
      maxPct: 65,
      minValue: 6,
      maxValue: 9.9,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'Long Haul',
      stageLabel: 'LONG HAUL',
      minPct: 65,
      maxPct: 85,
      minValue: 10,
      maxValue: 14.9,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Epic Distance',
      stageLabel: 'EPIC RIDE',
      minPct: 85,
      maxPct: 100,
      minValue: 15,
      maxValue: 25,
    },
  ];
}

/**
 * 5-Tier Active Calorie Milestones (kcal):
 * Z1 Grey:   0-119   (Warm-Up Burn)
 * Z2 Blue:   120-249 (Steady Burn)
 * Z3 Green:  250-399 (Solid Session)
 * Z4 Orange: 400-599 (High Burn)
 * Z5 Red:    600+    (Torch Session)
 */
export function getCalorieZones(): ZoneDefinition[] {
  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Warm-Up Burn',
      stageLabel: 'WARM BURN',
      minPct: 0,
      maxPct: 20,
      minValue: 0,
      maxValue: 119,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Steady Burn',
      stageLabel: 'STEADY',
      minPct: 20,
      maxPct: 40,
      minValue: 120,
      maxValue: 249,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Solid Session',
      stageLabel: 'SOLID BURN',
      minPct: 40,
      maxPct: 65,
      minValue: 250,
      maxValue: 399,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'High Output',
      stageLabel: 'HIGH BURN',
      minPct: 65,
      maxPct: 85,
      minValue: 400,
      maxValue: 599,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Torch Session',
      stageLabel: 'TORCH',
      minPct: 85,
      maxPct: 100,
      minValue: 600,
      maxValue: 900,
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
 * Uses Heart Rate zone when HR is streaming, or seamlessly falls back to sport primary effort
 * (Power % FTP for cycling/rowing, or Grade-Adjusted Pace/Speed zone for running), or reflects
 * immediate Zone 4/5 surges.
 */
export function resolveHeadlineEffortZone(
  hrBpm: number,
  watts: number,
  profile: AthleteProfile,
  options?: { sport?: SportMode; speedMph?: number; inclinePct?: number }
): { zoneDef: ZoneDefinition; driver: 'hr' | 'power' } {
  const hrZones = getHrZones(profile.maxHrBpm);
  const sport = options?.sport ?? 'cycling';

  let primaryZoneDef: ZoneDefinition;
  let hasPrimarySignal = watts > 0;

  if (sport === 'running') {
    const runZones = getRunningSpeedZones(getEffectiveRunThresholdPaceSec(profile));
    const speedMph = options?.speedMph ?? 0;
    const inclinePct = options?.inclinePct ?? 0;
    // Grade-adjusted effective speed: each +1% incline adds ~0.22 mph equivalent aerobic effort
    const gapMph = speedMph > 0.3 ? speedMph + Math.max(0, inclinePct) * 0.22 : 0;
    primaryZoneDef = resolveZone(gapMph, runZones);
    hasPrimarySignal = speedMph > 0.3;
  } else if (sport === 'rowing') {
    const rowZones = getPowerZones(getEffectiveRowFtpWatts(profile));
    primaryZoneDef = resolveZone(watts, rowZones);
    hasPrimarySignal = watts > 0;
  } else {
    const powerZones = getPowerZones(profile.ftpWatts);
    primaryZoneDef = resolveZone(watts, powerZones);
  }

  if (hrBpm > 40 && hasPrimarySignal) {
    const hrZ = resolveZone(hrBpm, hrZones);
    if (primaryZoneDef.zone >= 4 && primaryZoneDef.zone > hrZ.zone) {
      return { zoneDef: primaryZoneDef, driver: 'power' };
    }
    return { zoneDef: hrZ, driver: 'hr' };
  }

  if (hrBpm > 40) {
    return { zoneDef: resolveZone(hrBpm, hrZones), driver: 'hr' };
  }

  return { zoneDef: primaryZoneDef, driver: 'power' };
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

/**
 * Formats seconds-per-unit pace (e.g. 510 -> "8:30", 124 -> "2:04").
 * Returns "--:--" for invalid, zero, or stalled values.
 */
export function formatPaceSeconds(totalSec: number, maxValidSec = 1800): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0 || totalSec > maxValidSec) {
    return '--:--';
  }
  const rounded = Math.round(totalSec);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatRunningPacePerMile(speedMph: number): string {
  if (!Number.isFinite(speedMph) || speedMph <= 0.4) return '--:--';
  return formatPaceSeconds(3600 / speedMph, 2400);
}

export function formatRunningPacePerKm(speedMph: number): string {
  if (!Number.isFinite(speedMph) || speedMph <= 0.4) return '--:--';
  const kmh = speedMph * 1.609344;
  return formatPaceSeconds(3600 / kmh, 1500);
}

/** Concept2 official erg physics: watts = 2.80 / (pace_sec_per_m)^3. */
export function rowingWattsToSplitSecPer500m(watts: number): number {
  if (!Number.isFinite(watts) || watts <= 1) return 0;
  return 500 * Math.cbrt(2.8 / watts);
}

export function rowingSplitSecPer500mToWatts(splitSecPer500m: number): number {
  if (!Number.isFinite(splitSecPer500m) || splitSecPer500m <= 30 || splitSecPer500m > 600) {
    return 0;
  }
  const secPerMeter = splitSecPer500m / 500;
  return Math.round(2.8 / Math.pow(secPerMeter, 3));
}

export function rowingSplitToSpeedMps(splitSecPer500m: number): number {
  if (!Number.isFinite(splitSecPer500m) || splitSecPer500m <= 30 || splitSecPer500m > 600) {
    return 0;
  }
  return 500 / splitSecPer500m;
}

export function formatRowingSplit(splitSecPer500m: number): string {
  return formatPaceSeconds(splitSecPer500m, 599);
}

/**
 * Estimates running mechanical power (watts) from treadmill/footpod speed, incline grade %,
 * and athlete body weight using Stryd/van Dijk metabolic-mechanical running cost.
 */
export function estimateRunningPowerWatts(
  speedMps: number,
  inclinePct: number,
  weightLbs: number
): number {
  if (!Number.isFinite(speedMps) || speedMps <= 0.15) return 0;
  const weightKg = lbsToKg(weightLbs);
  // Smooth transition from walking cost (~0.68 J/kg/m) to running cost (~0.98 J/kg/m)
  const runBlend = Math.min(1, Math.max(0, (speedMps - 1.5) / 0.6));
  const flatCost = 0.68 + 0.3 * runBlend;
  const flatWatts = weightKg * flatCost * speedMps;
  const grade = Math.max(-0.05, Math.min(0.3, (inclinePct || 0) / 100));
  const climbWatts =
    grade >= 0
      ? (weightKg * 9.80665 * speedMps * grade) / 0.9
      : weightKg * 9.80665 * speedMps * grade * 0.45;
  return Math.max(0, Math.round(flatWatts + climbWatts));
}

/** ACSM running/walking treadmill kcal/sec formula with HR fallback. */
export function estimateRunningKcalPerSecond(
  speedMps: number,
  inclinePct: number,
  heartRateBpm: number,
  profile: AthleteProfile
): number {
  if (speedMps > 0.15) {
    const weightKg = lbsToKg(profile.weightLbs);
    const vMetersPerMin = speedMps * 60;
    const grade = Math.max(-0.03, Math.min(0.3, (inclinePct || 0) / 100));
    const vo2 =
      speedMps >= 1.9
        ? 3.5 + 0.2 * vMetersPerMin + 0.9 * vMetersPerMin * Math.max(0, grade)
        : 3.5 + 0.1 * vMetersPerMin + 1.8 * vMetersPerMin * Math.max(0, grade);
    const kcalPerMin = (vo2 * weightKg) / 200;
    return Math.max(0, kcalPerMin / 60);
  }
  return estimateKcalPerSecond(0, heartRateBpm, profile);
}

/** Concept2 erg calorie burn rate: kcal/hr = 4 * watts * 0.860421 + 300 when actively rowing. */
export function estimateRowingKcalPerSecond(
  watts: number,
  heartRateBpm: number,
  profile: AthleteProfile
): number {
  if (watts > 3) {
    const kcalPerHour = 4 * watts * 0.860421 + 300;
    return kcalPerHour / 3600;
  }
  return estimateKcalPerSecond(0, heartRateBpm, profile);
}

/**
 * 5-Color Treadmill / Running Speed Zones (MPH) scaled to the athlete's Threshold Pace.
 * Higher mph = higher effort zone (naturally matches clockwise speedometer dial).
 */
export function getRunningSpeedZones(
  thresholdPaceSecPerMile = DEFAULT_RUN_THRESHOLD_PACE_SEC_PER_MILE
): ZoneDefinition[] {
  const safePace = Math.max(240, Math.min(1200, thresholdPaceSecPerMile));
  const thresholdMph = 3600 / safePace;
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const z2Min = r1(thresholdMph * 0.68);
  const z3Min = r1(thresholdMph * 0.81);
  const z4Min = r1(thresholdMph * 0.94);
  const z5Min = r1(thresholdMph * 1.07);
  const z5Max = r1(thresholdMph * 1.32);

  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Z1 · Recovery / Walk',
      stageLabel: 'RECOVERY',
      minPct: 0,
      maxPct: 67,
      minValue: 0,
      maxValue: r1(Math.max(0.1, z2Min - 0.1)),
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Z2 · Easy Aerobic',
      stageLabel: 'EASY RUN',
      minPct: 68,
      maxPct: 80,
      minValue: z2Min,
      maxValue: r1(z3Min - 0.1),
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Z3 · Base Tempo',
      stageLabel: 'BASE PACE',
      minPct: 81,
      maxPct: 93,
      minValue: z3Min,
      maxValue: r1(z4Min - 0.1),
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'Z4 · Threshold Push',
      stageLabel: 'THRESHOLD',
      minPct: 94,
      maxPct: 106,
      minValue: z4Min,
      maxValue: r1(z5Min - 0.1),
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Z5 · VO2 / Sprint',
      stageLabel: 'ALL OUT',
      minPct: 107,
      maxPct: 132,
      minValue: z5Min,
      maxValue: z5Max,
    },
  ];
}

/** 5-Color Running Cadence Zones (Steps Per Minute). */
export function getRunningCadenceZones(): ZoneDefinition[] {
  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Walk / Easy',
      stageLabel: 'WALK',
      minPct: 0,
      maxPct: 72,
      minValue: 0,
      maxValue: 144,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Easy Stride',
      stageLabel: 'EASY JOG',
      minPct: 73,
      maxPct: 81,
      minValue: 145,
      maxValue: 162,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Base Turnover',
      stageLabel: 'BASE SPM',
      minPct: 82,
      maxPct: 88,
      minValue: 163,
      maxValue: 175,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'Fast Cadence',
      stageLabel: 'FAST STRIDE',
      minPct: 89,
      maxPct: 93,
      minValue: 176,
      maxValue: 186,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Sprint Turnover',
      stageLabel: 'SPRINT',
      minPct: 94,
      maxPct: 100,
      minValue: 187,
      maxValue: 210,
    },
  ];
}

/** 5-Color Treadmill Incline Zones (% Grade). */
export function getInclineZones(): ZoneDefinition[] {
  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Flat Road',
      stageLabel: 'FLAT',
      minPct: 0,
      maxPct: 10,
      minValue: 0,
      maxValue: 1.4,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Rolling Grade',
      stageLabel: 'ROLLING',
      minPct: 11,
      maxPct: 25,
      minValue: 1.5,
      maxValue: 3.4,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Steady Climb',
      stageLabel: 'CLIMB',
      minPct: 26,
      maxPct: 45,
      minValue: 3.5,
      maxValue: 6.4,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'Steep Hill',
      stageLabel: 'STEEP',
      minPct: 46,
      maxPct: 70,
      minValue: 6.5,
      maxValue: 9.9,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Summit Grade',
      stageLabel: 'SUMMIT',
      minPct: 71,
      maxPct: 100,
      minValue: 10,
      maxValue: 15,
    },
  ];
}

/** 5-Color Rowing Stroke Rate Zones (Strokes Per Minute). */
export function getRowingStrokeRateZones(): ZoneDefinition[] {
  return [
    {
      zone: 1,
      ...ZONE_PALETTE[1],
      name: 'Easy Paddle',
      stageLabel: 'PADDLE',
      minPct: 0,
      maxPct: 50,
      minValue: 0,
      maxValue: 19,
    },
    {
      zone: 2,
      ...ZONE_PALETTE[2],
      name: 'Steady State',
      stageLabel: 'STEADY',
      minPct: 51,
      maxPct: 62,
      minValue: 20,
      maxValue: 23,
    },
    {
      zone: 3,
      ...ZONE_PALETTE[3],
      name: 'Base Rhythm',
      stageLabel: 'RHYTHM',
      minPct: 63,
      maxPct: 74,
      minValue: 24,
      maxValue: 27,
    },
    {
      zone: 4,
      ...ZONE_PALETTE[4],
      name: 'Race Push',
      stageLabel: 'RACE RATE',
      minPct: 75,
      maxPct: 86,
      minValue: 28,
      maxValue: 31,
    },
    {
      zone: 5,
      ...ZONE_PALETTE[5],
      name: 'Sprint Rate',
      stageLabel: 'SPRINT',
      minPct: 87,
      maxPct: 100,
      minValue: 32,
      maxValue: 42,
    },
  ];
}

export function formatBikeGearBadge(telemetry: LiveTelemetry): string {
  const maxRes = telemetry.bikeMaxResistance ?? 32;
  if (telemetry.sport === 'running') {
    const inc = telemetry.inclinePct ?? 0;
    const prefix = telemetry.bikeConnected ? (telemetry.bikeShortLabel || 'TREAD').toUpperCase() : 'INCLINE';
    return `${prefix} ${inc.toFixed(1)}%`;
  }
  if (telemetry.sport === 'rowing') {
    if (!telemetry.bikeConnected) {
      return `DAMPER ${telemetry.resistance}/${Math.min(maxRes, 10)}`;
    }
    const prefix = (telemetry.bikeShortLabel || 'ERG').toUpperCase();
    return telemetry.resistance > 0 ? `${prefix} LV ${telemetry.resistance}` : `${prefix} FTMS`;
  }
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
    case 'ftms-treadmill':
      return `INCLINE ${(telemetry.inclinePct ?? 0).toFixed(1)}%`;
    case 'rsc-footpod':
      return 'BLE FOOTPOD';
    case 'ftms-rower':
      return telemetry.resistance > 0 ? `ROW LV ${telemetry.resistance}` : 'FTMS ROWER';
    case 'echelon-ex-motorized': {
      const prefix = (telemetry.bikeShortLabel || 'ECH').toUpperCase();
      return `${prefix} RES ${telemetry.resistance}/32`;
    }
    default:
      return `RES ${telemetry.resistance}/${maxRes}`;
  }
}
