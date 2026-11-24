export type ZoneId = 1 | 2 | 3 | 4 | 5;

export type SportMode = 'cycling' | 'running' | 'rowing';

export type PowerCurveType = 'auto' | 'ex3-vector' | 'sport-compact' | 'echelon-official';

export type BikeFamilyId =
  | 'echelon-ex-motorized'
  | 'echelon-sport-knob'
  | 'ftms-bike'
  | 'power-meter-bike'
  | 'cadence-bike'
  | 'ftms-treadmill'
  | 'rsc-footpod'
  | 'ftms-rower';

export type BikeUnlockStatus = 'idle' | 'unlocking' | 'unlocked' | 'failed';

export interface AthleteProfile {
  name: string;
  heightFeet: number;
  heightInches: number;
  weightLbs: number;
  ftpWatts: number;
  maxHrBpm: number;
  restingHrBpm: number;
  powerCurve: PowerCurveType;
  wattGain: number;
  /** Runner threshold pace in seconds per mile (default 540s = 9:00 /mi). */
  runThresholdPaceSecPerMile?: number;
  /** Rower threshold power (Row FTP) in watts (defaults to ftpWatts when unset). */
  rowFtpWatts?: number;
}

export interface ZoneDefinition {
  zone: ZoneId;
  key: 'grey' | 'blue' | 'green' | 'orange' | 'red';
  name: string;
  stageLabel: string;
  color: string;
  colorSoft: string;
  colorStrong: string;
  textOnFill: string;
  minPct: number;
  maxPct: number;
  minValue: number;
  maxValue: number | null;
}

export interface LiveTelemetry {
  sport?: SportMode;
  powerWatts: number;
  cadenceRpm: number;
  resistance: number;
  /** Treadmill incline percentage (e.g. 0.0 to 15.0%). */
  inclinePct?: number;
  /** Rowing split pace in seconds per 500 meters (e.g. 125 = 2:05 /500m). */
  paceSecPer500m?: number;
  /** Cumulative stroke count from an FTMS rower. */
  strokeCount?: number;
  heartRateBpm: number;
  speedMph: number;
  distanceMeters: number;
  bikeConnected: boolean;
  bikeName: string | null;
  bikeStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  bikeUnlockStatus?: BikeUnlockStatus;
  bikeFamily?: BikeFamilyId | null;
  bikeShortLabel?: string | null;
  bikeHasMotorizedResistance?: boolean;
  bikeHasMotorizedSpeed?: boolean;
  bikeHasMotorizedIncline?: boolean;
  bikeMaxResistance?: number;
  hrConnected: boolean;
  hrName: string | null;
  hrStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  isSimulating: boolean;
}

export interface TrackPoint {
  timestampMs: number;
  elapsedSec: number;
  powerWatts: number;
  cadenceRpm: number;
  resistance: number;
  inclinePct?: number;
  paceSecPer500m?: number;
  heartRateBpm: number;
  speedMps: number;
  distanceMeters: number;
  caloriesKcal: number;
  hrZone: ZoneId;
  powerZone: ZoneId;
}

export type EffortCue = 'warmup' | 'base' | 'push' | 'all-out' | 'recovery';

export interface WorkoutSegment {
  id: string;
  label: string;
  cue: EffortCue;
  durationSec: number;
  /** Distance length (meters) for distance-driven challenge stages. */
  distanceMeters?: number;
  targetZone: ZoneId;
  ftpPctRange: [number, number];
  cadenceRange: [number, number];
  /** Optional target treadmill incline (%) for running workouts. */
  inclinePct?: number;
  /** Optional target speed fraction of runner threshold speed (e.g. [0.82, 0.92]). */
  pacePctRange?: [number, number];
  coachingNote: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  subtitle: string;
  sport?: SportMode;
  category: 'free' | 'jbf' | 'hiit' | 'climb' | 'endurance' | 'distance';
  isFreeRide?: boolean;
  /** Marks a dedicated 20-minute FTP benchmark test (95% of 20-min avg watts = FTP). */
  isFtpTest?: boolean;
  /** Total target distance (meters) for distance-based challenge rides (e.g. 50K, 50 mi, 5K, 2000m). */
  targetDistanceMeters?: number;
  /** Native display unit for distance-based challenge workouts. */
  distanceUnit?: 'km' | 'mi' | 'm';
  segments: WorkoutSegment[];
}

export interface FtpTestResult {
  /** Best contiguous 20-minute average power (or full-test average if finished within 1 min of 20:00). */
  avg20MinWatts: number;
  /** Calculated Functional Threshold Power: Math.round(avg20MinWatts * 0.95). */
  estimatedFtpWatts: number;
  /** Rider's FTP before this ride. */
  previousFtpWatts: number;
  /** True when the rider completed the full 20-minute benchmark window. */
  completedFull20Min: boolean;
  /** True when detected during a dedicated FTP Test workout vs an automatic breakthrough PR on another ride. */
  isDedicatedTest: boolean;
}

export interface DistanceProgressInfo {
  unit: 'km' | 'mi' | 'm';
  totalTargetMeters: number;
  totalRemainingMeters: number;
  overallProgressPct: number;
  stageTargetMeters: number;
  stageRemainingMeters: number;
  stageProgressPct: number;
  etaRemainingSec: number | null;
  isGoalComplete: boolean;
}

export interface ActiveSegmentSummary {
  index: number;
  totalSegments: number;
  segment: WorkoutSegment;
  remainingSec: number;
  distanceMode?: DistanceProgressInfo;
  nextSegment: WorkoutSegment | null;
  targets: {
    minWatts: number;
    maxWatts: number;
    midWatts: number;
    suggestedResistanceLow: number;
    suggestedResistanceHigh: number;
    /** Target running speed range (mph) when sport === 'running'. */
    targetSpeedMphRange?: [number, number];
    /** Target treadmill incline (%) when sport === 'running'. */
    targetInclinePct?: number;
    /** Target rowing /500m split range in seconds [fasterSplitSec, slowerSplitSec] when sport === 'rowing'. */
    targetSplitSecRange?: [number, number];
  };
}

export interface SavedRide {
  id: string;
  sport?: SportMode;
  title: string;
  notes?: string;
  workoutName: string;
  bikeLabel?: string;
  startedAtIso: string;
  endedAtIso: string;
  durationSec: number;
  distanceMeters: number;
  caloriesKcal: number;
  burnPoints: number;
  avgWatts: number;
  maxWatts: number;
  normalizedWatts: number;
  avgWkg: number;
  avgCadence: number;
  maxCadence: number;
  avgResistance: number;
  avgInclinePct?: number;
  maxInclinePct?: number;
  avgSplitSecPer500m?: number;
  totalStrokes?: number;
  avgHr: number;
  maxHr: number;
  athleteSnapshot: AthleteProfile;
  hrZoneSeconds: Record<ZoneId, number>;
  powerZoneSeconds: Record<ZoneId, number>;
  trackPoints: TrackPoint[];
  ftpTestResult?: FtpTestResult;
  stravaUploadId?: number;
  stravaActivityId?: number;
  stravaUploadedAtIso?: string;
  garminActivityId?: number;
  garminUploadedAtIso?: string;
}

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAtSec?: number;
  athleteName?: string;
  athleteAvatar?: string;
  athleteId?: number;
}

export interface GarminImportedProfile {
  weightLbs?: number;
  heightFeet?: number;
  heightInches?: number;
  maxHrBpm?: number;
  restingHrBpm?: number;
  ftpWatts?: number;
}

export interface GarminRemoteActivity {
  activityId: number;
  name: string;
  typeKey: string;
  startedAtLocal: string;
  durationSec: number;
  distanceMeters: number;
  caloriesKcal: number;
  avgWatts?: number;
  normalizedWatts?: number;
  avgHr?: number;
  maxHr?: number;
}

export interface GarminConfig {
  email?: string;
  athleteName?: string;
  tokens?: Record<string, unknown>;
  connectedAtIso?: string;
  personalApiKey?: string;
  recentActivities?: GarminRemoteActivity[];
  lastPersonalSyncAtIso?: string;
}
