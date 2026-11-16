import {
  Garmin,
  GarminAuthError,
  GarminClient,
  GarminRateLimitError,
} from 'garminconnect-js';

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(event) {
  if (event.httpMethod === 'GET') {
    const hasServerCredentials = Boolean(
      process.env.GARMIN_EMAIL && process.env.GARMIN_PASSWORD
    );
    return jsonResponse(200, { ok: true, hasServerCredentials });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const action = payload.action;

    if (action === 'login') {
      const email = (payload.email || process.env.GARMIN_EMAIL || '').trim();
      const password = payload.password || process.env.GARMIN_PASSWORD || '';

      if (!email || !password) {
        return jsonResponse(400, {
          error: 'Enter your Garmin Connect email and password to sign in.',
        });
      }

      const { getCurrent, store } = createMemoryBackedStore(null);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 600 });
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

    if (action === 'upload') {
      const { tokens, tcxXml, filename, title, description, uploadMode, startedAtIso } = payload;

      if (!tcxXml) {
        return jsonResponse(400, { error: 'Missing TCX workout payload.' });
      }

      const { getCurrent, store } = createMemoryBackedStore(tokens || null);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 600 });

      const hasValidSession = await client.loadTokens();
      if (!hasValidSession) {
        if (process.env.GARMIN_EMAIL && process.env.GARMIN_PASSWORD) {
          const envLogin = await client.login(
            process.env.GARMIN_EMAIL,
            process.env.GARMIN_PASSWORD
          );
          if (envLogin && envLogin.state === 'mfa_required') {
            return jsonResponse(401, {
              error: 'Garmin Connect requires 2FA verification. Sign in under Garmin Settings.',
            });
          }
        } else {
          return jsonResponse(401, {
            error: 'Garmin Connect is not signed in yet. Open Garmin Settings to connect.',
          });
        }
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
      const client = new GarminClient({ tokenStore: store });
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
        error: 'Garmin temporarily rate-limited sign-in. Wait a minute and try again.',
      });
    }
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : 'Garmin Connect sync failed.',
    });
  }
}
