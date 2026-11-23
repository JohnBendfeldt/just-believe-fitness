import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_YOUTUBE_PRESETS,
  deleteSavedRide,
  listSavedRides,
  loadAthleteProfile,
  loadGarminConfig,
  loadStravaConfig,
  loadYouTubePresets,
  saveAthleteProfile,
  saveGarminConfig,
  saveRideToDb,
  saveStravaConfig,
  saveYouTubeState,
} from '../services/storage';
import { buildRideTcxXml, downloadRideTcx } from '../services/tcxExporter';
import {
  buildRideFitBytes,
  computeFitCrc,
  convertTcxXmlToFitBytes,
  downloadRideFit,
} from '../services/fitExporter';
import { DEFAULT_ATHLETE_PROFILE } from '../utils/zones';
import { makeSampleRide } from '../test/fixtures';

describe('100% Local-First Browser Storage (localStorage & IndexedDB)', () => {
  it('persists AthleteProfile, StravaConfig, GarminConfig, and YouTube presets locally and recovers from corrupted JSON', () => {
    // Defaults when empty
    expect(loadAthleteProfile()).toEqual(DEFAULT_ATHLETE_PROFILE);
    expect(loadGarminConfig()).toEqual({});
    expect(loadYouTubePresets().presets).toEqual(DEFAULT_YOUTUBE_PRESETS);

    // Save & reload custom athlete profile
    const customProfile = {
      ...DEFAULT_ATHLETE_PROFILE,
      name: 'Alex',
      ftpWatts: 210,
      maxHrBpm: 188,
    };
    saveAthleteProfile(customProfile);
    expect(loadAthleteProfile()).toEqual(customProfile);

    // Save & reload Strava + Garmin session configs
    saveStravaConfig({
      clientId: '12345',
      clientSecret: 'sec',
      accessToken: 'tok-1',
      refreshToken: 'ref-1',
      athleteName: 'Alex Rider',
    });
    expect(loadStravaConfig().athleteName).toBe('Alex Rider');

    saveGarminConfig({
      email: 'alex@example.com',
      athleteName: 'Alex Garmin',
      tokens: { oauth1: 'abc', oauth2: 'def' },
    });
    expect(loadGarminConfig().athleteName).toBe('Alex Garmin');

    // Save & reload YouTube presets
    saveYouTubeState('https://youtu.be/eKFTSSKCzWA', [
      { id: 'custom-1', title: 'Climb Mix', videoIdOrUrl: 'https://youtu.be/eKFTSSKCzWA' },
    ]);
    expect(loadYouTubePresets().lastUrl).toBe('https://youtu.be/eKFTSSKCzWA');

    // Corrupted JSON resilience
    window.localStorage.setItem('jb_fitness_athlete_v1', '{broken-json');
    window.localStorage.setItem('jbf_garmin_connect_v1', '{broken-json');
    expect(loadAthleteProfile()).toEqual(DEFAULT_ATHLETE_PROFILE);
    expect(loadGarminConfig()).toEqual({});
  });

  it('saves, updates, sorts newest-first, and deletes workout rides in IndexedDB', async () => {
    const olderRide = makeSampleRide({
      id: 'ride-older',
      title: 'Morning Base Spin',
      startedAtIso: '2026-11-14T14:00:00.000Z',
    });
    const newerRide = makeSampleRide({
      id: 'ride-newer',
      title: 'Evening Signature Burn',
      startedAtIso: '2026-11-15T22:00:00.000Z',
    });

    await saveRideToDb(olderRide);
    await saveRideToDb(newerRide);

    const listed = await listSavedRides();
    expect(listed.map((r) => r.id)).toEqual(['ride-newer', 'ride-older']);

    // Update notes & dual cloud IDs on newer ride
    await saveRideToDb({
      ...newerRide,
      notes: 'Felt strong on Push blocks!',
      garminActivityId: 998877,
      stravaActivityId: 112233,
    });

    const afterUpdate = await listSavedRides();
    expect(afterUpdate[0].notes).toBe('Felt strong on Push blocks!');
    expect(afterUpdate[0].garminActivityId).toBe(998877);
    expect(afterUpdate[0].stravaActivityId).toBe(112233);

    // Delete rides cleanly
    await deleteSavedRide('ride-newer');
    await deleteSavedRide('ride-older');
    expect(await listSavedRides()).toEqual([]);
  });
});

describe('Garmin & Strava TrainingCenterDatabase (.TCX) Exporter', () => {
  it('generates valid TCX v2 XML with Watts, Cadence, HeartRateBpm, Burn Points, and XML escaping', () => {
    const ride = makeSampleRide({
      title: '23-Min Signature Burn',
      notes: 'Push & Surge <All-Out> "Test"',
      burnPoints: 16,
    });

    const xml = buildRideTcxXml(ride);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<TrainingCenterDatabase');
    expect(xml).toContain('<Activity Sport="Biking">');
    expect(xml).toContain('Push &amp; Surge &lt;All-Out&gt; &quot;Test&quot;');
    expect(xml).toContain('Just Believe Fitness');
    expect(xml).toContain('Burn Points: 16');
    expect(xml).not.toContain('<Notes>23-Min Signature Burn');
    expect(xml).toContain('\njbfit.studio</Notes>');
    expect(xml).toContain('<ns3:Watts>122</ns3:Watts>');
    expect(xml).toContain('<Cadence>84</Cadence>');
    expect(xml).toContain('<HeartRateBpm>');

    // Whole-second UTC timestamps (no millisecond jitter) and strictly increasing across duplicate-second inputs
    expect(xml).not.toMatch(/<Time>[^<]*\.\d+Z<\/Time>/);
    const jitteredRide = makeSampleRide({
      startedAtIso: '2026-11-15T22:00:00.480Z',
      trackPoints: [
        { ...ride.trackPoints[0], timestampMs: Date.parse('2026-11-15T22:00:00.480Z') },
        { ...ride.trackPoints[1], timestampMs: Date.parse('2026-11-15T22:00:00.490Z') },
      ],
    });
    const jitteredXml = buildRideTcxXml(jitteredRide);
    expect(jitteredXml).toContain('<Time>2026-11-15T22:00:00Z</Time>');
    expect(jitteredXml).toContain('<Time>2026-11-15T22:00:01Z</Time>');

    // Ride without HR stream omits <AverageHeartRateBpm> cleanly
    const noHrRide = makeSampleRide({
      avgHr: 0,
      maxHr: 0,
      trackPoints: ride.trackPoints.map((p) => ({ ...p, heartRateBpm: 0 })),
    });
    const noHrXml = buildRideTcxXml(noHrRide);
    expect(noHrXml).not.toContain('<AverageHeartRateBpm>');
  });

  it('triggers a .tcx file download cleanly in the browser', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const ride = makeSampleRide({ id: 'ride-dl-1', title: '20-Min HIIT Ride' });

    downloadRideTcx(ride);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Garmin Binary .FIT v2.0 Exporter & TCX -> FIT Converter', () => {
  it('encodes a valid FIT v2.0 binary file with .FIT signature, valid header/trailer CRCs, and device presets', () => {
    const ride = makeSampleRide({ title: '23-Min Signature Burn', burnPoints: 14 });
    const bytes = buildRideFitBytes(ride, 'edge-830');

    // 14-byte FIT header + ".FIT" ASCII signature
    expect(bytes[0]).toBe(14);
    expect(bytes[1]).toBe(0x20);
    expect(String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])).toBe('.FIT');

    const dataSize =
      bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    expect(bytes.length).toBe(14 + dataSize + 2);

    // Header CRC-16 over bytes 0..11 must match bytes 12..13
    const expectedHeaderCrc = computeFitCrc(bytes, 0, 12);
    const actualHeaderCrc = bytes[12] | (bytes[13] << 8);
    expect(actualHeaderCrc).toBe(expectedHeaderCrc);

    // Trailer CRC-16 over entire file excluding trailer must match last 2 bytes
    const expectedFileCrc = computeFitCrc(bytes, 0, bytes.length - 2);
    const actualFileCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
    expect(actualFileCrc).toBe(expectedFileCrc);
  });

  it('converts an existing .TCX XML file into a valid Garmin .FIT file preserving telemetry', () => {
    const original = makeSampleRide({ title: 'Past Echelon Ride', burnPoints: 10 });
    const xml = buildRideTcxXml(original);

    const { bytes, ride } = convertTcxXmlToFitBytes(xml, 'tacx-app', 'past-echelon-ride.tcx');
    expect(ride.trackPoints.length).toBe(original.trackPoints.length);
    expect(ride.avgWatts).toBeGreaterThan(100);
    expect(ride.avgHr).toBeGreaterThan(100);
    expect(String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])).toBe('.FIT');

    const expectedFileCrc = computeFitCrc(bytes, 0, bytes.length - 2);
    const actualFileCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
    expect(actualFileCrc).toBe(expectedFileCrc);
  });

  it('triggers a .fit file download cleanly in the browser', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const ride = makeSampleRide({ id: 'ride-fit-1', title: '23-Min Signature Burn' });

    downloadRideFit(ride, 'edge-830');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
