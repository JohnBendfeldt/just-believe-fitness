import type {
  GarminConfig,
  GarminImportedProfile,
  GarminRemoteActivity,
  SavedRide,
} from '../types/fitness';
import { buildRideTcxXml } from './tcxExporter';
import { buildRideSummaryDescription } from './strava';
import { loadGarminConfig, saveGarminConfig } from './storage';

const GARMIN_SYNC_ENDPOINT = '/api/garmin-sync';

interface GarminSyncApiResponse {
  ok?: boolean;
  error?: string;
  mfaRequired?: boolean;
  mfaMethod?: string;
  mfaState?: unknown;
  connected?: boolean;
  athleteName?: string;
  tokens?: Record<string, unknown>;
  activityId?: number;
  hasServerCredentials?: boolean;
  hasServerPersonalApiKey?: boolean;
  importedProfile?: GarminImportedProfile;
  recentActivities?: GarminRemoteActivity[];
}

async function postGarminSync(body: Record<string, unknown>): Promise<GarminSyncApiResponse> {
  const resp = await fetch(GARMIN_SYNC_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'Garmin Connect cloud sync runs via the Netlify serverless proxy (deployed at jbfit.studio).'
    );
  }

  const data = (await resp.json()) as GarminSyncApiResponse;
  if (!resp.ok || data.error) {
    throw new Error(data.error || `Garmin Connect request failed (${resp.status}).`);
  }
  return data;
}

export async function fetchGarminServerStatus(): Promise<{
  ok: boolean;
  hasServerCredentials: boolean;
  hasServerPersonalApiKey: boolean;
}> {
  const resp = await fetch(GARMIN_SYNC_ENDPOINT, { method: 'GET' });
  const contentType = resp.headers.get('content-type') || '';
  if (!resp.ok || !contentType.includes('application/json')) {
    return {
      ok: false,
      hasServerCredentials: false,
      hasServerPersonalApiKey: false,
    };
  }
  const data = (await resp.json()) as GarminSyncApiResponse;
  return {
    ok: Boolean(data.ok),
    hasServerCredentials: Boolean(data.hasServerCredentials),
    hasServerPersonalApiKey: Boolean(data.hasServerPersonalApiKey),
  };
}

export async function loginGarminConnect(
  email: string,
  password: string
): Promise<
  | { mfaRequired: true; mfaState: unknown; mfaMethod: string }
  | { mfaRequired: false; config: GarminConfig }
> {
  const data = await postGarminSync({
    action: 'login',
    email: email.trim(),
    password,
  });

  if (data.mfaRequired) {
    return {
      mfaRequired: true,
      mfaState: data.mfaState,
      mfaMethod: data.mfaMethod || 'code',
    };
  }

  const existing = loadGarminConfig();
  const config: GarminConfig = {
    ...existing,
    email: email.trim(),
    athleteName: data.athleteName || existing.athleteName || email.trim(),
    tokens: data.tokens,
    connectedAtIso: new Date().toISOString(),
  };
  saveGarminConfig(config);
  return { mfaRequired: false, config };
}

export async function verifyGarminConnectMfa(
  mfaState: unknown,
  code: string,
  email: string
): Promise<GarminConfig> {
  const data = await postGarminSync({
    action: 'mfa',
    mfaState,
    code: code.trim(),
    email: email.trim(),
  });

  const existing = loadGarminConfig();
  const config: GarminConfig = {
    ...existing,
    email: email.trim(),
    athleteName: data.athleteName || existing.athleteName || email.trim(),
    tokens: data.tokens,
    connectedAtIso: new Date().toISOString(),
  };
  saveGarminConfig(config);
  return config;
}

export async function verifyGarminSessionTokens(
  rawTokenJson: string,
  email?: string
): Promise<GarminConfig> {
  const trimmed = rawTokenJson.trim();
  if (!trimmed) {
    throw new Error('Paste your Garmin session token JSON before verifying.');
  }

  const existing = loadGarminConfig();
  const effectiveEmail = (email || existing.email || '').trim();
  const data = await postGarminSync({
    action: 'verify_tokens',
    tokens: trimmed,
    email: effectiveEmail,
  });

  const config: GarminConfig = {
    ...existing,
    ...(effectiveEmail ? { email: effectiveEmail } : {}),
    athleteName: data.athleteName || existing.athleteName || effectiveEmail || 'Garmin Athlete',
    tokens: data.tokens,
    connectedAtIso: new Date().toISOString(),
  };
  saveGarminConfig(config);
  return config;
}

export async function syncGarminPersonalApi(apiKey?: string): Promise<{
  config: GarminConfig;
  athleteName: string;
  importedProfile: GarminImportedProfile;
  recentActivities: GarminRemoteActivity[];
}> {
  const existing = loadGarminConfig();
  const effectiveKey = (apiKey ?? existing.personalApiKey ?? '').trim();

  const data = await postGarminSync({
    action: 'personal_api_sync',
    ...(effectiveKey ? { apiKey: effectiveKey } : {}),
  });

  const importedProfile = data.importedProfile || {};
  const recentActivities = Array.isArray(data.recentActivities) ? data.recentActivities : [];
  const athleteName = data.athleteName || existing.athleteName || 'Garmin Athlete';

  const config: GarminConfig = {
    ...existing,
    athleteName,
    ...(effectiveKey ? { personalApiKey: effectiveKey } : {}),
    recentActivities,
    lastPersonalSyncAtIso: new Date().toISOString(),
  };
  saveGarminConfig(config);

  return {
    config,
    athleteName,
    importedProfile,
    recentActivities,
  };
}

export async function uploadRideToGarmin(
  ride: SavedRide,
  options?: {
    uploadMode?: 'device' | 'import';
    onProgress?: (statusText: string) => void;
  }
): Promise<{ activityId?: number }> {
  const config = loadGarminConfig();
  if (!config.tokens) {
    throw new Error('Garmin Connect is not signed in yet. Open Garmin Settings to connect.');
  }

  options?.onProgress?.('Uploading TCX workout to Garmin Connect...');
  const tcxXml = buildRideTcxXml(ride);
  const description = buildRideSummaryDescription(ride);

  const data = await postGarminSync({
    action: 'upload',
    tokens: config.tokens,
    tcxXml,
    filename: `jbf-${ride.id}.tcx`,
    title: ride.title,
    description,
    uploadMode: options?.uploadMode || 'device',
    startedAtIso: ride.startedAtIso,
  });

  if (data.tokens) {
    saveGarminConfig({
      ...config,
      tokens: data.tokens,
    });
  }

  return { activityId: data.activityId };
}

export async function updateGarminActivityDetails(ride: SavedRide): Promise<void> {
  if (!ride.garminActivityId) {
    throw new Error('This workout does not have a Garmin activity ID yet.');
  }
  const config = loadGarminConfig();
  if (!config.tokens) {
    throw new Error('Garmin Connect is not signed in.');
  }

  const data = await postGarminSync({
    action: 'update_meta',
    tokens: config.tokens,
    activityId: ride.garminActivityId,
    title: ride.title,
    description: buildRideSummaryDescription(ride),
  });

  if (data.tokens) {
    saveGarminConfig({
      ...config,
      tokens: data.tokens,
    });
  }
}
