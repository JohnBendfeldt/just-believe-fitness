export type ZoneId = 1 | 2 | 3 | 4 | 5;

export type PowerCurveType = 'auto' | 'ex3-vector' | 'sport-compact' | 'echelon-official';

export type BikeFamilyId =
  | 'echelon-ex-motorized'
  | 'echelon-sport-knob'
  | 'ftms-bike'
  | 'power-meter-bike'
  | 'cadence-bike';

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
  powerWatts: number;
  cadenceRpm: number;
  resistance: number;
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
  coachingNote: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  subtitle: string;
  category: 'free' | 'jbf' | 'hiit' | 'climb' | 'endurance' | 'distance';
  isFreeRide?: boolean;
  /** Marks a dedicated 20-minute FTP benchmark test (95% of 20-min avg watts = FTP). */
  isFtpTest?: boolean;
  /** Total target distance (meters) for distance-based challenge rides (e.g. 50K, 50 mi, 100K, 100 mi). */
  targetDistanceMeters?: number;
  /** Native display unit for distance-based challenge rides. */
  distanceUnit?: 'km' | 'mi';
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
  unit: 'km' | 'mi';
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
  };
}

export interface SavedRide {
  id: string;
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
