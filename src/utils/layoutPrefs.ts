export type GaugeTileId =
  | 'power'
  | 'cadence'
  | 'hr'
  | 'speed'
  | 'distance'
  | 'calories'
  | 'avgPower';

export type InfoTileId = 'stats' | 'interval' | 'zones';

export type CockpitTileId = GaugeTileId | InfoTileId;
export type SecondaryStatId = 'speed' | 'distance' | 'calories' | 'avgPower' | 'burnTime';
export type QuadStatId = 'speed' | 'distance' | 'calories' | 'avgPower';
export type TopbarActionId = 'sensors' | 'youtube' | 'pip' | 'simulate' | 'history';
export type TransportControlId = 'gaugeMode' | 'focus' | 'rideAction' | 'audio';

export interface LayoutPreferences {
  tileOrder: CockpitTileId[];
  secondaryStatOrder: SecondaryStatId[];
  topbarActionOrder: TopbarActionId[];
  transportControlOrder: TransportControlId[];
}

export const MIN_ACTIVE_TILES = 3;
export const MAX_ACTIVE_TILES = 6;

export const ALL_COCKPIT_TILES: readonly CockpitTileId[] = [
  'power',
  'cadence',
  'hr',
  'speed',
  'distance',
  'calories',
  'avgPower',
  'stats',
  'interval',
  'zones',
];

export const DEFAULT_TILE_ORDER: readonly CockpitTileId[] = [
  'power',
  'cadence',
  'hr',
  'stats',
  'interval',
  'zones',
];

export const DEFAULT_SECONDARY_STAT_ORDER: readonly SecondaryStatId[] = [
  'speed',
  'distance',
  'calories',
  'avgPower',
  'burnTime',
];

export const DEFAULT_TOPBAR_ACTION_ORDER: readonly TopbarActionId[] = [
  'sensors',
  'youtube',
  'pip',
  'simulate',
  'history',
];

export const DEFAULT_TRANSPORT_CONTROL_ORDER: readonly TransportControlId[] = [
  'gaugeMode',
  'focus',
  'rideAction',
  'audio',
];

export const GAUGE_TILE_IDS: ReadonlySet<GaugeTileId> = new Set([
  'power',
  'cadence',
  'hr',
  'speed',
  'distance',
  'calories',
  'avgPower',
]);

export const QUAD_STAT_IDS: ReadonlySet<QuadStatId> = new Set([
  'speed',
  'distance',
  'calories',
  'avgPower',
]);

export function isGaugeTileId(id: CockpitTileId): id is GaugeTileId {
  return GAUGE_TILE_IDS.has(id as GaugeTileId);
}

export function createDefaultLayoutPrefs(): LayoutPreferences {
  return {
    tileOrder: [...DEFAULT_TILE_ORDER],
    secondaryStatOrder: [...DEFAULT_SECONDARY_STAT_ORDER],
    topbarActionOrder: [...DEFAULT_TOPBAR_ACTION_ORDER],
    transportControlOrder: [...DEFAULT_TRANSPORT_CONTROL_ORDER],
  };
}

export interface LayoutItemMeta {
  label: string;
  shortLabel: string;
  description: string;
  kindTag?: string;
}

export const COCKPIT_TILE_META: Record<CockpitTileId, LayoutItemMeta> = {
  power: {
    label: 'Power',
    shortLabel: 'Power',
    description: 'Live watts, % FTP, and W/kg gauge',
    kindTag: 'Gauge',
  },
  cadence: {
    label: 'Cadence & Gear',
    shortLabel: 'Cadence',
    description: 'RPM gauge and bike resistance stepper',
    kindTag: 'Gauge',
  },
  hr: {
    label: 'Heart Rate',
    shortLabel: 'Heart Rate',
    description: 'Live BPM, % Max HR, and Burn threshold',
    kindTag: 'Gauge',
  },
  speed: {
    label: 'Speed',
    shortLabel: 'Speed',
    description: 'Live virtual mph & km/h aero speedometer',
    kindTag: 'Gauge',
  },
  distance: {
    label: 'Distance',
    shortLabel: 'Distance',
    description: 'Miles & km gauge (tracks challenge goal when active)',
    kindTag: 'Gauge',
  },
  calories: {
    label: 'Calories',
    shortLabel: 'Calories',
    description: 'Active kcal total & live kcal/hr burn rate',
    kindTag: 'Gauge',
  },
  avgPower: {
    label: 'Avg / NP Power',
    shortLabel: 'Avg Power',
    description: 'Session average watts, NP & Avg W/kg vs FTP',
    kindTag: 'Gauge',
  },
  stats: {
    label: 'Ride Stats Quad',
    shortLabel: 'Ride Stats',
    description: '4-in-1 compact Speed, Distance, Calories & Avg/NP card',
    kindTag: 'Summary',
  },
  interval: {
    label: 'Interval / Goal',
    shortLabel: 'Interval',
    description: 'Active workout block targets, countdown & next up',
    kindTag: 'Workout',
  },
  zones: {
    label: 'Time in Zones',
    shortLabel: 'Zones',
    description: 'Zone 1–5 time distribution breakdown',
    kindTag: 'Workout',
  },
};

export const SECONDARY_STAT_META: Record<SecondaryStatId, LayoutItemMeta> = {
  speed: {
    label: 'Virtual Speed',
    shortLabel: 'Speed',
    description: 'Estimated indoor mph & aero profile',
  },
  distance: {
    label: 'Distance',
    shortLabel: 'Distance',
    description: 'Total miles and kilometers',
  },
  calories: {
    label: 'Active Calories',
    shortLabel: 'Calories',
    description: 'Power & HR calibrated kcal burn',
  },
  avgPower: {
    label: 'Avg / NP Power',
    shortLabel: 'Avg / NP',
    description: 'Average & Normalized Power watts',
  },
  burnTime: {
    label: 'Burn Zone Time',
    shortLabel: 'Burn Time',
    description: 'Time in Z4 + Z5 (pinned footer in Quad)',
  },
};

export const TOPBAR_ACTION_META: Record<TopbarActionId, LayoutItemMeta> = {
  sensors: {
    label: 'Pair Sensors',
    shortLabel: 'Sensors',
    description: 'Bluetooth bike, power meter & HR monitor',
  },
  youtube: {
    label: 'YouTube',
    shortLabel: 'YouTube',
    description: 'Split Cinema & floating corner video player',
  },
  pip: {
    label: 'HUD PiP',
    shortLabel: 'HUD PiP',
    description: 'Pop-out floating telemetry over other apps',
  },
  simulate: {
    label: 'Simulate',
    shortLabel: 'Simulate',
    description: 'Interactive ride demo & effort presets',
  },
  history: {
    label: 'Rides & Sync',
    shortLabel: 'Rides',
    description: 'Ride history, Photo Studio, Garmin & Strava',
  },
};

export const TRANSPORT_CONTROL_META: Record<TransportControlId, LayoutItemMeta> = {
  gaugeMode: {
    label: 'Rings / Bars Switcher',
    shortLabel: 'Rings/Bars',
    description: 'Switch between Speedometer Rings and Horizontal Bars',
  },
  focus: {
    label: 'Focus Mode',
    shortLabel: 'Focus',
    description: 'Full-screen cockpit with interval targets',
  },
  rideAction: {
    label: 'Start / Pause & Stop',
    shortLabel: 'Start/Pause',
    description: 'Primary workout transport buttons (kept grouped)',
  },
  audio: {
    label: 'Coach Audio',
    shortLabel: 'Audio',
    description: 'Ambient voice cues & interval chimes toggle',
  },
};

export interface LayoutPreset {
  id: 'default' | 'no-hr' | 'hr-first' | 'clean-4';
  name: string;
  summary: string;
  prefs: LayoutPreferences;
}

export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    id: 'default',
    name: 'Studio Default',
    summary: 'Power · Cadence · HR + Stats',
    prefs: createDefaultLayoutPrefs(),
  },
  {
    id: 'no-hr',
    name: 'No Heart Rate',
    summary: 'Power · Cadence · Speed · Distance',
    prefs: {
      tileOrder: ['power', 'cadence', 'speed', 'distance', 'stats', 'interval'],
      secondaryStatOrder: ['speed', 'distance', 'calories', 'avgPower', 'burnTime'],
      topbarActionOrder: ['sensors', 'youtube', 'pip', 'simulate', 'history'],
      transportControlOrder: ['gaugeMode', 'focus', 'rideAction', 'audio'],
    },
  },
  {
    id: 'hr-first',
    name: 'Heart Rate First',
    summary: 'HR & Zones front-and-center',
    prefs: {
      tileOrder: ['hr', 'power', 'cadence', 'zones', 'stats', 'interval'],
      secondaryStatOrder: ['burnTime', 'calories', 'avgPower', 'distance', 'speed'],
      topbarActionOrder: ['sensors', 'pip', 'youtube', 'history', 'simulate'],
      transportControlOrder: ['rideAction', 'focus', 'gaugeMode', 'audio'],
    },
  },
  {
    id: 'clean-4',
    name: 'Clean 4-Tile',
    summary: 'Big 2×2: Power · Cadence · Speed · Distance',
    prefs: {
      tileOrder: ['power', 'cadence', 'speed', 'distance'],
      secondaryStatOrder: ['calories', 'avgPower', 'burnTime', 'speed', 'distance'],
      topbarActionOrder: ['sensors', 'pip', 'youtube', 'history', 'simulate'],
      transportControlOrder: ['rideAction', 'gaugeMode', 'focus', 'audio'],
    },
  },
];

export function sanitizeOrder<T extends string>(raw: unknown, defaults: readonly T[]): T[] {
  const valid = new Set<string>(defaults);
  const seen = new Set<T>();
  const result: T[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string' && valid.has(entry)) {
        const typed = entry as T;
        if (!seen.has(typed)) {
          seen.add(typed);
          result.push(typed);
        }
      }
    }
  }

  for (const fallback of defaults) {
    if (!seen.has(fallback)) {
      result.push(fallback);
    }
  }

  return result;
}

/**
 * Sanitizes the user's chosen active cockpit tiles (3 to 6 unique valid tile IDs).
 * Unlike sanitizeOrder, this preserves customized tile selections (such as removing HR
 * and replacing it with Speed or Distance).
 */
export function sanitizeActiveTiles(raw: unknown): CockpitTileId[] {
  const valid = new Set<string>(ALL_COCKPIT_TILES);
  const seen = new Set<CockpitTileId>();
  const result: CockpitTileId[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string' && valid.has(entry)) {
        const typed = entry as CockpitTileId;
        if (!seen.has(typed) && result.length < MAX_ACTIVE_TILES) {
          seen.add(typed);
          result.push(typed);
        }
      }
    }
  }

  if (result.length === 0) {
    return [...DEFAULT_TILE_ORDER];
  }

  for (const fallback of DEFAULT_TILE_ORDER) {
    if (result.length >= MIN_ACTIVE_TILES) break;
    if (!seen.has(fallback)) {
      seen.add(fallback);
      result.push(fallback);
    }
  }

  return result;
}

export function sanitizeLayoutPrefs(raw: unknown): LayoutPreferences {
  if (!raw || typeof raw !== 'object') {
    return createDefaultLayoutPrefs();
  }
  const obj = raw as Record<string, unknown>;
  return {
    tileOrder: sanitizeActiveTiles(obj.tileOrder),
    secondaryStatOrder: sanitizeOrder(obj.secondaryStatOrder, DEFAULT_SECONDARY_STAT_ORDER),
    topbarActionOrder: sanitizeOrder(obj.topbarActionOrder, DEFAULT_TOPBAR_ACTION_ORDER),
    transportControlOrder: sanitizeOrder(obj.transportControlOrder, DEFAULT_TRANSPORT_CONTROL_ORDER),
  };
}

export function moveOrderItem<T extends string>(
  order: readonly T[],
  item: T,
  delta: -1 | 1
): T[] {
  const idx = order.indexOf(item);
  if (idx === -1) return [...order];
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= order.length) return [...order];
  const next = [...order];
  const [moved] = next.splice(idx, 1);
  next.splice(targetIdx, 0, moved);
  return next;
}

export function moveOrderItemWithinSubset<T extends string>(
  order: readonly T[],
  visibleSubset: readonly T[],
  item: T,
  delta: -1 | 1
): T[] {
  const visibleIdx = visibleSubset.indexOf(item);
  if (visibleIdx === -1) return [...order];
  const neighborIdx = visibleIdx + delta;
  if (neighborIdx < 0 || neighborIdx >= visibleSubset.length) return [...order];

  const neighbor = visibleSubset[neighborIdx];
  const fullIdxA = order.indexOf(item);
  const fullIdxB = order.indexOf(neighbor);
  if (fullIdxA === -1 || fullIdxB === -1) return [...order];

  const next = [...order];
  next[fullIdxA] = neighbor;
  next[fullIdxB] = item;
  return next;
}

export function reorderOrderItem<T extends string>(
  order: readonly T[],
  draggedId: T,
  targetId: T
): T[] {
  if (draggedId === targetId) return [...order];
  const fromIdx = order.indexOf(draggedId);
  const toIdx = order.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return [...order];
  const next = [...order];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export function addActiveTile(
  order: readonly CockpitTileId[],
  tileId: CockpitTileId
): CockpitTileId[] {
  if (order.includes(tileId) || order.length >= MAX_ACTIVE_TILES) return [...order];
  return [...order, tileId];
}

export function removeActiveTile(
  order: readonly CockpitTileId[],
  tileId: CockpitTileId
): CockpitTileId[] {
  if (!order.includes(tileId) || order.length <= MIN_ACTIVE_TILES) return [...order];
  return order.filter((id) => id !== tileId);
}

export function replaceActiveTile(
  order: readonly CockpitTileId[],
  targetTileId: CockpitTileId,
  nextTileId: CockpitTileId
): CockpitTileId[] {
  if (targetTileId === nextTileId) return [...order];
  const targetIdx = order.indexOf(targetTileId);
  if (targetIdx === -1) return [...order];
  if (order.includes(nextTileId)) {
    return reorderOrderItem(order, nextTileId, targetTileId);
  }
  const next = [...order];
  next[targetIdx] = nextTileId;
  return next;
}

export function getAvailableTiles(activeOrder: readonly CockpitTileId[]): CockpitTileId[] {
  const activeSet = new Set(activeOrder);
  return ALL_COCKPIT_TILES.filter((id) => !activeSet.has(id));
}

/**
 * Resolves the 3 gauge-capable tiles shown in Horizontal Bars mode and Floating PiP HUD,
 * respecting the rider's active tile choices (e.g., Power + Cadence + Speed when HR is swapped out).
 */
export function getPrimaryGaugeOrder(tileOrder: readonly CockpitTileId[]): GaugeTileId[] {
  const chosen = tileOrder.filter(isGaugeTileId).slice(0, 3);
  const fallbacks: readonly GaugeTileId[] = ['power', 'cadence', 'speed', 'distance', 'hr'];
  for (const fb of fallbacks) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(fb)) {
      chosen.push(fb);
    }
  }
  return chosen;
}

/** Resolves the top 3–4 active tiles displayed in Full-Screen Focus Mode & Phone 2x2 view. */
export function getFocusTileOrder(tileOrder: readonly CockpitTileId[]): CockpitTileId[] {
  return tileOrder.slice(0, 4);
}

export function getQuadStatOrder(secondaryStatOrder: readonly SecondaryStatId[]): QuadStatId[] {
  return secondaryStatOrder.filter((id): id is QuadStatId =>
    QUAD_STAT_IDS.has(id as QuadStatId)
  );
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, idx) => item === b[idx]);
}

export function layoutPrefsEqual(a: LayoutPreferences, b: LayoutPreferences): boolean {
  return (
    arraysEqual(a.tileOrder, b.tileOrder) &&
    arraysEqual(a.secondaryStatOrder, b.secondaryStatOrder) &&
    arraysEqual(a.topbarActionOrder, b.topbarActionOrder) &&
    arraysEqual(a.transportControlOrder, b.transportControlOrder)
  );
}

export function isDefaultLayoutPrefs(prefs: LayoutPreferences): boolean {
  return layoutPrefsEqual(prefs, createDefaultLayoutPrefs());
}
