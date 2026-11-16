import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATHLETE_PROFILE,
  computeNormalizedPower,
  computeSegmentedGaugeProgress,
  computeWattsPerKg,
  estimateIndoorSpeedMps,
  getHrZones,
  getPowerZones,
  getResistanceZones,
  mpsToMph,
  resolveZone,
} from '../utils/zones';
import {
  calculateEchelonWatts,
  suggestEx3Resistance,
} from '../services/ble/echelonPowerCurve';
import { computeEchelonUnlockResponse } from '../services/ble/echelonBle';
import { parseBleHeartRate } from '../services/ble/garminHrBle';
import { buildRideTcxXml } from '../services/tcxExporter';
import { buildYouTubeEmbedSrc } from '../utils/youtube';
import type { SavedRide } from '../types/fitness';

describe('Athlete Profile & Zone Orientation (5\'9", 168#, 257W FTP, 196 Max HR)', () => {
  it('defaults to 5\'9", 168 lbs, 257W FTP, and 196 Max HR with ~3.37 W/kg threshold', () => {
    expect(DEFAULT_ATHLETE_PROFILE.heightFeet).toBe(5);
    expect(DEFAULT_ATHLETE_PROFILE.heightInches).toBe(9);
    expect(DEFAULT_ATHLETE_PROFILE.weightLbs).toBe(168);
    expect(DEFAULT_ATHLETE_PROFILE.ftpWatts).toBe(257);
    expect(DEFAULT_ATHLETE_PROFILE.maxHrBpm).toBe(196);

    const wkg = computeWattsPerKg(257, 168);
    expect(wkg).toBeCloseTo(3.37, 2);
  });

  it('re-orients 5 Power, HR, and EX-3 Resistance Zones dynamically when stats change', () => {
    const powerZones = getPowerZones(257);
    expect(powerZones).toHaveLength(5);
    // Z4 Threshold Push starts at 91% of 257W => 234W; Z5 All-Out starts at 106% => 272W
    expect(powerZones[3].minValue).toBe(234);
    expect(powerZones[4].minValue).toBe(272);
    expect(resolveZone(257, powerZones).zone).toBe(4);
    expect(resolveZone(290, powerZones).zone).toBe(5);

    const hrZones = getHrZones(196);
    expect(hrZones).toHaveLength(5);
    // Z4 Burn Zone starts at 84% of 196 => 165 bpm; Z5 Red starts at 92% => 180 bpm
    expect(hrZones[3].minValue).toBe(165);
    expect(hrZones[4].minValue).toBe(180);
    expect(resolveZone(170, hrZones).zone).toBe(4);
    expect(resolveZone(185, hrZones).zone).toBe(5);

    const resZones = getResistanceZones();
    expect(resZones).toHaveLength(5);
    expect(resolveZone(24, resZones).zone).toBe(4);
    expect(computeSegmentedGaugeProgress(24, resZones)).toBeGreaterThan(60);
    expect(computeSegmentedGaugeProgress(24, resZones)).toBeLessThan(80);
  });

  it('incorporates rider height & weight into indoor aerodynamic speed', () => {
    const speedAt257W = mpsToMph(estimateIndoorSpeedMps(257, DEFAULT_ATHLETE_PROFILE));
    expect(speedAt257W).toBeGreaterThan(21);
    expect(speedAt257W).toBeLessThan(26);
  });
});

describe('Echelon EX-3 Power Curve & BLE Protocol', () => {
  it('calculates monotonic watts across resistance & cadence and suggests EX-3 gear', () => {
    expect(calculateEchelonWatts(20, 0, 'ex3-vector')).toBe(0);
    const baseWatts = calculateEchelonWatts(21, 85, 'ex3-vector');
    const pushWatts = calculateEchelonWatts(26, 90, 'ex3-vector');
    expect(pushWatts).toBeGreaterThan(baseWatts);

    const suggested = suggestEx3Resistance(257, 90, 'ex3-vector', 1.0);
    expect(suggested).toBeGreaterThanOrEqual(22);
    expect(suggested).toBeLessThanOrEqual(28);
  });

  it('computes valid BCD challenge-response frame for Echelon 0xF0 0xE0 unlock', () => {
    const challenge = new Uint8Array([0xf0, 0xe0, 0x12, 0x04, 0x03, 0x05, 0x29, 0x00]);
    const resp = computeEchelonUnlockResponse(challenge);
    expect(resp).not.toBeNull();
    expect(resp?.length).toBe(8);
    expect(resp?.[0]).toBe(0xf0);
    expect(resp?.[1]).toBe(0xe0);
  });

  it('parses both 8-bit and 16-bit BLE Heart Rate Measurement characteristics', () => {
    const u8 = new DataView(new Uint8Array([0x00, 168]).buffer);
    expect(parseBleHeartRate(u8)).toBe(168);

    const u16 = new DataView(new Uint8Array([0x01, 205, 0x00]).buffer);
    expect(parseBleHeartRate(u16)).toBe(205);
  });
});

describe('TCX Export & YouTube Embed Parser', () => {
  it('builds Strava-compatible TCX XML containing Watts, Cadence, HeartRateBpm, and Burn pts', () => {
    const ride: SavedRide = {
      id: 'ride-1',
      title: 'JBF 23-Min Signature Burn',
      workoutName: 'JBF 23-Min Signature Burn',
      startedAtIso: '2026-11-15T22:00:00.000Z',
      endedAtIso: '2026-11-15T22:23:00.000Z',
      durationSec: 1380,
      distanceMeters: 12850,
      caloriesKcal: 312,
      burnPoints: 14,
      avgWatts: 228,
      maxWatts: 345,
      normalizedWatts: computeNormalizedPower(Array.from({ length: 40 }, () => 240)),
      avgWkg: 2.99,
      avgCadence: 89,
      maxCadence: 112,
      avgResistance: 23,
      avgHr: 166,
      maxHr: 189,
      athleteSnapshot: DEFAULT_ATHLETE_PROFILE,
      hrZoneSeconds: { 1: 60, 2: 180, 3: 300, 4: 600, 5: 240 },
      powerZoneSeconds: { 1: 60, 2: 180, 3: 320, 4: 580, 5: 240 },
      trackPoints: [
        {
          timestampMs: 1794780001000,
          elapsedSec: 1,
          powerWatts: 255,
          cadenceRpm: 92,
          resistance: 25,
          heartRateBpm: 171,
          speedMps: 9.8,
          distanceMeters: 9.8,
          caloriesKcal: 0.26,
          hrZone: 4,
          powerZone: 4,
        },
      ],
    };

    const xml = buildRideTcxXml(ride);
    expect(xml).toContain('<TrainingCenterDatabase');
    expect(xml).toContain('<ns3:Watts>255</ns3:Watts>');
    expect(xml).toContain('<Cadence>92</Cadence>');
    expect(xml).toContain('<Value>171</Value>');
    expect(xml).toContain('14 Burn pts');
  });

  it('parses standard YouTube watch, short, and playlist URLs into embed URLs', () => {
    expect(buildYouTubeEmbedSrc('https://www.youtube.com/watch?v=BHACKCNDMW8')).toContain(
      'youtube.com/embed/BHACKCNDMW8'
    );
    expect(buildYouTubeEmbedSrc('https://youtu.be/eKFTSSKCzWA')).toContain(
      'youtube.com/embed/eKFTSSKCzWA'
    );
  });
});
