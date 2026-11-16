import { formatDuration, metersToMiles } from '../utils/zones';

interface RideStatsQuadCardProps {
  id?: string;
  className?: string;
  speedMph: number;
  distanceMeters: number;
  caloriesKcal: number;
  avgRideWatts: number;
  npRideWatts: number;
  burnPoints: number;
  burnZoneTotalSec: number;
}

export function RideStatsQuadCard({
  id = 'compact-all-stats-card',
  className = '',
  speedMph,
  distanceMeters,
  caloriesKcal,
  avgRideWatts,
  npRideWatts,
  burnPoints,
  burnZoneTotalSec,
}: RideStatsQuadCardProps) {
  return (
    <section
      className={`metric-card ride-stats-quad-card tabular ${className}`.trim()}
      id={id}
      aria-label="Ride computer stats"
    >
      <header
        className="metric-zone-header dial-zone-header"
        style={{ background: '#232B38', color: '#CBD5E1' }}
      >
        <span className="dial-header-title">Ride Stats</span>
        <span className="dial-header-zone" style={{ color: '#fb923c' }}>
          ★ {burnPoints} BURN
        </span>
      </header>

      <div className="quad-grid">
        <div className="quad-cell">
          <span className="quad-label">Speed</span>
          <span className="quad-val">{speedMph.toFixed(1)}</span>
          <span className="quad-sub">mph</span>
        </div>
        <div className="quad-cell">
          <span className="quad-label">Distance</span>
          <span className="quad-val">{metersToMiles(distanceMeters).toFixed(2)}</span>
          <span className="quad-sub">mi · {(distanceMeters / 1000).toFixed(1)}k</span>
        </div>
        <div className="quad-cell">
          <span className="quad-label">Calories</span>
          <span className="quad-val">{Math.round(caloriesKcal)}</span>
          <span className="quad-sub">kcal</span>
        </div>
        <div className="quad-cell">
          <span className="quad-label">Avg / NP</span>
          <span className="quad-val">{avgRideWatts}W</span>
          <span className="quad-sub">NP {npRideWatts}W</span>
        </div>
      </div>

      <div className="quad-burn-footer">
        <span>Burn Zone (Z4+Z5)</span>
        <strong>{formatDuration(burnZoneTotalSec)}</strong>
      </div>
    </section>
  );
}
