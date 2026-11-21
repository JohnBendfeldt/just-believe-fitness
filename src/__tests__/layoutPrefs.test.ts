import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECONDARY_STAT_ORDER,
  DEFAULT_TILE_ORDER,
  DEFAULT_TOPBAR_ACTION_ORDER,
  DEFAULT_TRANSPORT_CONTROL_ORDER,
  LAYOUT_PRESETS,
  MAX_ACTIVE_TILES,
  MIN_ACTIVE_TILES,
  addActiveTile,
  createDefaultLayoutPrefs,
  getAvailableTiles,
  getFocusTileOrder,
  getPrimaryGaugeOrder,
  getQuadStatOrder,
  isDefaultLayoutPrefs,
  moveOrderItem,
  moveOrderItemWithinSubset,
  removeActiveTile,
  reorderOrderItem,
  replaceActiveTile,
  sanitizeActiveTiles,
  sanitizeLayoutPrefs,
} from '../utils/layoutPrefs';
import {
  LAYOUT_PREFS_STORAGE_KEY,
  loadLayoutPrefs,
  saveLayoutPrefs,
} from '../services/storage';
import {
  DEFAULT_ATHLETE_PROFILE,
  getCalorieZones,
  getDistanceZones,
  getSpeedZones,
  resolveZone,
} from '../utils/zones';
import { renderTelemetryHudCanvas } from '../services/pipHud';
import { makeSampleTelemetry } from '../test/fixtures';
import { getRecordedCanvasCalls } from '../test/setup';

describe('Layout Preferences Model, Selectable Main Tiles & Persistence', () => {
  it('provides safe starter defaults and preserves customized 3-to-6 tile selections across sanitization', () => {
    const defaults = createDefaultLayoutPrefs();
    expect(defaults.tileOrder).toEqual([...DEFAULT_TILE_ORDER]);
    expect(defaults.secondaryStatOrder).toEqual([...DEFAULT_SECONDARY_STAT_ORDER]);
    expect(defaults.topbarActionOrder).toEqual([...DEFAULT_TOPBAR_ACTION_ORDER]);
    expect(defaults.transportControlOrder).toEqual([...DEFAULT_TRANSPORT_CONTROL_ORDER]);
    expect(isDefaultLayoutPrefs(defaults)).toBe(true);

    // Preserves a custom 4-tile No-HR cockpit without forcing HR back in
    const customNoHr = sanitizeActiveTiles(['power', 'cadence', 'speed', 'distance']);
    expect(customNoHr).toEqual(['power', 'cadence', 'speed', 'distance']);

    // Deduplicates, strips invalid entries, and caps at MAX_ACTIVE_TILES (6)
    const noisy = sanitizeActiveTiles([
      'speed',
      'invalid-tile',
      'speed',
      'distance',
      'power',
      'calories',
      'avgPower',
      'cadence',
      'zones',
    ]);
    expect(noisy).toEqual(['speed', 'distance', 'power', 'calories', 'avgPower', 'cadence']);
    expect(noisy.length).toBe(MAX_ACTIVE_TILES);

    // Tops up sparse arrays to MIN_ACTIVE_TILES (3) and recovers empty/corrupt inputs
    const tooSmall = sanitizeActiveTiles(['distance']);
    expect(tooSmall.length).toBe(MIN_ACTIVE_TILES);
    expect(tooSmall[0]).toBe('distance');

    expect(sanitizeLayoutPrefs(null)).toEqual(defaults);
    expect(sanitizeLayoutPrefs('broken')).toEqual(defaults);
  });

  it('supports adding, removing, swapping in place, subset-aware nudging, and drag reordering', () => {
    // 1-tap swap: replace Heart Rate (#3) with Distance directly in place
    const swapped = replaceActiveTile(DEFAULT_TILE_ORDER, 'hr', 'distance');
    expect(swapped).toEqual(['power', 'cadence', 'distance', 'stats', 'interval', 'zones']);
    expect(getAvailableTiles(swapped)).toContain('hr');
    expect(getAvailableTiles(swapped)).not.toContain('distance');

    // Removing respects MIN_ACTIVE_TILES = 3
    let trimmed = removeActiveTile(swapped, 'zones');
    trimmed = removeActiveTile(trimmed, 'interval');
    trimmed = removeActiveTile(trimmed, 'stats');
    expect(trimmed).toEqual(['power', 'cadence', 'distance']);
    expect(removeActiveTile(trimmed, 'distance')).toEqual(['power', 'cadence', 'distance']);

    // Adding respects MAX_ACTIVE_TILES = 6 and prevents duplicates
    const withSpeed = addActiveTile(trimmed, 'speed');
    expect(withSpeed).toEqual(['power', 'cadence', 'distance', 'speed']);
    expect(addActiveTile(withSpeed, 'speed')).toEqual(withSpeed);

    // Subset-aware nudge swaps directly with adjacent visible tile (skipping hidden ones)
    const full = ['power', 'interval', 'zones', 'cadence', 'speed', 'stats'] as const;
    const phoneVisible = ['power', 'cadence', 'speed', 'stats'] as const;
    const nudged = moveOrderItemWithinSubset(full, phoneVisible, 'power', 1);
    expect(nudged).toEqual(['cadence', 'interval', 'zones', 'power', 'speed', 'stats']);

    // Standard move & drag reorder
    expect(moveOrderItem(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveOrderItem(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(reorderOrderItem(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('derives Bars/PiP gauge order, Focus tile order, and Quad stat order cleanly', () => {
    const noHrPreset = LAYOUT_PRESETS.find((p) => p.id === 'no-hr')!;
    expect(getPrimaryGaugeOrder(noHrPreset.prefs.tileOrder)).toEqual([
      'power',
      'cadence',
      'speed',
    ]);
    expect(getFocusTileOrder(noHrPreset.prefs.tileOrder)).toEqual([
      'power',
      'cadence',
      'speed',
      'distance',
    ]);

    // If user puts only info cards in slots 1-3, Bars/PiP safely tops up to 3 gauge tiles
    expect(getPrimaryGaugeOrder(['stats', 'interval', 'zones', 'distance'])).toEqual([
      'distance',
      'power',
      'cadence',
    ]);

    expect(
      getQuadStatOrder(['burnTime', 'avgPower', 'distance', 'calories', 'speed'])
    ).toEqual(['avgPower', 'distance', 'calories', 'speed']);
  });

  it('persists and restores customized layout preferences from localStorage safely', () => {
    const custom = LAYOUT_PRESETS.find((p) => p.id === 'clean-4')!.prefs;
    saveLayoutPrefs(custom);
    expect(loadLayoutPrefs()).toEqual(custom);

    // Corrupt localStorage falls back cleanly to defaults
    window.localStorage.setItem(LAYOUT_PREFS_STORAGE_KEY, '{not-valid-json');
    expect(loadLayoutPrefs()).toEqual(createDefaultLayoutPrefs());
  });

  it('generates valid 5-zone gauge scales for Speed, Distance (open & challenge), and Calories', () => {
    const speedZones = getSpeedZones();
    expect(speedZones.length).toBe(5);
    expect(resolveZone(18.5, speedZones).zone).toBe(3);
    expect(resolveZone(25.2, speedZones).zone).toBe(5);

    const openDistZones = getDistanceZones();
    expect(openDistZones.length).toBe(5);
    expect(resolveZone(12.5, openDistZones).zone).toBe(4);

    const challenge50kZones = getDistanceZones(50);
    expect(challenge50kZones.map((z) => z.minValue)).toEqual([0, 10, 20, 30, 40]);
    expect(resolveZone(42, challenge50kZones).zone).toBe(5);

    const calZones = getCalorieZones();
    expect(calZones.length).toBe(5);
    expect(resolveZone(450, calZones).zone).toBe(4);
  });

  it('renders Floating PiP HUD gauges in customized tile order including Speed, Distance, Calories, and Avg Power', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;

    renderTelemetryHudCanvas(canvas, {
      telemetry: makeSampleTelemetry({ powerWatts: 215, speedMph: 21.4 }),
      profile: DEFAULT_ATHLETE_PROFILE,
      elapsedSec: 900,
      burnPoints: 5,
      distanceMeters: 8046.72,
      caloriesKcal: 310,
      avgRideWatts: 195,
      npRideWatts: 204,
      gaugeMode: 'rings',
      primaryMetricOrder: ['distance', 'speed', 'power'],
    });

    const labelCalls = getRecordedCanvasCalls(canvas)
      .filter((c) => c.op === 'fillText')
      .map((c) => ({ text: String(c.args[0]), x: Number(c.args[1]) }));

    const distCall = labelCalls.find((c) => c.text === 'DISTANCE');
    const speedCall = labelCalls.find((c) => c.text === 'SPEED');
    const powerCall = labelCalls.find((c) => c.text === 'POWER');
    const hrCall = labelCalls.find((c) => c.text === 'HEART RATE');

    expect(distCall).toBeDefined();
    expect(speedCall).toBeDefined();
    expect(powerCall).toBeDefined();
    expect(hrCall).toBeUndefined();
    expect(distCall!.x).toBeLessThan(speedCall!.x);
    expect(speedCall!.x).toBeLessThan(powerCall!.x);
  });
});
