import {
  Garmin,
  GarminAuthError,
  GarminClient,
  GarminRateLimitError,
} from 'garminconnect-js';

const PERSONAL_API_BASE = 'https://personal.connectapi.garmin.com';

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify(payload),
  };
}

function createMemoryBackedStore(initialTokens) {
  let current = initialTokens || null;
  return {
    getCurrent: () => current,
    store: {
      async load() {
        return current;
      },
      async save(tokens) {
        current = tokens;
      },
      async clear() {
        current = null;
      },
    },
  };
}

function extractActivityIdFromUploadResult(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const detailed = raw.detailedImportResult;
  if (detailed && typeof detailed === 'object') {
    const successes = Array.isArray(detailed.successes) ? detailed.successes : [];
    if (successes.length > 0 && typeof successes[0]?.internalId === 'number') {
      return successes[0].internalId;
    }
  }
  if (typeof raw.activityId === 'number') return raw.activityId;
  if (typeof raw.internalId === 'number') return raw.internalId;
  return undefined;
}

function normalizeTokenPayload(rawInput) {
  let parsed = rawInput;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return null;
    parsed = JSON.parse(trimmed);
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    parsed.tokens &&
    typeof parsed.tokens === 'object' &&
    !Array.isArray(parsed.tokens)
  ) {
    parsed = parsed.tokens;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    return null;
  }
  return parsed;
}

function extractPersonalApiBearerToken(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed.trim();
    if (parsed && typeof parsed === 'object') {
      const candidate =
        parsed.access_token || parsed.token || parsed.jwt || parsed.accessToken || '';
      return String(candidate).trim();
    }
  } catch {
    // Plain JWT or quoted string response
  }
  return trimmed.replace(/^["']|["']$/g, '').trim();
}

async function fetchPersonalApiJson(path, bearerToken) {
  const resp = await fetch(`${PERSONAL_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

function buildImportedProfileFromPersonalApi(settings, hrZonesRaw) {
  const imported = {};
  const userData =
    settings && typeof settings === 'object' && settings.userData && typeof settings.userData === 'object'
      ? settings.userData
      : settings || {};

  const rawWeight = Number(userData.weight);
  if (Number.isFinite(rawWeight) && rawWeight > 0) {
    const weightLbs =
      rawWeight > 1000
        ? Math.round((rawWeight / 1000) * 2.20462262)
        : rawWeight >= 25 && rawWeight <= 300
          ? Math.round(rawWeight * 2.20462262)
          : 0;
    if (weightLbs >= 70 && weightLbs <= 450) {
      imported.weightLbs = weightLbs;
    }
  }

  const rawHeight = Number(userData.height);
  if (Number.isFinite(rawHeight) && rawHeight >= 100 && rawHeight <= 240) {
    const totalInches = Math.round(rawHeight / 2.54);
    imported.heightFeet = Math.floor(totalInches / 12);
    imported.heightInches = totalInches % 12;
  }

  const rawMaxHr = Number(userData.maxHeartRate);
  if (Number.isFinite(rawMaxHr) && rawMaxHr >= 120 && rawMaxHr <= 230) {
    imported.maxHrBpm = Math.round(rawMaxHr);
  }

  const rawRestingHr = Number(
    userData.restingHeartRate ?? userData.minHeartRate ?? settings?.restingHeartRate
  );
  if (Number.isFinite(rawRestingHr) && rawRestingHr >= 25 && rawRestingHr <= 130) {
    imported.restingHrBpm = Math.round(rawRestingHr);
  }

  const rawFtp = Number(
    userData.cyclingFtp ??
      userData.ftp ??
      userData.functionalThresholdPower ??
      settings?.cyclingFtp ??
      settings?.ftp
  );
  if (Number.isFinite(rawFtp) && rawFtp >= 50 && rawFtp <= 600) {
    imported.ftpWatts = Math.round(rawFtp);
  }

  const zoneEntry = Array.isArray(hrZonesRaw)
    ? hrZonesRaw.find((z) => z?.sport === 'CYCLING') || hrZonesRaw[0]
    : hrZonesRaw;

  if (zoneEntry && typeof zoneEntry === 'object') {
    if (!imported.maxHrBpm) {
      const zoneMax = Number(zoneEntry.maxHeartRateUsed ?? zoneEntry.zone5Ceiling);
      if (Number.isFinite(zoneMax) && zoneMax >= 120 && zoneMax <= 230) {
        imported.maxHrBpm = Math.round(zoneMax);
      }
    }
    if (!imported.restingHrBpm) {
      const zoneRest = Number(zoneEntry.restingHeartRateUsed);
      if (Number.isFinite(zoneRest) && zoneRest >= 25 && zoneRest <= 130) {
        imported.restingHrBpm = Math.round(zoneRest);
      }
    }
  }

  return imported;
}

function mapPersonalApiActivities(rawActivities) {
  if (!Array.isArray(rawActivities)) return [];
  return rawActivities
    .filter((item) => item && typeof item.activityId === 'number')
    .slice(0, 10)
    .map((item) => ({
      activityId: item.activityId,
      name: item.activityName || 'Garmin Workout',
      typeKey: item.activityTypeDTO?.typeKey || 'cycling',
      startedAtLocal: item.startTimeLocal || item.startTimeGMT || '',
      durationSec: Math.round(Number(item.duration) || 0),
      distanceMeters: Number(item.distance) || 0,
      caloriesKcal: Math.round(Number(item.calories) || 0),
      avgWatts: item.averagePower ? Math.round(Number(item.averagePower)) : undefined,
      normalizedWatts: item.normalizedPower ? Math.round(Number(item.normalizedPower)) : undefined,
      avgHr: item.averageHR ? Math.round(Number(item.averageHR)) : undefined,
      maxHr: item.maxHR ? Math.round(Number(item.maxHR)) : undefined,
    }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(event) {
  if (event.httpMethod === 'GET') {
    // Personal Garmin credentials are never read from server env vars (public endpoint);
    // each visitor supplies their own per request.
    return jsonResponse(200, {
      ok: true,
      hasServerCredentials: false,
      hasServerPersonalApiKey: false,
    });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const action = payload.action;

    if (action === 'login') {
      const email = (payload.email || '').trim();
      const password = payload.password || '';

      if (!email || !password) {
        return jsonResponse(400, {
          error: 'Enter your Garmin Connect email and password to sign in.',
        });
      }

      const { getCurrent, store } = createMemoryBackedStore(null);
      const client = new GarminClient({ tokenStore: store });
      const loginResult = await client.login(email, password);

      if (loginResult && loginResult.state === 'mfa_required') {
        return jsonResponse(200, {
          ok: true,
          mfaRequired: true,
          mfaMethod: loginResult.mfaState?.mfaMethod || 'code',
          mfaState: loginResult.mfaState,
        });
      }

      const garmin = new Garmin(client);
      let athleteName = email;
      try {
        const full = await garmin.fullName();
        if (full) athleteName = full;
      } catch {
        // Optional profile lookup
      }

      return jsonResponse(200, {
        ok: true,
        connected: true,
        athleteName,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    if (action === 'mfa') {
      const { mfaState, code, email } = payload;
      if (!mfaState || !code) {
        return jsonResponse(400, {
          error: 'Missing Garmin verification code or session state.',
        });
      }

      const { getCurrent, store } = createMemoryBackedStore(null);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 0 });
      await client.resumeLogin(mfaState, String(code).trim());

      const garmin = new Garmin(client);
      let athleteName = email || 'Garmin Athlete';
      try {
        const full = await garmin.fullName();
        if (full) athleteName = full;
      } catch {
        // Optional profile lookup
      }

      return jsonResponse(200, {
        ok: true,
        connected: true,
        athleteName,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    if (action === 'verify_tokens') {
      let normalizedTokens;
      try {
        normalizedTokens = normalizeTokenPayload(payload.tokens);
      } catch {
        return jsonResponse(400, {
          error: 'Invalid Garmin session token JSON format.',
        });
      }

      if (!normalizedTokens) {
        return jsonResponse(400, {
          error: 'Paste valid Garmin OAuth session token JSON.',
        });
      }

      const { getCurrent, store } = createMemoryBackedStore(normalizedTokens);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 0 });
      const loaded = await client.loadTokens();
      if (!loaded) {
        return jsonResponse(400, {
          error: 'Invalid or expired Garmin session token JSON.',
        });
      }

      const garmin = new Garmin(client);
      let athleteName = (payload.email || '').trim() || 'Garmin Athlete';
      try {
        const full = await garmin.fullName();
        if (full) athleteName = full;
      } catch (err) {
        if (err instanceof GarminAuthError) throw err;
      }

      return jsonResponse(200, {
        ok: true,
        connected: true,
        athleteName,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    if (action === 'personal_api_sync') {
      const apiKey = String(payload.apiKey || '').trim();
      if (!apiKey) {
        return jsonResponse(400, {
          error: 'Enter your Garmin Personal API Key (GCDC_...).',
        });
      }

      const tokenResp = await fetch(
        `${PERSONAL_API_BASE}/personalapitoken-service/personal-api/personal-api-key/token`,
        {
          method: 'POST',
          headers: {
            Authorization: `ApiKey ${apiKey}`,
            Accept: 'application/json, text/plain, */*',
          },
        }
      );

      if (!tokenResp.ok) {
        const status = tokenResp.status === 401 || tokenResp.status === 403 ? 401 : 502;
        return jsonResponse(status, {
          error:
            'Garmin Personal API key was rejected or expired. Check your GCDC_ key under Garmin Connect -> Profile & Account -> Settings -> Personal API Key.',
        });
      }

      const rawTokenText = await tokenResp.text();
      const bearerToken = extractPersonalApiBearerToken(rawTokenText);
      if (!bearerToken) {
        return jsonResponse(502, {
          error: 'Garmin Personal API did not return a Bearer token.',
        });
      }

      const [
        settingsResult,
        userSettingsResult,
        socialResult,
        ftpResult,
        hrZonesResult,
        activitiesResult,
      ] = await Promise.allSettled([
        fetchPersonalApiJson('/userprofile-service/userprofile/settings', bearerToken),
        fetchPersonalApiJson('/userprofile-service/userprofile/user-settings', bearerToken),
        fetchPersonalApiJson('/userprofile-service/socialProfile', bearerToken),
        fetchPersonalApiJson(
          '/biometric-service/biometric/latestFunctionalThresholdPower/CYCLING',
          bearerToken
        ),
        fetchPersonalApiJson('/biometric-service/heartRateZones/v2', bearerToken),
        fetchPersonalApiJson(
          '/activitylist-service/activities/search/activities?start=0&limit=10',
          bearerToken
        ),
      ]);

      const val = (r) => (r.status === 'fulfilled' ? r.value : null);
      const settings = val(settingsResult);
      const userSettings = val(userSettingsResult);
      const social = val(socialResult);
      const ftpRaw = val(ftpResult);
      const hrZones = val(hrZonesResult);
      const rawActivities = val(activitiesResult);

      // Garmin sometimes rejects one profile endpoint; merge whichever succeeded.
      const mergedUserData = {
        ...(userSettings?.userData || userSettings || {}),
        ...(settings?.userData || settings || {}),
      };
      const mergedSettings = { ...(userSettings || {}), ...(settings || {}), userData: mergedUserData };
      const ftpValue = Array.isArray(ftpRaw) ? ftpRaw[0]?.functionalThresholdPower : ftpRaw?.functionalThresholdPower;
      if (ftpValue && !mergedUserData.cyclingFtp) mergedUserData.cyclingFtp = ftpValue;

      const importedProfile = buildImportedProfileFromPersonalApi(mergedSettings, hrZones);
      const recentActivities = mapPersonalApiActivities(rawActivities);
      const isUuid = (v) =>
        typeof v === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
      const pickName = (...candidates) =>
        candidates.find((c) => typeof c === 'string' && c.trim().length > 0 && !isUuid(c)) ||
        'Garmin Athlete';
      const athleteName = pickName(
        social?.fullName,
        social?.displayName,
        settings?.displayName,
        settings?.userName,
        rawActivities?.[0]?.ownerFullName,
        rawActivities?.[0]?.ownerDisplayName
      );

      return jsonResponse(200, {
        ok: true,
        athleteName,
        importedProfile,
        recentActivities,
      });
    }

    if (action === 'upload') {
      const { tokens, tcxXml, filename, title, description, uploadMode, startedAtIso } = payload;

      if (!tcxXml) {
        return jsonResponse(400, { error: 'Missing TCX workout payload.' });
      }

      const { getCurrent, store } = createMemoryBackedStore(tokens || null);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 0 });

      const hasValidSession = await client.loadTokens();
      if (!hasValidSession) {
        return jsonResponse(401, {
          error: 'Garmin Connect is not signed in yet. Open Garmin Settings to connect.',
        });
      }

      const garmin = new Garmin(client);
      const safeName =
        typeof filename === 'string' && filename.endsWith('.tcx')
          ? filename
          : `jbf-ride-${Date.now()}.tcx`;
      const blob = new Blob([tcxXml], { type: 'application/vnd.garmin.tcx+xml' });

      // 'import' avoids Garmin auto-forwarding a duplicate to Strava when pushing to both!
      // 'device' uses Garmin's standard device upload endpoint.
      const rawUpload =
        uploadMode === 'import'
          ? await garmin.importActivity(blob, safeName)
          : await garmin.uploadActivity(blob, safeName);

      let activityId = extractActivityIdFromUploadResult(rawUpload);

      if (!activityId) {
        const rideStartMs = startedAtIso ? Date.parse(startedAtIso) : NaN;
        for (const waitMs of [1800, 2400]) {
          await sleep(waitMs);
          try {
            const latest = await garmin.getLastActivity();
            if (latest && typeof latest.activityId === 'number') {
              const latestStartGmt = latest.startTimeGMT
                ? Date.parse(`${latest.startTimeGMT.replace(' ', 'T')}Z`)
                : NaN;
              if (
                Number.isNaN(rideStartMs) ||
                Number.isNaN(latestStartGmt) ||
                Math.abs(latestStartGmt - rideStartMs) < 15 * 60 * 1000
              ) {
                activityId = latest.activityId;
                break;
              }
            }
          } catch {
            // Ignore polling hiccup
          }
        }
      }

      if (activityId) {
        if (title) {
          try {
            await garmin.setActivityName(activityId, String(title));
          } catch {
            // Non-fatal if Garmin is still indexing metadata
          }
        }
        if (description) {
          try {
            await garmin.setActivityDescription(activityId, String(description));
          } catch {
            // Non-fatal if Garmin is still indexing metadata
          }
        }
      }

      return jsonResponse(200, {
        ok: true,
        activityId,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    if (action === 'update_meta') {
      const { tokens, activityId, title, description } = payload;
      if (!activityId) {
        return jsonResponse(400, { error: 'Missing Garmin activityId.' });
      }
      const { getCurrent, store } = createMemoryBackedStore(tokens || null);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 0 });
      if (!(await client.loadTokens())) {
        return jsonResponse(401, { error: 'Garmin session expired. Please reconnect Garmin.' });
      }
      const garmin = new Garmin(client);
      if (title) await garmin.setActivityName(activityId, String(title));
      if (description !== undefined) {
        await garmin.setActivityDescription(activityId, String(description));
      }
      return jsonResponse(200, {
        ok: true,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    return jsonResponse(400, { error: `Unknown Garmin action: ${String(action)}` });
  } catch (err) {
    if (err instanceof GarminAuthError) {
      return jsonResponse(401, {
        error: `Garmin authentication failed: ${err.message}`,
      });
    }
    if (err instanceof GarminRateLimitError) {
      return jsonResponse(429, {
        error:
          'Garmin SSO is temporarily rate-limiting logins from shared cloud IPs (30-60 min cooldown). Pause password retries and either paste a local Session Token (run `npm run garmin:token` on your computer) for ride uploads, or use your Garmin Personal API Key (GCDC_) for profile & history sync.',
      });
    }
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : 'Garmin Connect sync failed.',
    });
  }
}
