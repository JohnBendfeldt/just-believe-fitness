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
      if (url.includes('/activitylist-service/activities/search/activities')) {
        return new Response(
          JSON.stringify([
            {
              activityId: 55443322,
              activityName: 'Indoor Interval Spin',
              activityTypeDTO: { typeKey: 'indoor_cycling' },
              startTimeLocal: '2026-11-15 18:10:00',
              duration: 1800,
              distance: 16093.4,
              calories: 410,
              averagePower: 205,
              normalizedPower: 218,
              averageHR: 152,
              maxHR: 179,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/user-settings') || url.includes('/socialProfile') || url.includes('latestFunctionalThresholdPower')) {
        return new Response('{}', { status: 404 });
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
      avgWatts: 205,
      avgHr: 152,
      caloriesKcal: 410,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(7);
  });
});
