import type { ReactNode } from 'react';
import type { ZoneDefinition } from '../types/fitness';
import { computeSegmentedGaugeProgress } from '../utils/zones';

interface ZoneMetricCardProps {
  id: string;
  title: string;
  valueDisplay: string;
  unit: string;
  primaryBadge: string;
  secondarySub: string;
  zones: ZoneDefinition[];
  numericValue: number;
  activeZone: ZoneDefinition;
  thresholdUnitSuffix?: string;
  extraControl?: ReactNode;
}

export function ZoneMetricCard({
  id,
  title,
  valueDisplay,
  unit,
  primaryBadge,
  secondarySub,
  zones,
  numericValue,
  activeZone,
  thresholdUnitSuffix = '',
  extraControl,
}: ZoneMetricCardProps) {
  const needlePct = computeSegmentedGaugeProgress(numericValue, zones);

  return (
    <section className="metric-card" id={id} aria-label={`${title} telemetry`}>
      <header
        className="metric-zone-header"
        style={{
          backgroundColor: numericValue > 0 ? activeZone.color : '#232B38',
          color: numericValue > 0 ? activeZone.textOnFill : '#CBD5E1',
        }}
      >
        <span>{title}</span>
        <span>{numericValue > 0 ? `Z${activeZone.zone} · ${activeZone.otfName}` : 'READY'}</span>
      </header>

      <div className="metric-body">
        <div className="metric-main-row">
          <div className="metric-number-wrap">
            <span className="metric-number tabular" id={`${id}-value`}>
              {valueDisplay}
            </span>
            <span className="metric-unit">{unit}</span>
          </div>

          <div className="metric-context-stack">
            <span className="metric-primary-badge tabular">{primaryBadge}</span>
            <span className="metric-secondary-sub tabular">{secondarySub}</span>
            {extraControl}
          </div>
        </div>

        <div className="garmin-gauge">
          <div className="garmin-segments" role="meter" aria-valuenow={numericValue}>
            {zones.map((z) => (
              <div
                key={z.zone}
                className={`garmin-seg ${numericValue > 0 && z.zone === activeZone.zone ? 'active' : ''}`}
                style={{ backgroundColor: z.color }}
                title={`${z.name}: ${z.minValue}${z.maxValue ? `–${z.maxValue}` : '+'}${thresholdUnitSuffix}`}
              />
            ))}
            {numericValue > 0 && (
              <div className="garmin-needle" style={{ left: `${needlePct}%` }} />
            )}
          </div>

          <div className="garmin-thresholds tabular">
            <span>
              Z2 {zones[1].minValue}
              {thresholdUnitSuffix}
            </span>
            <span>
              Z3 {zones[2].minValue}
              {thresholdUnitSuffix}
            </span>
            <span>
              Z4 {zones[3].minValue}
              {thresholdUnitSuffix}
            </span>
            <span>
              Z5 {zones[4].minValue}
              {thresholdUnitSuffix}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
