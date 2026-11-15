export type ZoneId = 1 | 2 | 3 | 4 | 5;

export type PowerCurveType = 'ex3-vector' | 'echelon-official';

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
  otfName: string;
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
  targetZone: ZoneId;
  ftpPctRange: [number, number];
  cadenceRange: [number, number];
  coachingNote: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  subtitle: string;
  category: 'free' | 'otf' | 'hiit' | 'climb' | 'endurance';
  isFreeRide?: boolean;
  segments: WorkoutSegment[];
}

export interface SavedRide {
  id: string;
  title: string;
  workoutName: string;
  startedAtIso: string;
  endedAtIso: string;
  durationSec: number;
  distanceMeters: number;
  caloriesKcal: number;
  splatPoints: number;
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
  stravaUploadId?: number;
  stravaActivityId?: number;
  stravaUploadedAtIso?: string;
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
