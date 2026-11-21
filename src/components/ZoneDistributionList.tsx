import type { ZoneId } from '../types/fitness';
import { ZONE_PALETTE, formatDuration } from '../utils/zones';
import { TileArrangeArrows, TileArrangeGrip } from './TileReorderControls';
import { getTileArrangeSectionProps, type TileArrangeBinding } from '../utils/tileArrange';

const ORDERED_ZONES: ZoneId[] = [5, 4, 3, 2, 1];

interface ZoneDistributionListProps {
  zoneSeconds: Record<ZoneId, number>;
}

/** Zone 5 → Zone 1 horizontal time-in-zone bars, shared by the graph panel and the cockpit card. */
export function ZoneDistributionList({ zoneSeconds }: ZoneDistributionListProps) {
  const totalTrackedSec = Math.max(
    1,
    Object.values(zoneSeconds).reduce((a, b) => a + b, 0)
  );

  return (
    <div className="zone-dist-list">
      {ORDERED_ZONES.map((zId) => {
        const secs = zoneSeconds[zId] || 0;
        const pct = Math.min(100, Math.round((secs / totalTrackedSec) * 100));
        const pal = ZONE_PALETTE[zId];
        return (
          <div className="zone-dist-row" key={zId}>
            <span className="zone-dist-name">
              <span className="zone-swatch" style={{ backgroundColor: pal.color }} />
              Zone {zId}
            </span>
            <div className="zone-dist-track">
              <div
                className="zone-dist-fill"
                style={{
                  width: `${secs > 0 ? Math.max(4, pct) : 0}%`,
                  backgroundColor: pal.color,
                }}
              />
            </div>
            <span className="zone-dist-time tabular">{formatDuration(secs)}</span>
          </div>
        );
      })}
    </div>
  );
}

interface ZoneTimeCardProps {
  id?: string;
  className?: string;
  hasHrStream: boolean;
  zoneSeconds: Record<ZoneId, number>;
  arrange?: TileArrangeBinding;
}

/** Cockpit-sized "Time in Zones" card that sits in the gauge grid. */
export function ZoneTimeCard({
  id = 'zone-time-card',
  className = '',
  hasHrStream,
  zoneSeconds,
  arrange,
}: ZoneTimeCardProps) {
  return (
    <section
      className={`metric-card zone-time-card ${className}`.trim()}
      id={id}
      data-tile-id="zones"
      aria-label="Time in zones"
      {...getTileArrangeSectionProps(arrange)}
    >
      <header
        className="metric-zone-header dial-zone-header"
        style={{ background: '#232B38', color: '#CBD5E1' }}
      >
        <span className="dial-header-title">
          {arrange && <TileArrangeGrip />}
          Time in {hasHrStream ? 'HR' : 'Power'} Zones
        </span>
        {arrange ? (
          <TileArrangeArrows arrange={arrange} />
        ) : (
          <span className="dial-header-zone" style={{ color: '#fb923c' }}>
            Z4 + Z5 = BURN
          </span>
        )}
      </header>
      <div className="cockpit-card-body">
        <ZoneDistributionList zoneSeconds={zoneSeconds} />
      </div>
    </section>
  );
}
