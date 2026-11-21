import { formatDuration, metersToMiles } from '../utils/zones';
import type { QuadStatId } from '../utils/layoutPrefs';
import { TileArrangeArrows, TileArrangeGrip } from './TileReorderControls';
import { getTileArrangeSectionProps, type TileArrangeBinding } from '../utils/tileArrange';

interface RideStatsQuadCardProps {
  id?: string;
  tileId?: string;
  className?: string;
  speedMph: number;
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
  speedMph,
  distanceMeters,
  caloriesKcal,
  avgRideWatts,
  npRideWatts,
  burnPoints,
  burnZoneTotalSec,
  statOrder = DEFAULT_QUAD_ORDER,
  arrange,
}: RideStatsQuadCardProps) {
  const cells: Record<QuadStatId, { label: string; val: string; sub: string }> = {
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
          Ride Stats
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
