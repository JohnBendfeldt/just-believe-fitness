import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    mockState.loginResult = { state: 'authenticated' };
    mockState.tokensLoaded = true;
    mockState.calls = [];
    vi.restoreAllMocks();
  });

  it('strava-token: handles GET status probe, 405 guard, 400 validation, and POST OAuth forwarding', async () => {
    const getResp = await stravaHandler({ httpMethod: 'GET' });
    expect(getResp.statusCode).toBe(200);

    const putResp = await stravaHandler({ httpMethod: 'PUT' });
    expect(putResp.statusCode).toBe(405);

    const missingCreds = await stravaHandler({
      httpMethod: 'POST',
      body: JSON.stringify({ grant_type: 'authorization_code', code: 'abc' }),
    });
    expect(missingCreds.statusCode).toBe(400);

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
    expect(JSON.parse(okPost.body).access_token).toBe('ok-acc');
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
  });
});
