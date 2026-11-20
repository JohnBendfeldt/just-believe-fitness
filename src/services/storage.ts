import type { AthleteProfile, GarminConfig, SavedRide, StravaConfig } from '../types/fitness';
import { DEFAULT_ATHLETE_PROFILE } from '../utils/zones';

const ATHLETE_STORAGE_KEY = 'jb_fitness_athlete_v1';
const STRAVA_STORAGE_KEY = 'jb_fitness_strava_v1';
const GARMIN_STORAGE_KEY = 'jbf_garmin_connect_v1';
const YOUTUBE_STORAGE_KEY = 'jb_fitness_youtube_v1';

const DB_NAME = 'just_believe_fitness_db';
const DB_VERSION = 1;
const RIDES_STORE = 'rides';

export interface YouTubePreset {
  id: string;
  title: string;
  videoIdOrUrl: string;
}

export const DEFAULT_YOUTUBE_PRESETS: YouTubePreset[] = [
  {
    id: 'alps-climb',
    title: '4K Swiss Alps Cycling Ascent',
    videoIdOrUrl: 'https://www.youtube.com/watch?v=BHACKCNDMW8',
  },
  {
    id: 'mallorca-coast',
    title: 'Mallorca Coastal Scenic Spin',
    videoIdOrUrl: 'https://www.youtube.com/watch?v=eKFTSSKCzWA',
  },
  {
    id: 'synthwave-mix',
    title: 'Upbeat Synthwave Ride Mix',
    videoIdOrUrl: 'https://www.youtube.com/watch?v=4xDzrJKXOOY',
  },
];

const VALID_POWER_CURVES = new Set(['auto', 'ex3-vector', 'sport-compact', 'echelon-official']);

export function loadAthleteProfile(): AthleteProfile {
  try {
    const raw = localStorage.getItem(ATHLETE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ATHLETE_PROFILE };
    const parsed = JSON.parse(raw) as Partial<AthleteProfile>;
    const powerCurve =
      parsed.powerCurve && VALID_POWER_CURVES.has(parsed.powerCurve)
        ? parsed.powerCurve
        : DEFAULT_ATHLETE_PROFILE.powerCurve;
    return {
      ...DEFAULT_ATHLETE_PROFILE,
      ...parsed,
      powerCurve,
    };
  } catch {
    return { ...DEFAULT_ATHLETE_PROFILE };
  }
}

export function saveAthleteProfile(profile: AthleteProfile): void {
  localStorage.setItem(ATHLETE_STORAGE_KEY, JSON.stringify(profile));
}

export function loadStravaConfig(): StravaConfig {
  try {
    const raw = localStorage.getItem(STRAVA_STORAGE_KEY);
    if (!raw) {
      return { clientId: '', clientSecret: '' };
    }
    const parsed = JSON.parse(raw) as Partial<StravaConfig>;
    return {
      clientId: parsed.clientId || '',
      clientSecret: parsed.clientSecret || '',
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAtSec: parsed.expiresAtSec,
      athleteName: parsed.athleteName,
      athleteAvatar: parsed.athleteAvatar,
      athleteId: parsed.athleteId,
    };
  } catch {
    return { clientId: '', clientSecret: '' };
  }
}

export function saveStravaConfig(config: StravaConfig): void {
  localStorage.setItem(STRAVA_STORAGE_KEY, JSON.stringify(config));
}

export function loadGarminConfig(): GarminConfig {
  try {
    const raw = localStorage.getItem(GARMIN_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as GarminConfig;
  } catch {
    return {};
  }
}

export function saveGarminConfig(config: GarminConfig): void {
  localStorage.setItem(GARMIN_STORAGE_KEY, JSON.stringify(config));
}

export function loadYouTubePresets(): { lastUrl: string; presets: YouTubePreset[] } {
  try {
    const raw = localStorage.getItem(YOUTUBE_STORAGE_KEY);
    if (!raw) {
      return {
        lastUrl: DEFAULT_YOUTUBE_PRESETS[0].videoIdOrUrl,
        presets: DEFAULT_YOUTUBE_PRESETS,
      };
    }
    const parsed = JSON.parse(raw) as { lastUrl?: string; presets?: YouTubePreset[] };
    return {
      lastUrl: parsed.lastUrl || DEFAULT_YOUTUBE_PRESETS[0].videoIdOrUrl,
      presets: parsed.presets?.length ? parsed.presets : DEFAULT_YOUTUBE_PRESETS,
    };
  } catch {
    return {
      lastUrl: DEFAULT_YOUTUBE_PRESETS[0].videoIdOrUrl,
      presets: DEFAULT_YOUTUBE_PRESETS,
    };
  }
}

export function saveYouTubeState(lastUrl: string, presets: YouTubePreset[]): void {
  localStorage.setItem(YOUTUBE_STORAGE_KEY, JSON.stringify({ lastUrl, presets }));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RIDES_STORE)) {
        const store = db.createObjectStore(RIDES_STORE, { keyPath: 'id' });
        store.createIndex('startedAtIso', 'startedAtIso', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRideToDb(ride: SavedRide): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RIDES_STORE, 'readwrite');
    tx.objectStore(RIDES_STORE).put(ride);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function listSavedRides(): Promise<SavedRide[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RIDES_STORE, 'readonly');
    const req = tx.objectStore(RIDES_STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result as SavedRide[]).sort((a, b) =>
        b.startedAtIso.localeCompare(a.startedAtIso)
      );
      db.close();
      resolve(items);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteSavedRide(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RIDES_STORE, 'readwrite');
    tx.objectStore(RIDES_STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
