import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

function getMainTileIds(): string[] {
  return Array.from(document.querySelectorAll('.metrics-grid > [data-tile-id]')).map(
    (el) => el.getAttribute('data-tile-id') || ''
  );
}

function getFocusTileIds(): string[] {
  return Array.from(document.querySelectorAll('.focus-four-grid > [data-tile-id]')).map(
    (el) => el.getAttribute('data-tile-id') || ''
  );
}

function getTopbarActionIds(): string[] {
  return Array.from(document.querySelectorAll('.topbar-actions [data-action-id]')).map(
    (el) => el.getAttribute('data-action-id') || ''
  );
}

function getTransportControlIds(): string[] {
  return Array.from(document.querySelectorAll('.transport-controls [data-control-id]')).map(
    (el) => el.getAttribute('data-control-id') || ''
  );
}

function getSecondaryStatIds(): string[] {
  return Array.from(document.querySelectorAll('.secondary-strip > [data-stat-id]')).map(
    (el) => el.getAttribute('data-stat-id') || ''
  );
}

function getQuadStatIds(): string[] {
  return Array.from(document.querySelectorAll('#compact-all-stats-card [data-stat-id]')).map(
    (el) => el.getAttribute('data-stat-id') || ''
  );
}

describe('Layout Personalization: Selectable Main Tiles, Reordering & Arrange Mode', () => {
  it('swaps Heart Rate out for Distance or Speed in 1 tap and syncs Rings, Bars, Focus Mode, and persistence', () => {
    const { unmount } = render(<App />);

    // Default layout matches classic order
    expect(getMainTileIds()).toEqual(['power', 'cadence', 'hr', 'stats', 'interval', 'zones']);
    expect(getTopbarActionIds()).toEqual(['sensors', 'youtube', 'pip', 'simulate', 'history']);
    expect(getTransportControlIds()).toEqual(['gaugeMode', 'focus', 'rideAction', 'audio']);
    expect(document.querySelector('.app-shell.has-cockpit-stats.has-cockpit-zones')).not.toBeNull();

    // Open Customize Layout modal
    fireEvent.click(document.getElementById('customize-layout-btn')!);
    expect(document.getElementById('customize-layout-modal')).toBeInTheDocument();

    // 1-tap Swap In: replace Heart Rate (#3) with Distance
    fireEvent.click(document.getElementById('swap-tile-distance')!);
    fireEvent.click(document.getElementById('swap-distance-into-hr')!);

    expect(getMainTileIds()).toEqual(['power', 'cadence', 'distance', 'stats', 'interval', 'zones']);
    expect(document.getElementById('hr-metric-card')).toBeNull();
    expect(document.getElementById('distance-metric-card')).toBeInTheDocument();

    // Close modal & verify Bars mode displays Power, Cadence, Distance (no dead HR bar)
    fireEvent.click(document.getElementById('save-layout-done-btn')!);
    fireEvent.click(document.getElementById('gauge-mode-bars-btn')!);
    expect(getMainTileIds()).toEqual(['power', 'cadence', 'distance']);

    // Switch back to Rings and open Focus Mode -> displays Power, Cadence, Distance, Ride Stats
    fireEvent.click(document.getElementById('gauge-mode-rings-btn')!);
    fireEvent.click(document.getElementById('open-focus-mode-btn')!);
    expect(getFocusTileIds()).toEqual(['power', 'cadence', 'distance', 'stats']);

    // Open Customize Layout directly from Focus Mode and swap Speed into Cadence
    fireEvent.click(document.getElementById('focus-customize-layout-btn')!);
    expect(document.getElementById('customize-layout-modal')).toBeInTheDocument();
    fireEvent.click(document.getElementById('swap-tile-speed')!);
    fireEvent.click(document.getElementById('swap-speed-into-cadence')!);
    expect(getFocusTileIds()).toEqual(['power', 'speed', 'distance', 'stats']);

    // Escape closes Customize Layout modal without closing Focus Mode underneath
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.getElementById('customize-layout-modal')).not.toBeInTheDocument();
    expect(document.getElementById('focus-workout-modal')).toBeInTheDocument();

    // Unmount & remount -> custom tile choices persist from localStorage
    unmount();
    render(<App />);
    expect(getMainTileIds()).toEqual(['power', 'speed', 'distance', 'stats', 'interval', 'zones']);
  });

  it('applies No Heart Rate & Clean 4-Tile presets, enforces 3-6 tile bounds, and updates smart non-duplication flags', () => {
    render(<App />);

    fireEvent.click(document.getElementById('customize-layout-btn')!);

    // Apply "No Heart Rate" preset -> swaps HR for Speed & Distance, drops Zones so graph shows zones
    fireEvent.click(document.getElementById('layout-preset-no-hr')!);
    expect(getMainTileIds()).toEqual(['power', 'cadence', 'speed', 'distance', 'stats', 'interval']);
    expect(document.querySelector('.app-shell.has-cockpit-stats')).not.toBeNull();
    expect(document.querySelector('.app-shell.has-cockpit-zones')).toBeNull();

    // Apply "Clean 4-Tile" preset -> 4 gauges, Ride Stats removed so secondary strip stays visible
    fireEvent.click(document.getElementById('layout-preset-clean-4')!);
    expect(getMainTileIds()).toEqual(['power', 'cadence', 'speed', 'distance']);
    expect(document.querySelector('.metrics-grid')?.getAttribute('data-tile-count')).toBe('4');
    expect(document.querySelector('.app-shell.has-cockpit-stats')).toBeNull();
    expect(document.querySelector('.app-shell.has-portrait-stats')).toBeNull();

    // Remove down to minimum 3 tiles -> further remove buttons become disabled
    fireEvent.click(document.getElementById('cockpit-tiles-order-list-remove-distance')!);
    expect(getMainTileIds()).toEqual(['power', 'cadence', 'speed']);
    expect(
      (document.getElementById('cockpit-tiles-order-list-remove-speed') as HTMLButtonElement)
        .disabled
    ).toBe(true);

    // Add Calories & Avg Power up to 5 tiles -> both render live gauge cards
    fireEvent.click(document.getElementById('add-tile-calories')!);
    fireEvent.click(document.getElementById('add-tile-avgPower')!);
    expect(getMainTileIds()).toEqual(['power', 'cadence', 'speed', 'calories', 'avgPower']);
    expect(document.querySelector('.metrics-grid')?.getAttribute('data-tile-count')).toBe('5');
    expect(document.getElementById('calories-metric-card')).toBeInTheDocument();
    expect(document.getElementById('avg-power-metric-card')).toBeInTheDocument();

    // Reset restores Studio Default
    fireEvent.click(document.getElementById('reset-layout-defaults-btn')!);
    expect(getMainTileIds()).toEqual(['power', 'cadence', 'hr', 'stats', 'interval', 'zones']);
  });

  it('reorders Ride Stats, Topbar Action Icons, and Workout Controls via modal arrows and drag-and-drop', () => {
    render(<App />);
    fireEvent.click(document.getElementById('customize-layout-btn')!);

    // Move Distance earlier in Ride Stats -> updates both RideStatsQuadCard and secondary strip
    fireEvent.click(document.getElementById('secondary-stats-order-list-up-distance')!);
    expect(getSecondaryStatIds()).toEqual(['distance', 'speed', 'calories', 'avgPower', 'burnTime']);
    expect(getQuadStatIds()).toEqual(['distance', 'speed', 'calories', 'avgPower']);

    // Switch to Icons & Controls tab
    fireEvent.click(document.getElementById('layout-tab-controls')!);
    expect(document.getElementById('layout-panel-controls')).toBeInTheDocument();

    // Move YouTube to #1 in Topbar Actions via arrow button
    fireEvent.click(document.getElementById('topbar-actions-order-list-up-youtube')!);
    expect(getTopbarActionIds()).toEqual(['youtube', 'sensors', 'pip', 'simulate', 'history']);

    // Drag Rides & Sync onto YouTube in the sortable list
    const dataTransfer = {
      data: {} as Record<string, string>,
      effectAllowed: 'move',
      dropEffect: 'move',
      setData(type: string, val: string) {
        this.data[type] = val;
      },
      getData(type: string) {
        return this.data[type] || '';
      },
    };
    const historyRow = document.querySelector(
      '#topbar-actions-order-list [data-order-item="history"]'
    )!;
    const youtubeRow = document.querySelector(
      '#topbar-actions-order-list [data-order-item="youtube"]'
    )!;
    fireEvent.dragStart(historyRow, { dataTransfer });
    fireEvent.dragOver(youtubeRow, { dataTransfer });
    fireEvent.drop(youtubeRow, { dataTransfer });
    fireEvent.dragEnd(historyRow, { dataTransfer });
    expect(getTopbarActionIds()).toEqual(['history', 'youtube', 'sensors', 'pip', 'simulate']);

    // Move Start/Pause (rideAction) to #1 in Workout Controls
    fireEvent.click(document.getElementById('transport-controls-order-list-up-rideAction')!);
    fireEvent.click(document.getElementById('transport-controls-order-list-up-rideAction')!);
    expect(getTransportControlIds()).toEqual(['rideAction', 'gaugeMode', 'focus', 'audio']);
  });

  it('supports Inline Arrange Mode without accidentally firing button actions while arranging', () => {
    render(<App />);

    fireEvent.click(document.getElementById('customize-layout-btn')!);
    fireEvent.click(document.getElementById('start-inline-arrange-btn')!);

    expect(document.getElementById('customize-layout-modal')).not.toBeInTheDocument();
    expect(document.getElementById('arrange-mode-banner')).toBeInTheDocument();

    // Clicking Start or YouTube during Arrange Mode must NOT start a ride or open YouTube
    fireEvent.click(document.getElementById('start-ride-btn')!);
    expect(document.getElementById('pause-ride-btn')).toBeNull();
    fireEvent.click(document.getElementById('toggle-youtube-btn')!);
    expect(document.querySelector('.studio-workspace.split-youtube')).toBeNull();

    // Nudge Heart Rate earlier directly from its card header arrow
    const moveHrEarlier = document.querySelector(
      '#hr-metric-card button[aria-label="Move Heart Rate earlier"]'
    )!;
    fireEvent.click(moveHrEarlier);
    expect(getMainTileIds()).toEqual(['power', 'hr', 'cadence', 'stats', 'interval', 'zones']);

    // Nudge HUD PiP earlier directly from its inline topbar arrange chip
    const movePipEarlier = document.querySelector(
      '.topbar-actions button[aria-label="Move HUD PiP earlier"]'
    )!;
    fireEvent.click(movePipEarlier);
    expect(getTopbarActionIds()).toEqual(['sensors', 'pip', 'youtube', 'simulate', 'history']);

    // Exit Arrange Mode via Done button
    fireEvent.click(document.getElementById('finish-arrange-layout-btn')!);
    expect(document.getElementById('arrange-mode-banner')).not.toBeInTheDocument();

    // Normal clicks work again after exiting Arrange Mode
    fireEvent.click(document.getElementById('toggle-youtube-btn')!);
    expect(document.querySelector('.studio-workspace.split-youtube')).not.toBeNull();
  });
});
