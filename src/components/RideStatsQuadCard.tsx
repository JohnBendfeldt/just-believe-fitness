import type { SportMode } from '../types/fitness';
import {
  formatDuration,
  formatRowingSplit,
  formatRunningPacePerMile,
  metersToMiles,
  rowingWattsToSplitSecPer500m,
} from '../utils/zones';
import type { QuadStatId } from '../utils/layoutPrefs';
import { TileArrangeArrows, TileArrangeGrip } from './TileReorderControls';
import { getTileArrangeSectionProps, type TileArrangeBinding } from '../utils/tileArrange';

interface RideStatsQuadCardProps {
  id?: string;
  tileId?: string;
  className?: string;
  sport?: SportMode;
  speedMph: number;
  inclinePct?: number;
  paceSecPer500m?: number;
  distanceMeters: number;
  caloriesKcal: number;
  avgRideWatts: number;
  npRideWatts: number;
  burnPoints: number;
  burnZoneTotalSec: number;
  statOrder?: QuadStatId[];
  arrange?: TileArrangeBinding;
}

const DEFAULT_QUAD_ORDER: QuadStatId[] = ['speed', 'distance', 'calories', 'avgPower'];

export function RideStatsQuadCard({
  id = 'compact-all-stats-card',
  tileId = 'stats',
  className = '',
  sport = 'cycling',
  speedMph,
  inclinePct = 0,
  paceSecPer500m = 0,
  distanceMeters,
  caloriesKcal,
  avgRideWatts,
  npRideWatts,
  burnPoints,
  burnZoneTotalSec,
  statOrder = DEFAULT_QUAD_ORDER,
  arrange,
}: RideStatsQuadCardProps) {
  const liveRowSplit =
    paceSecPer500m > 0 ? paceSecPer500m : rowingWattsToSplitSecPer500m(avgRideWatts);

  const cells: Record<QuadStatId, { label: string; val: string; sub: string }> =
    sport === 'running'
      ? {
          speed: {
            label: 'Speed',
            val: speedMph.toFixed(1),
            sub: `mph · ${formatRunningPacePerMile(speedMph)}/mi`,
          },
          distance: {
            label: 'Distance',
            val: metersToMiles(distanceMeters).toFixed(2),
            sub: `mi · ${(distanceMeters / 1000).toFixed(1)}k`,
          },
          calories: {
            label: 'Calories',
            val: `${Math.round(caloriesKcal)}`,
            sub: 'kcal',
          },
          avgPower: {
            label: 'Incline',
            val: `${inclinePct.toFixed(1)}%`,
            sub: `${avgRideWatts}W avg`,
          },
        }
      : sport === 'rowing'
        ? {
            speed: {
              label: 'Split',
              val: formatRowingSplit(liveRowSplit),
              sub: '/500m',
            },
            distance: {
              label: 'Meters',
              val: Math.round(distanceMeters).toLocaleString('en-US'),
              sub: `m · ${(distanceMeters / 1000).toFixed(2)}k`,
            },
            calories: {
              label: 'Calories',
              val: `${Math.round(caloriesKcal)}`,
              sub: 'kcal',
            },
            avgPower: {
              label: 'Avg / NP',
              val: `${avgRideWatts}W`,
              sub: `NP ${npRideWatts}W`,
            },
          }
        : {
            speed: {
              label: 'Speed',
              val: speedMph.toFixed(1),
              sub: 'mph',
            },
            distance: {
              label: 'Distance',
              val: metersToMiles(distanceMeters).toFixed(2),
              sub: `mi · ${(distanceMeters / 1000).toFixed(1)}k`,
            },
            calories: {
              label: 'Calories',
              val: `${Math.round(caloriesKcal)}`,
              sub: 'kcal',
            },
            avgPower: {
              label: 'Avg / NP',
              val: `${avgRideWatts}W`,
              sub: `NP ${npRideWatts}W`,
            },
          };

  const cardTitle =
    sport === 'running' ? 'Run Stats' : sport === 'rowing' ? 'Row Stats' : 'Ride Stats';

  return (
    <section
      className={`metric-card ride-stats-quad-card tabular ${className}`.trim()}
      id={id}
      data-tile-id={tileId}
      aria-label="Ride computer stats"
      {...getTileArrangeSectionProps(arrange)}
    >
      <header
        className="metric-zone-header dial-zone-header"
        style={{ background: '#232B38', color: '#CBD5E1' }}
      >
        <span className="dial-header-title">
          {arrange && <TileArrangeGrip />}
          {cardTitle}
        </span>
        {arrange ? (
          <TileArrangeArrows arrange={arrange} />
        ) : (
          <span className="dial-header-zone" style={{ color: '#fb923c' }}>
            ★ {burnPoints} BURN
          </span>
        )}
      </header>

      <div className="quad-grid">
        {statOrder.map((statId) => {
          const cell = cells[statId];
          return (
            <div className="quad-cell" key={statId} data-stat-id={statId}>
              <span className="quad-label">{cell.label}</span>
              <span className="quad-val">{cell.val}</span>
              <span className="quad-sub">{cell.sub}</span>
            </div>
          );
        })}
      </div>

      <div className="quad-burn-footer">
        <span>Burn Zone (Z4+Z5)</span>
        <strong>{formatDuration(burnZoneTotalSec)}</strong>
      </div>
    </section>
  );
}
