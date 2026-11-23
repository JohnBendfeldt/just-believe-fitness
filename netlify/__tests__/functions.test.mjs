import { deflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = {
  loginResult: { state: 'authenticated' },
  tokensLoaded: true,
  tokens: { oauth1: 'tok-1', oauth2: 'tok-2' },
  fullName: 'Sam Cyclist',
  uploadResp: { detailedImportResult: { successes: [{ internalId: 778899 }] } },
  importResp: { detailedImportResult: { successes: [{ internalId: 990011 }] } },
  calls: [],
};

vi.mock('garminconnect-js', () => {
  class GarminAuthError extends Error {}
  class GarminRateLimitError extends Error {}

  class GarminClient {
    constructor(opts) {
      this.tokenStore = opts?.tokenStore;
    }
    async login(email, password) {
      mockState.calls.push({ method: 'login', email, hasPassword: Boolean(password) });
      if (mockState.loginResult.state === 'mfa_required') {
        return mockState.loginResult;
      }
      if (this.tokenStore) await this.tokenStore.save(mockState.tokens);
      return mockState.loginResult;
    }
    async resumeLogin(mfaState, code) {
      mockState.calls.push({ method: 'resumeLogin', mfaState, code });
      if (this.tokenStore) await this.tokenStore.save(mockState.tokens);
    }
    async loadTokens() {
      return mockState.tokensLoaded;
    }
    getTokens() {
      return mockState.tokens;
    }
  }

  class Garmin {
    async fullName() {
      return mockState.fullName;
    }
    async uploadActivity(_blob, filename) {
      mockState.calls.push({ method: 'uploadActivity', filename });
      return mockState.uploadResp;
    }
    async importActivity(_blob, filename) {
      mockState.calls.push({ method: 'importActivity', filename });
      return mockState.importResp;
    }
    async setActivityName(id, title) {
      mockState.calls.push({ method: 'setActivityName', id, title });
    }
    async setActivityDescription(id, desc) {
      mockState.calls.push({ method: 'setActivityDescription', id, desc });
    }
    async getLastActivity() {
      return { activityId: 123456 };
    }
  }

  return {
    Garmin,
    GarminClient,
    GarminAuthError,
    GarminRateLimitError,
  };
});

import { handler as stravaHandler } from '../functions/strava-token.mjs';
import { handler as garminHandler } from '../functions/garmin-sync.mjs';

describe('Stateless Serverless Functions (strava-token & garmin-sync)', () => {
  beforeEach(() => {
    vi.stubEnv('STRAVA_CLIENT_ID', '');
    vi.stubEnv('VITE_STRAVA_CLIENT_ID', '');
    vi.stubEnv('STRAVA_CLIENT_SECRET', '');
    vi.stubEnv('GARMIN_EMAIL', '');
    vi.stubEnv('GARMIN_PASSWORD', '');
    vi.stubEnv('GARMIN_PERSONAL_API_KEY', '');
  });

  afterEach(() => {
    mockState.loginResult = { state: 'authenticated' };
    mockState.tokensLoaded = true;
    mockState.calls = [];
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('strava-token: handles GET status probe, 405 guard, 400 validation, and POST OAuth forwarding', async () => {
    const getResp = await stravaHandler({ httpMethod: 'GET' });
    expect(getResp.statusCode).toBe(200);
    expect(getResp.headers['Cache-Control']).toBe('no-store');
    expect(getResp.headers['X-Content-Type-Options']).toBe('nosniff');

    const putResp = await stravaHandler({ httpMethod: 'PUT' });
    expect(putResp.statusCode).toBe(405);

    const missingCreds = await stravaHandler({
      httpMethod: 'POST',
      body: JSON.stringify({ grant_type: 'authorization_code', code: 'abc' }),
    });
    expect(missingCreds.statusCode).toBe(400);

    const badGrant = await stravaHandler({
      httpMethod: 'POST',
      body: JSON.stringify({ client_id: '123', client_secret: '456', grant_type: 'client_credentials' }),
    });
    expect(badGrant.statusCode).toBe(400);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'ok-acc', refresh_token: 'ok-ref', expires_at: 999999 }), {
        status: 200,
      })
    );

    const okPost = await stravaHandler({
      httpMethod: 'POST',
      body: JSON.stringify({
        client_id: '123',
        client_secret: '456',
        code: 'oauth-123',
        grant_type: 'authorization_code',
      }),
    });
    expect(okPost.statusCode).toBe(200);
    expect(okPost.headers['Cache-Control']).toBe('no-store');
    expect(JSON.parse(okPost.body).access_token).toBe('ok-acc');

    // Guard: never pair a rider's personal client_id with a different server STRAVA_CLIENT_SECRET
    vi.stubEnv('STRAVA_CLIENT_ID', '99999');
    vi.stubEnv('STRAVA_CLIENT_SECRET', 'server-secret-only');

    const mismatchedPersonal = await stravaHandler({
      httpMethod: 'POST',
      body: JSON.stringify({
        client_id: '55555',
        client_secret: '',
        code: 'oauth-456',
        grant_type: 'authorization_code',
      }),
    });
    expect(mismatchedPersonal.statusCode).toBe(400);
    expect(JSON.parse(mismatchedPersonal.body).error).toContain('personal Strava Client ID');

    // When client_id matches the server env var, server secret fallback still works for self-hosters
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'srv-acc', refresh_token: 'srv-ref', expires_at: 999999 }), {
        status: 200,
      })
    );
    const matchedServer = await stravaHandler({
      httpMethod: 'POST',
      body: JSON.stringify({
        client_id: '99999',
        client_secret: '',
        code: 'oauth-789',
        grant_type: 'authorization_code',
      }),
    });
    expect(matchedServer.statusCode).toBe(200);
    expect(JSON.parse(matchedServer.body).access_token).toBe('srv-acc');
  });

  it('garmin-sync: handles login, 2FA/MFA, import vs device TCX uploads, and title/notes updates statelessly', async () => {
    const getResp = await garminHandler({ httpMethod: 'GET' });
    expect(getResp.statusCode).toBe(200);

    const badMethod = await garminHandler({ httpMethod: 'DELETE' });
    expect(badMethod.statusCode).toBe(405);

    // 1. MFA challenge on login
    mockState.loginResult = {
      state: 'mfa_required',
      mfaState: { session: 's1', mfaMethod: 'sms' },
    };
    const mfaResp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({ action: 'login', email: 'sam@example.com', password: 'pw' }),
    });
    expect(mfaResp.statusCode).toBe(200);
    expect(JSON.parse(mfaResp.body).mfaRequired).toBe(true);

    // 2. Complete MFA verification
    const verifyResp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'mfa',
        mfaState: { session: 's1' },
        code: '123456',
        email: 'sam@example.com',
      }),
    });
    expect(verifyResp.statusCode).toBe(200);
    expect(JSON.parse(verifyResp.body).athleteName).toBe('Sam Cyclist');

    // 3. Upload in 'import' mode (prevents duplicate Garmin->Strava forwarding) + sets title & description
    const uploadResp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'upload',
        tokens: mockState.tokens,
        tcxXml: '<TrainingCenterDatabase/>',
        filename: 'jbf-ride-1.tcx',
        title: 'Morning Spin',
        description: 'Great burn!',
        uploadMode: 'import',
      }),
    });
    expect(uploadResp.statusCode).toBe(200);
    expect(JSON.parse(uploadResp.body).activityId).toBe(990011);
    expect(mockState.calls.some((c) => c.method === 'importActivity')).toBe(true);
    expect(
      mockState.calls.some((c) => c.method === 'setActivityName' && c.title === 'Morning Spin')
    ).toBe(true);
    expect(
      mockState.calls.some((c) => c.method === 'setActivityDescription' && c.desc === 'Great burn!')
    ).toBe(true);

    // 4. Update metadata on existing Garmin activity
    const metaResp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'update_meta',
        tokens: mockState.tokens,
        activityId: 990011,
        title: 'Renamed Spin',
        description: 'Updated notes!',
      }),
    });
    expect(metaResp.statusCode).toBe(200);

    // 5. Verify pasted local session token JSON statelessly
    const invalidTokenResp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({ action: 'verify_tokens', tokens: '{not-valid-json' }),
    });
    expect(invalidTokenResp.statusCode).toBe(400);

    const verifyTokenResp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'verify_tokens',
        tokens: JSON.stringify({ tokens: mockState.tokens }),
        email: 'sam@example.com',
      }),
    });
    expect(verifyTokenResp.statusCode).toBe(200);
    expect(JSON.parse(verifyTokenResp.body).athleteName).toBe('Sam Cyclist');
    expect(JSON.parse(verifyTokenResp.body).tokens).toEqual(mockState.tokens);
  });

  it('garmin-sync: exchanges Personal API Key (GCDC_) for Bearer token and pulls biometrics + recent workouts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/personalapitoken-service/')) {
        return new Response(JSON.stringify({ access_token: 'garmin-jwt-bearer-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/userprofile-service/userprofile/settings')) {
        return new Response(
          JSON.stringify({
            displayName: 'Sam Rider',
            userData: {
              weight: 79379, // ~175 lbs in grams
              height: 180.34, // 5'11" in cm
              maxHeartRate: 189,
              restingHeartRate: 51,
              cyclingFtp: 235,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/biometric-service/heartRateZones/v2')) {
        return new Response(JSON.stringify([{ sport: 'CYCLING', maxHeartRateUsed: 189 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/weight-service/weight/range/') || url.includes('/fitnessage-service/')) {
        return new Response(null, { status: 204 });
      }
      if (url.includes('/activitylist-service/activities/search/activities')) {
        return new Response(
          JSON.stringify([
            {
              activityId: 55443322,
              activityName: 'Indoor Interval Spin',
              activityType: { typeKey: 'indoor_cycling' },
              startTimeLocal: '2026-11-15 18:10:00',
              duration: 1800,
              distance: 16093.4,
              calories: 410,
              avgPower: 205,
              normPower: 218,
              averageHR: 152,
              maxHR: 179,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const resp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'personal_api_sync',
        apiKey: 'GCDC_test_key_123',
      }),
    });

    expect(resp.statusCode).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.athleteName).toBe('Sam Rider');
    expect(data.importedProfile).toEqual({
      weightLbs: 175,
      heightFeet: 5,
      heightInches: 11,
      maxHrBpm: 189,
      restingHrBpm: 51,
      ftpWatts: 235,
    });
    expect(data.recentActivities).toHaveLength(1);
    expect(data.recentActivities[0]).toMatchObject({
      activityId: 55443322,
      name: 'Indoor Interval Spin',
      typeKey: 'indoor_cycling',
      avgWatts: 205,
      normalizedWatts: 218,
      avgHr: 152,
      caloriesKcal: 410,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(7);
  });

  it('garmin-sync: imports weight, BMI-derived height, HR zones, and cycling FTP from real Personal API schemas when settings omits userData', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/personalapitoken-service/')) {
        return new Response('raw-garmin-jwt-token', { status: 200 });
      }
      if (url.includes('/userprofile-service/userprofile/settings')) {
        // Real Garmin Personal API UserSettingsDTO only returns display prefs (no weight/height/FTP)
        return new Response(
          JSON.stringify({
            displayName: '11111111-2222-3333-4444-555555555555',
            measurementSystem: 'statute_us',
            preferredLocale: 'en',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/biometric-service/heartRateZones/v2')) {
        return new Response(
          JSON.stringify([
            { sport: 'DEFAULT', maxHeartRateUsed: 185, restingHeartRateUsed: 52 },
            { sport: 'CYCLING', maxHeartRateUsed: 188, restingHeartRateUsed: 49 },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/weight-service/weight/range/')) {
        // Weigh-in older than 30 days arrives in previousDateWeight
        return new Response(
          JSON.stringify({
            dailyWeightSummaries: [],
            previousDateWeight: {
              calendarDate: '2026-08-12',
              weight: 79379, // 79.379 kg = 175 lbs
              bmi: 24.4, // sqrt(79.379 / 24.4) = 1.8037 m = 5'11"
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/fitnessage-service/fitnessage/v2/')) {
        return new Response(null, { status: 204 });
      }
      if (url.includes('/activitylist-service/activities/search/activities?start=0&limit=10&activityType=cycling')) {
        return new Response(
          JSON.stringify([
            {
              activityId: 770011,
              activityName: 'Threshold Ride',
              activityType: { typeKey: 'indoor_cycling' },
              ownerFullName: 'John Cyclist',
              startTimeLocal: '2026-11-10 07:00:00',
              duration: 2700,
              distance: 25000,
              calories: 560,
              avgPower: 215,
              normPower: 224,
              averageHR: 158,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/activitylist-service/activities/search/activities?start=0&limit=10')) {
        // Recent list is a run with high running power — must NOT overwrite cycling FTP
        return new Response(
          JSON.stringify([
            {
              activityId: 880022,
              activityName: 'Morning Run',
              activityType: { typeKey: 'running' },
              ownerFullName: 'John Cyclist',
              startTimeLocal: '2026-11-22 08:00:00',
              duration: 1800,
              distance: 5000,
              calories: 390,
              avgPower: 345,
              normPower: 350,
              intensityFactor: 0.92,
              averageHR: 154,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/activity-service/activity/770011')) {
        return new Response(
          JSON.stringify({
            activityId: 770011,
            summaryDTO: {
              normalizedPower: 224,
              functionalThresholdPower: 262,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const resp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({
        action: 'personal_api_sync',
        apiKey: 'GCDC_real_personal_api_key',
      }),
    });

    expect(resp.statusCode).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.athleteName).toBe('John Cyclist');
    expect(data.importedProfile).toEqual({
      weightLbs: 175,
      heightFeet: 5,
      heightInches: 11,
      maxHrBpm: 188,
      restingHrBpm: 49,
      ftpWatts: 262,
    });
  });

  it('garmin-sync: derives height via fitnessage BMI and cycling FTP via NP/IF when direct fields are absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/personalapitoken-service/')) {
        return new Response('jwt-2', { status: 200 });
      }
      if (url.includes('/userprofile-service/userprofile/settings')) {
        return new Response(JSON.stringify({ displayName: 'Alex Rider' }), { status: 200 });
      }
      if (url.includes('/biometric-service/heartRateZones/v2')) {
        return new Response(JSON.stringify([{ sport: 'DEFAULT', maxHeartRateUsed: 192 }]), {
          status: 200,
        });
      }
      if (url.includes('/weight-service/weight/range/')) {
        return new Response(
          JSON.stringify({
            dailyWeightSummaries: [
              {
                summaryDate: '2026-11-20',
                latestWeight: { weight: 83915 }, // 185 lbs, no bmi field
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/fitnessage-service/fitnessage/v2/')) {
        return new Response(
          JSON.stringify({
            components: {
              bmi: { value: 25.1 }, // sqrt(83.915 / 25.1) = 1.828 m = 6'0"
              rhr: { value: 48 },
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes('/activitylist-service/activities/search/activities')) {
        return new Response(
          JSON.stringify([
            {
              activityId: 901122,
              activityName: 'Zwift Ride',
              activityType: { typeKey: 'virtual_ride' },
              duration: 3600,
              normPower: 210,
              intensityFactor: 84, // percentage form (84% = 0.84 -> FTP = 250W)
            },
          ]),
          { status: 200 }
        );
      }
      if (url.includes('/activity-service/activity/901122')) {
        return new Response(
          JSON.stringify({
            activityId: 901122,
            summaryDTO: { normalizedPower: 210, intensityFactor: 0.84 },
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const resp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({ action: 'personal_api_sync', apiKey: 'GCDC_derived_key' }),
    });

    expect(resp.statusCode).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.importedProfile).toEqual({
      weightLbs: 185,
      heightFeet: 6,
      heightInches: 0,
      maxHrBpm: 192,
      restingHrBpm: 48,
      ftpWatts: 250,
    });
  });

  it('garmin-sync: falls back to downloading Garmin activity .FIT ZIP for height, weight, and FTP when weight-service and activity JSON lack them', async () => {
    // Build a minimal valid FIT binary with user_data (msg 79 + dev field) and zones_target (msg 7)
    const buildTestFit = ({ heightCm, weightTenthsKg, ftpWatts, maxHr }) => {
      const records = [];
      // Definition msg 79 (user_data) on local 0 WITH developer data flag (0x60)
      records.push(
        0x60, 0x00, 0x00, 79, 0x00, // local 0, hasDevData, LE, global 79
        2, // 2 standard fields
        2, 1, 0x02, // field 2: height (uint8 cm)
        3, 2, 0x84, // field 3: weight (uint16 0.1 kg)
        1, // 1 developer field (2 trailing bytes to verify dev-field skipping)
        0, 2, 0
      );
      // Data msg for local 0
      records.push(
        0x00,
        heightCm & 0xff,
        weightTenthsKg & 0xff,
        (weightTenthsKg >> 8) & 0xff,
        0xaa,
        0xbb // dev field payload
      );
      // Definition msg 7 (zones_target) on local 1
      records.push(
        0x41, 0x00, 0x00, 7, 0x00, // local 1, LE, global 7
        2,
        1, 1, 0x02, // field 1: max_heart_rate (uint8)
        3, 2, 0x84 // field 3: functional_threshold_power (uint16)
      );
      // Data msg for local 1
      records.push(0x01, maxHr & 0xff, ftpWatts & 0xff, (ftpWatts >> 8) & 0xff);

      const dataBuf = Buffer.from(records);
      const header = Buffer.alloc(14);
      header.writeUInt8(14, 0);
      header.writeUInt8(0x20, 1);
      header.writeUInt16LE(21141, 2);
      header.writeUInt32LE(dataBuf.length, 4);
      header.write('.FIT', 8, 'ascii');
      header.writeUInt16LE(0, 12);
      const crc = Buffer.alloc(2);
      return Buffer.concat([header, dataBuf, crc]);
    };

    // Pack FIT bytes into a deflated ZIP with data-descriptor flag (bit 3, local sizes = 0)
    const buildZipWithFit = (filename, fitBytes) => {
      const nameBuf = Buffer.from(filename, 'utf8');
      const compressed = deflateRawSync(fitBytes);
      const lh = Buffer.alloc(30 + nameBuf.length);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(20, 4);
      lh.writeUInt16LE(0x0008, 6); // bit 3 data descriptor
      lh.writeUInt16LE(8, 8); // deflate
      lh.writeUInt32LE(0, 18); // local compressed size = 0
      lh.writeUInt32LE(0, 22); // local uncompressed size = 0
      lh.writeUInt16LE(nameBuf.length, 26);
      nameBuf.copy(lh, 30);

      const cdOffset = lh.length + compressed.length;
      const cd = Buffer.alloc(46 + nameBuf.length);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4);
      cd.writeUInt16LE(20, 6);
      cd.writeUInt16LE(0x0008, 8);
      cd.writeUInt16LE(8, 10);
      cd.writeUInt32LE(compressed.length, 20);
      cd.writeUInt32LE(fitBytes.length, 24);
      cd.writeUInt16LE(nameBuf.length, 28);
      cd.writeUInt32LE(0, 42); // local header offset
      nameBuf.copy(cd, 46);

      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(1, 8);
      eocd.writeUInt16LE(1, 10);
      eocd.writeUInt32LE(cd.length, 12);
      eocd.writeUInt32LE(cdOffset, 16);

      return Buffer.concat([lh, compressed, cd, eocd]);
    };

    const runZip = buildZipWithFit(
      '6001_ACTIVITY.fit',
      buildTestFit({ heightCm: 178, weightTenthsKg: 771, ftpWatts: 380, maxHr: 190 }) // running power 380 must be ignored
    );
    const bikeZip = buildZipWithFit(
      '6002_ACTIVITY.fit',
      buildTestFit({ heightCm: 0xff, weightTenthsKg: 0xffff, ftpWatts: 245, maxHr: 187 })
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/personalapitoken-service/')) {
        return new Response('jwt-fit-fallback', { status: 200 });
      }
      if (url.includes('/userprofile-service/userprofile/settings')) {
        return new Response(JSON.stringify({ displayName: 'Jordan' }), { status: 200 });
      }
      if (url.includes('/biometric-service/heartRateZones/v2')) {
        return new Response(
          JSON.stringify([{ sport: 'CYCLING', maxHeartRateUsed: 187, restingHeartRateUsed: 53 }]),
          { status: 200 }
        );
      }
      if (url.includes('/weight-service/weight/range/') || url.includes('/fitnessage-service/')) {
        return new Response(null, { status: 204 });
      }
      if (url.includes('activityType=cycling')) {
        return new Response(
          JSON.stringify([
            {
              activityId: 6002,
              activityName: 'Indoor Spin',
              activityType: { typeKey: 'indoor_cycling' },
              avgPower: 195,
            },
          ]),
          { status: 200 }
        );
      }
      if (url.includes('/activitylist-service/activities/search/activities')) {
        return new Response(
          JSON.stringify([
            {
              activityId: 6001,
              activityName: 'Watch Run',
              activityType: { typeKey: 'running' },
            },
          ]),
          { status: 200 }
        );
      }
      if (url.includes('/activity-service/activity/6002')) {
        return new Response(JSON.stringify({ activityId: 6002, summaryDTO: { averagePower: 195 } }), {
          status: 200,
        });
      }
      if (url.includes('/download-service/files/activity/6001')) {
        return new Response(runZip, { status: 200 });
      }
      if (url.includes('/download-service/files/activity/6002')) {
        return new Response(bikeZip, { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const resp = await garminHandler({
      httpMethod: 'POST',
      body: JSON.stringify({ action: 'personal_api_sync', apiKey: 'GCDC_fit_fallback_key' }),
    });

    expect(resp.statusCode).toBe(200);
    const data = JSON.parse(resp.body);
    expect(data.importedProfile).toEqual({
      weightLbs: 170, // 77.1 kg -> 170 lbs from Garmin watch run user_data
      heightFeet: 5,
      heightInches: 10, // 178 cm -> 70 in = 5'10" from Garmin watch run user_data
      maxHrBpm: 187,
      restingHrBpm: 53,
      ftpWatts: 245, // 245W from cycling FIT zones_target (NOT 380W from run!)
    });
  });
});
