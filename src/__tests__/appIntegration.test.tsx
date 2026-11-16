import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { resolveLegalRouteFromPathname } from '../utils/legalRoutes';
import { listSavedRides, saveGarminConfig, saveStravaConfig } from '../services/storage';

describe('End-to-End Studio App Integration & Regression Suite', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('boots with safe generic starter defaults (Rider, 5\'8", 165#, 150W FTP, 180 HR) and recalibrates zones live', () => {
    render(<App />);

    // Verify topbar athlete chip shows safe starter numbers (never high 257W / 196 HR defaults)
    const chip = document.getElementById('athlete-stats-chip');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('Rider');
    expect(chip?.textContent).toContain('165#');
    expect(chip?.textContent).toContain('150W FTP');
    expect(chip?.textContent).toContain('180 HR');

    // Open Athlete Profile modal and customize FTP to 220W
    fireEvent.click(chip!);
    expect(document.getElementById('athlete-profile-modal')).toBeInTheDocument();

    const ftpInput = document.getElementById('athlete-ftp-watts') as HTMLInputElement;
    fireEvent.change(ftpInput, { target: { value: '220' } });
    expect(chip?.textContent).toContain('220W FTP');

    // Reset back to safe starter defaults
    fireEvent.click(document.getElementById('reset-athlete-defaults')!);
    expect(chip?.textContent).toContain('150W FTP');

    fireEvent.click(document.getElementById('save-athlete-done')!);
    expect(document.getElementById('athlete-profile-modal')).not.toBeInTheDocument();
  });

  it('switches cleanly between 2/3-Column Speedometer Rings (with 4th Quad Stats cell) and Classic Bars', () => {
    render(<App />);

    // Default is Speedometer Rings mode with 4th quad stats card
    expect(document.querySelector('.app-shell.mode-rings')).not.toBeNull();
    expect(document.querySelector('.compact-telemetry-quad')).not.toBeNull();
    expect(document.querySelectorAll('.dial-svg').length).toBe(3);

    // Switch to Bars mode
    fireEvent.click(document.getElementById('gauge-mode-bars-btn')!);
    expect(document.querySelector('.app-shell.mode-bars')).not.toBeNull();
    expect(document.querySelector('.compact-telemetry-quad')).toBeNull();
    expect(window.localStorage.getItem('jbf_gauge_mode_v1')).toBe('bars');

    // Switch back to Rings mode
    fireEvent.click(document.getElementById('gauge-mode-rings-btn')!);
    expect(document.querySelector('.app-shell.mode-rings')).not.toBeNull();
  });

  it('opens Full-Screen Focused Workout Cockpit with visible Start/Pause transport dock and Fullscreen request', async () => {
    const requestFsSpy = vi.fn(async () => {});
    document.documentElement.requestFullscreen = requestFsSpy;

    render(<App />);

    fireEvent.click(document.getElementById('open-focus-mode-btn')!);
    const modal = document.getElementById('focus-workout-modal');
    expect(modal).toBeInTheDocument();
    expect(requestFsSpy).toHaveBeenCalled();

    // Regression guard: Start Workout button must be prominently rendered inside .focus-transport-dock
    const startBtn = document.getElementById('focus-play-resume-btn');
    expect(startBtn).toBeInTheDocument();
    expect(startBtn?.closest('.focus-transport-dock')).not.toBeNull();
    expect(startBtn?.textContent).toContain('Start Workout');

    // Start and Pause inside Focus Cockpit
    fireEvent.click(startBtn!);
    const pauseBtn = document.getElementById('focus-pause-btn');
    expect(pauseBtn).toBeInTheDocument();
    expect(pauseBtn?.textContent).toContain('Pause Workout');

    fireEvent.click(pauseBtn!);
    const resumeBtn = document.getElementById('focus-play-resume-btn');
    expect(resumeBtn?.textContent).toContain('Resume Workout');

    // Exit Focus Mode
    fireEvent.click(document.getElementById('close-focus-modal-btn')!);
    expect(document.getElementById('focus-workout-modal')).not.toBeInTheDocument();
  });

  it('exposes universal Bluetooth Heart Rate pairing + Scan All BLE in DeviceConnectionModal', () => {
    render(<App />);

    fireEvent.click(document.getElementById('open-sensors-btn')!);
    const modal = document.getElementById('device-connection-modal');
    expect(modal).toBeInTheDocument();
    expect(modal?.textContent).toContain('any Bluetooth HR sensor');
    expect(document.getElementById('connect-hr-btn')).toBeInTheDocument();
    expect(document.getElementById('connect-hr-all-btn')).toBeInTheDocument();

    fireEvent.click(document.getElementById('close-device-modal')!);
  });

  it('supports Privacy-First Policy (/privacy) and Terms & Release of Liability (/terms) via both direct URLs and Studio Footer', () => {
    expect(resolveLegalRouteFromPathname('/privacy')).toBe('privacy');
    expect(resolveLegalRouteFromPathname('/terms')).toBe('terms');
    expect(resolveLegalRouteFromPathname('/liability')).toBe('terms');
    expect(resolveLegalRouteFromPathname('/')).toBeNull();

    // Cold boot directly on /terms opens Release of Liability automatically
    window.history.replaceState({}, '', '/terms');
    const { unmount } = render(<App />);

    expect(document.getElementById('legal-privacy-modal')).toBeInTheDocument();
    expect(document.getElementById('terms-liability-content')?.textContent).toContain(
      'Assumption of Risk & Release of Liability'
    );

    // Switch tab to Privacy-First Policy -> updates URL to /privacy
    fireEvent.click(document.getElementById('legal-tab-privacy')!);
    expect(window.location.pathname).toBe('/privacy');
    expect(document.getElementById('privacy-policy-content')?.textContent).toContain(
      'No Accounts. No Tracking. No Paywalls. Just Be Fit.'
    );

    // Close modal -> returns URL cleanly to /
    fireEvent.click(document.getElementById('close-legal-modal')!);
    expect(window.location.pathname).toBe('/');
    expect(document.getElementById('legal-privacy-modal')).not.toBeInTheDocument();

    // Footer buttons also open Privacy and Terms directly
    expect(document.getElementById('studio-footer')?.textContent).toContain('100% Local-First');
    fireEvent.click(document.getElementById('open-privacy-btn')!);
    expect(window.location.pathname).toBe('/privacy');
    expect(document.getElementById('legal-privacy-modal')).toBeInTheDocument();

    unmount();
  });

  it('completes full ride -> saves locally -> edits Photo Studio title/notes -> pushes to BOTH Garmin + Strava in 1 click', async () => {
    vi.useFakeTimers();

    // Pre-connect both Garmin Connect and Strava tokens locally
    saveGarminConfig({
      email: 'rider@example.com',
      athleteName: 'Studio Rider',
      tokens: { oauth1: 'g-o1', oauth2: 'g-o2' },
    });
    saveStravaConfig({
      clientId: '1001',
      clientSecret: 'sec-1001',
      accessToken: 'strava-live-token',
      refreshToken: 'strava-live-refresh',
      expiresAtSec: Math.floor(Date.now() / 1000) + 7200,
      athleteName: 'Studio Rider',
    });

    const fetchCalls: Array<{ url: string; body?: unknown }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      fetchCalls.push({ url, body: init?.body });

      if (url.includes('/api/garmin-sync')) {
        return new Response(
          JSON.stringify({
            ok: true,
            activityId: 777888,
            tokens: { oauth1: 'g-o1', oauth2: 'g-o2-fresh' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url === 'https://www.strava.com/api/v3/uploads') {
        return new Response(
          JSON.stringify({ id: 501, status: 'Ready', error: null, activity_id: null }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/v3/uploads/501')) {
        return new Response(
          JSON.stringify({ id: 501, status: 'Ready', error: null, activity_id: 999111 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    render(<App />);

    // 1. Enable Simulator & start workout
    fireEvent.click(document.getElementById('toggle-sim-quick-btn')!);
    fireEvent.click(document.getElementById('start-ride-btn')!);

    // Advance 6 seconds so trackPoints, watts, HR, distance & calories accumulate
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6200);
    });

    // Switch back to real timers for IndexedDB & async UI assertions
    vi.useRealTimers();

    // 2. Finish & Save workout
    await act(async () => {
      fireEvent.click(document.getElementById('finish-save-ride-btn')!);
    });

    await waitFor(async () => {
      const saved = await listSavedRides();
      expect(saved.length).toBe(1);
      expect(document.getElementById('history-strava-modal')).toBeInTheDocument();
    });

    // Post-ride History & Cloud Sync modal opens automatically with Photo Studio visible
    expect(screen.getByText(/Workout Title \(Strava & Garmin\)/i)).toBeInTheDocument();

    // 3. Edit title & post-ride notes in Photo Studio and switch overlay style
    const notesInput = screen.getByPlaceholderText(/Crushed the final All-Out/i);
    fireEvent.change(notesInput, { target: { value: 'Awesome local-first spin!' } });
    fireEvent.blur(notesInput);

    // Wait for IndexedDB metadata save to update highlightedRide before pushing
    await waitFor(async () => {
      const saved = await listSavedRides();
      expect(saved[0]?.notes).toBe('Awesome local-first spin!');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Speedo Rings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clean Sticker' }));

    // 4. Click Zwift-style 1-click "Push to Garmin + Strava"
    const dualSyncBtn = document.getElementById('push-both-btn');
    expect(dualSyncBtn).not.toBeNull();
    expect(dualSyncBtn?.textContent).toContain('Push to Garmin + Strava');

    await act(async () => {
      fireEvent.click(dualSyncBtn!);
    });

    await waitFor(
      () => {
        expect(
          document.querySelector('a[href="https://connect.garmin.com/modern/activity/777888"]')
        ).not.toBeNull();
        expect(
          document.querySelector('a[href="https://www.strava.com/activities/999111"]')
        ).not.toBeNull();
      },
      { timeout: 6000 }
    );

    // Verify Garmin used 'import' mode so Garmin will NOT forward a duplicate ride to Strava
    const garminCall = fetchCalls.find((c) => c.url.includes('/api/garmin-sync'));
    expect(garminCall).toBeDefined();
    const garminBody = JSON.parse(String(garminCall?.body));
    expect(garminBody.uploadMode).toBe('import');
    expect(garminBody.description).toContain('Awesome local-first spin!');
  });
});
