/**
 * Seamless PWA Update Checker (Zero Service-Worker Trap, 100% Local-Data Safe).
 *
 * Installed Home-Screen PWAs (especially on iOS Safari and Android Chrome) often keep
 * the existing page in memory across days of sleep/resume without performing a full
 * navigation. Calling `window.location.reload()` fetches the fresh `index.html` and new
 * hashed `/assets/index-*.js` bundle while keeping `localStorage` (Athlete Profile,
 * Strava/Garmin tokens, YouTube presets) and `IndexedDB` (ride history) 100% intact.
 *
 * Crucially, we NEVER auto-reload while a workout is active (`isRideActive() === true`).
 */

const PRELOAD_RELOAD_GUARD_KEY = 'jbf_preload_reload_at_v1';

export function installVitePreloadErrorRecovery(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', () => {
    try {
      const last = Number(window.sessionStorage.getItem(PRELOAD_RELOAD_GUARD_KEY) || '0');
      if (Date.now() - last < 15_000) return;
      window.sessionStorage.setItem(PRELOAD_RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
      // sessionStorage unavailable
    }
    window.location.reload();
  });
}

export async function checkRemoteBuildUpdate(currentBuildId: string): Promise<boolean> {
  if (!currentBuildId) return false;
  try {
    const resp = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { buildId?: string };
    return Boolean(data.buildId && data.buildId !== currentBuildId);
  } catch {
    return false;
  }
}
