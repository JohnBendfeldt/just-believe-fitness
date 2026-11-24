import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRideSummaryDescription,
  buildStravaAuthorizeUrl,
  consumeAndVerifyStravaOAuthState,
  exchangeStravaOAuthCode,
  getValidStravaAccessToken,
  normalizeRideTitle,
  updateStravaActivityDetails,
  uploadRideToStrava,
} from '../services/strava';
import {
  loginGarminConnect,
  syncGarminPersonalApi,
  updateGarminActivityDetails,
  uploadRideToGarmin,
  verifyGarminConnectMfa,
  verifyGarminSessionTokens,
} from '../services/garminConnect';
import { loadGarminConfig, loadStravaConfig, saveGarminConfig, saveStravaConfig } from '../services/storage';
import { makeSampleRide } from '../test/fixtures';

describe('Strava OAuth, Auto-Refresh, .FIT Upload & Remote Metadata Sync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds Strava authorize URL with activity:write scope, verifies CSRF state nonce, and formats custom ride notes', () => {
    const url = buildStravaAuthorizeUrl('98765');
    expect(url).toContain('client_id=98765');
    expect(url).toContain('activity%3Awrite');
    const parsedAuthUrl = new URL(url);
    const issuedState = parsedAuthUrl.searchParams.get('state');
    expect(issuedState).toMatch(/^[a-f0-9]{32}$/);
    expect(consumeAndVerifyStravaOAuthState('forged-state')).toBe(false);
    const url2 = buildStravaAuthorizeUrl('98765');
    const issuedState2 = new URL(url2).searchParams.get('state');
    expect(consumeAndVerifyStravaOAuthState(issuedState2)).toBe(true);
    // Replay of consumed state must fail
    expect(consumeAndVerifyStravaOAuthState(issuedState2)).toBe(false);

    const rideWithNotes = makeSampleRide({ notes: 'Loved the climb block!' });
    const desc = buildRideSummaryDescription(rideWithNotes);
    expect(desc.startsWith('Loved the climb block!\n\nJust Believe Fitness')).toBe(true);
    expect(desc).toContain('Burn Points: 14');
    expect(desc.endsWith('\njbfit.studio')).toBe(true);
    expect(desc).not.toContain('https://jbfit.studio');
    expect(desc).not.toContain('jbfit.studio/');

    const rideNoNotes = makeSampleRide({ notes: undefined });
    const descNoNotes = buildRideSummaryDescription(rideNoNotes);
    expect(descNoNotes.startsWith('Just Believe Fitness')).toBe(true);
    expect(descNoNotes.endsWith('\njbfit.studio')).toBe(true);

    // Omit "Burn Points: 0" when rider finishes with 0 Burn Points (e.g. Zone 2 recovery spin)
    const zeroBurnDesc = buildRideSummaryDescription(makeSampleRide({ burnPoints: 0 }));
    expect(zeroBurnDesc).not.toContain('Burn Points');
    expect(zeroBurnDesc).toContain('Avg Power:');

    // Avoid duplicate link if the rider already wrote jbfit.studio in notes
    const rideAlreadyLinked = makeSampleRide({
      notes: 'Great ride on jbfit.studio',
    });
    const descDeduped = buildRideSummaryDescription(rideAlreadyLinked);
    expect(descDeduped.match(/jbfit\.studio/g)?.length).toBe(1);

    // Normalize legacy "JBF " prefixes and redundant "(23 min)" suffixes on workout titles
    expect(normalizeRideTitle('JBF 23-Min Signature Burn')).toBe('23-Min Signature Burn');
    expect(normalizeRideTitle('23-Min Signature Burn (23 min)')).toBe('23-Min Signature Burn');
    expect(normalizeRideTitle('20-Min Burn Express (20m)')).toBe('20-Min Burn Express');
    expect(normalizeRideTitle('First workout post Injury')).toBe('First workout post Injury');
  });

  it('exchanges OAuth code via /api/strava-token and imports athlete FTP & kg->lbs weight', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'strava-acc-1',
          refresh_token: 'strava-ref-1',
          expires_at: Math.floor(Date.now() / 1000) + 7200,
          athlete: {
            id: 42,
            firstname: 'Taylor',
            lastname: 'Swiftspin',
            ftp: 195,
            weight: 70, // ~154 lbs
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const res = await exchangeStravaOAuthCode('oauth-code-xyz', {
      clientId: '111',
      clientSecret: '222',
    });

    expect(res.updatedConfig.athleteName).toBe('Taylor Swiftspin');
    expect(res.importedFtp).toBe(195);
    expect(res.importedWeightLbs).toBe(154);
    expect(loadStravaConfig().accessToken).toBe('strava-acc-1');

    // Athlete-cap error translates to clear personal API key + manual upload guidance
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Forbidden',
          errors: [{ resource: 'Application', field: '', code: 'Limit of connected athletes exceeded' }],
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    );
    await expect(
      exchangeStravaOAuthCode('oauth-code-capped', { clientId: '111', clientSecret: '222' })
    ).rejects.toThrow(/connected-athlete limit.*strava\.com\/settings\/api.*strava\.com\/upload\/select/i);
  });

  it('automatically refreshes expired Strava access tokens before uploading or updating activities', async () => {
    saveStravaConfig({
      clientId: '111',
      clientSecret: '222',
      accessToken: 'expired-token',
      refreshToken: 'valid-refresh',
      expiresAtSec: Math.floor(Date.now() / 1000) - 60, // Expired 1 min ago
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/strava-token')) {
        return new Response(
          JSON.stringify({
            access_token: 'fresh-token-99',
            refresh_token: 'fresh-refresh-99',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/v3/activities/555')) {
        return new Response(JSON.stringify({ id: 555 }), { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const token = await getValidStravaAccessToken();
    expect(token).toBe('fresh-token-99');

    const ride = makeSampleRide({ stravaActivityId: 555, title: 'Updated Ride Title' });
    await updateStravaActivityDetails(ride);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('uploads binary .FIT multipart payload to Strava (matching manual .FIT export) and polls until activity_id is assigned', async () => {
    vi.useFakeTimers();
    saveStravaConfig({
      clientId: '111',
      clientSecret: '222',
      accessToken: 'live-token',
      refreshToken: 'live-refresh',
      expiresAtSec: Math.floor(Date.now() / 1000) + 7200,
    });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 7001, status: 'Processing', error: null, activity_id: null }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 7001, status: 'Ready', error: null, activity_id: 880011 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const ride = makeSampleRide({ id: 'ride-ftp-fit-1', title: '20-Min FTP Test' });
    const uploadPromise = uploadRideToStrava(ride);
    await vi.advanceTimersByTimeAsync(2500);
    const result = await uploadPromise;

    expect(result).toEqual({ uploadId: 7001, activityId: 880011 });

    const uploadForm = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(uploadForm).toBeInstanceOf(FormData);
    expect(uploadForm.get('data_type')).toBe('fit');
    expect(uploadForm.get('trainer')).toBe('1');
    expect(uploadForm.get('name')).toBe('20-Min FTP Test');
    expect(uploadForm.get('external_id')).toBe('jbf-ride-ftp-fit-1.fit');
    expect(uploadForm.get('SportType')).toBeNull();
    expect(uploadForm.get('activity_type')).toBeNull();

    const uploadedFile = uploadForm.get('file') as File;
    expect(uploadedFile).toBeTruthy();
    expect(uploadedFile.name).toBe('ride-ftp-fit-1.fit');
    const uploadedBytes = new Uint8Array(await uploadedFile.arrayBuffer());
    expect(String.fromCharCode(uploadedBytes[8], uploadedBytes[9], uploadedBytes[10], uploadedBytes[11])).toBe('.FIT');
    vi.useRealTimers();
  });

  it('sends sport_type=Run for running and sport_type=Rowing for rowing uploads with sport-native descriptions', async () => {
    vi.useFakeTimers();
    saveStravaConfig({
      clientId: '111',
      clientSecret: '222',
      accessToken: 'live-token',
      refreshToken: 'live-refresh',
      expiresAtSec: Math.floor(Date.now() / 1000) + 7200,
    });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 7101, status: 'Processing', error: null, activity_id: null }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 7101, status: 'Ready', error: null, activity_id: 990101 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 7102, status: 'Processing', error: null, activity_id: null }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 7102, status: 'Ready', error: null, activity_id: 990102 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const runRide = makeSampleRide({
      id: 'run-strava-1',
      sport: 'running',
      title: '5K Challenge',
      bikeLabel: 'Horizon 7.4 AT',
      durationSec: 1500,
      distanceMeters: 5000,
      avgInclinePct: 1.5,
      avgCadence: 174,
    });
    const runDesc = buildRideSummaryDescription(runRide);
    expect(runDesc).toContain('Avg Pace:');
    expect(runDesc).toContain('/mi');
    expect(runDesc).toContain('Incline: 1.5%');

    const runPromise = uploadRideToStrava(runRide);
    await vi.advanceTimersByTimeAsync(2500);
    const runRes = await runPromise;
    expect(runRes.activityId).toBe(990101);
    const runForm = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(runForm.get('sport_type')).toBe('Run');

    const rowRide = makeSampleRide({
      id: 'row-strava-1',
      sport: 'rowing',
      title: '2,000m Erg Test',
      bikeLabel: 'Concept2 RowErg PM5',
      durationSec: 480,
      distanceMeters: 2000,
      avgWatts: 205,
      avgSplitSecPer500m: 120,
      avgCadence: 28,
    });
    const rowDesc = buildRideSummaryDescription(rowRide);
    expect(rowDesc).toContain('Avg Split: 2:00 /500m');
    expect(rowDesc).toContain('28 spm');

    const rowPromise = uploadRideToStrava(rowRide);
    await vi.advanceTimersByTimeAsync(2500);
    const rowRes = await rowPromise;
    expect(rowRes.activityId).toBe(990102);
    const rowForm = fetchSpy.mock.calls[2][1]?.body as FormData;
    expect(rowForm.get('sport_type')).toBe('Rowing');

    vi.useRealTimers();
  });
});

describe('Garmin Connect SSO, 2FA/MFA, Duplicate-Safe Import & Rolling Tokens', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles both direct Garmin SSO login and 2FA/MFA verification without persisting passwords', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            mfaRequired: true,
            mfaMethod: 'email',
            mfaState: { ticket: 'mfa-session-1' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            connected: true,
            athleteName: 'Jordan Rider',
            tokens: { oauth1: 'o1', oauth2: 'o2' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const step1 = await loginGarminConnect('jordan@example.com', 'super-secret-pw');
    expect(step1.mfaRequired).toBe(true);
    // Ensure password is NEVER saved to localStorage
    expect(window.localStorage.getItem('jbf_garmin_connect_v1')).toBeNull();

    if (step1.mfaRequired) {
      const cfg = await verifyGarminConnectMfa(step1.mfaState, '654321', 'jordan@example.com');
      expect(cfg.athleteName).toBe('Jordan Rider');
    }

    const rawStored = window.localStorage.getItem('jbf_garmin_connect_v1') || '';
    expect(rawStored).not.toContain('super-secret-pw');
    expect(loadGarminConfig().tokens).toEqual({ oauth1: 'o1', oauth2: 'o2' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('uploads rides to Garmin in import mode (preventing duplicate Strava forwarding) and saves rolling tokens', async () => {
    saveGarminConfig({
      email: 'jordan@example.com',
      athleteName: 'Jordan Rider',
      tokens: { oauth1: 'o1', oauth2: 'old-o2' },
    });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            activityId: 445566,
            tokens: { oauth1: 'o1', oauth2: 'refreshed-o2' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            tokens: { oauth1: 'o1', oauth2: 'refreshed-o2-v2' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const ride = makeSampleRide({ title: 'Evening Burn', notes: 'Strong cadence!' });
    const res = await uploadRideToGarmin(ride, { uploadMode: 'import' });
    expect(res.activityId).toBe(445566);

    const sentPayload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(sentPayload.uploadMode).toBe('import');
    expect(sentPayload.title).toBe('Evening Burn');
    expect(sentPayload.description).toContain('Strong cadence!');
    expect(loadGarminConfig().tokens).toEqual({ oauth1: 'o1', oauth2: 'refreshed-o2' });

    await updateGarminActivityDetails({ ...ride, garminActivityId: 445566 });
    expect(loadGarminConfig().tokens).toEqual({ oauth1: 'o1', oauth2: 'refreshed-o2-v2' });
  });

  it('verifies pasted Garmin session tokens and syncs Personal API biometrics/history without overwriting each other', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            athleteName: 'Jordan Rider',
            importedProfile: {
              weightLbs: 172,
              maxHrBpm: 187,
              ftpWatts: 225,
            },
            recentActivities: [
              {
                activityId: 332211,
                name: 'Garmin Zwift Spin',
                typeKey: 'indoor_cycling',
                startedAtLocal: '2026-11-15 08:00:00',
                durationSec: 2400,
                distanceMeters: 18500,
                caloriesKcal: 520,
                avgWatts: 198,
                avgHr: 150,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            connected: true,
            athleteName: 'Jordan Rider',
            tokens: { oauth1: 'local-o1', oauth2: 'local-o2' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const personalRes = await syncGarminPersonalApi('GCDC_demo_key');
    expect(personalRes.importedProfile.ftpWatts).toBe(225);
    expect(personalRes.recentActivities).toHaveLength(1);
    expect(loadGarminConfig().personalApiKey).toBe('GCDC_demo_key');

    const tokenCfg = await verifyGarminSessionTokens('{"oauth1":"local-o1","oauth2":"local-o2"}');
    expect(tokenCfg.tokens).toEqual({ oauth1: 'local-o1', oauth2: 'local-o2' });
    // Existing Personal API key and recent activities remain intact
    expect(loadGarminConfig().personalApiKey).toBe('GCDC_demo_key');
    expect(loadGarminConfig().recentActivities).toHaveLength(1);
  });
});
