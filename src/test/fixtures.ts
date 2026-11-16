import type { AthleteProfile, LiveTelemetry, SavedRide, TrackPoint } from '../types/fitness';
import { DEFAULT_ATHLETE_PROFILE, computeNormalizedPower } from '../utils/zones';

export function makeSampleTrackPoints(count = 40): TrackPoint[] {
  return Array.from({ length: count }, (_, idx) => {
    const isPush = idx % 10 >= 5;
    const watts = isPush ? 152 : 122;
    const hr = isPush ? 156 : 138;
    return {
      timestampMs: 1794780000000 + (idx + 1) * 1000,
      elapsedSec: idx + 1,
      powerWatts: watts,
      cadenceRpm: isPush ? 92 : 84,
      resistance: isPush ? 21 : 17,
      heartRateBpm: hr,
      speedMps: isPush ? 8.4 : 7.6,
      distanceMeters: (idx + 1) * 8.0,
      caloriesKcal: (idx + 1) * 0.14,
      hrZone: isPush ? 4 : 3,
      powerZone: isPush ? 4 : 3,
    };
  });
}

export function makeSampleRide(overrides: Partial<SavedRide> = {}): SavedRide {
  const points = overrides.trackPoints ?? makeSampleTrackPoints(40);
  const athleteSnapshot: AthleteProfile = {
    ...DEFAULT_ATHLETE_PROFILE,
    ...(overrides.athleteSnapshot ?? {}),
  };

  return {
    id: 'ride-sample-1',
    title: '23-Min Signature Burn',
    workoutName: '23-Min Signature Burn',
    startedAtIso: '2026-11-15T22:00:00.000Z',
    endedAtIso: '2026-11-15T22:23:00.000Z',
    durationSec: 1380,
    distanceMeters: 10850,
    caloriesKcal: 245,
    burnPoints: 14,
    avgWatts: 142,
    maxWatts: 215,
    normalizedWatts: computeNormalizedPower(points.map((p) => p.powerWatts)),
    avgWkg: 1.9,
    avgCadence: 88,
    maxCadence: 108,
    avgResistance: 19,
    avgHr: 152,
    maxHr: 174,
    athleteSnapshot,
    hrZoneSeconds: { 1: 60, 2: 180, 3: 300, 4: 600, 5: 240 },
    powerZoneSeconds: { 1: 60, 2: 180, 3: 320, 4: 580, 5: 240 },
    trackPoints: points,
    ...overrides,
  };
}

export function makeSampleTelemetry(overrides: Partial<LiveTelemetry> = {}): LiveTelemetry {
  return {
    powerWatts: 146,
    cadenceRpm: 88,
    resistance: 19,
    heartRateBpm: 154,
    speedMph: 18.6,
    distanceMeters: 4200,
    bikeConnected: true,
    bikeName: 'ECH-EX3-101',
    bikeStatus: 'connected',
    hrConnected: true,
    hrName: 'Polar H10',
    hrStatus: 'connected',
    isSimulating: false,
    ...overrides,
  };
}
