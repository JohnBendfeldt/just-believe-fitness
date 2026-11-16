import type { ReactNode } from 'react';
import type { ZoneDefinition } from '../types/fitness';
import { computeSegmentedGaugeProgress } from '../utils/zones';

interface ZoneSpeedometerCardProps {
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

const CX = 110;
const CY = 104;
const RADIUS = 80;
const START_ANGLE_DEG = 140;
const TOTAL_SWEEP_DEG = 260;
const GAP_DEG = 5.5;
const SEG_SWEEP_DEG = (TOTAL_SWEEP_DEG - GAP_DEG * 4) / 5;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArcFlag = endDeg - startDeg <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function ZoneSpeedometerCard({
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
}: ZoneSpeedometerCardProps) {
  const isLive = numericValue > 0;
  const progressPct = computeSegmentedGaugeProgress(numericValue, zones);
  const needleAngleDeg = START_ANGLE_DEG + (progressPct / 100) * TOTAL_SWEEP_DEG;
  const needleOuter = polarToCartesian(CX, CY, RADIUS + 9, needleAngleDeg);
  const needleInner = polarToCartesian(CX, CY, RADIUS - 11, needleAngleDeg);
  const needleDot = polarToCartesian(CX, CY, RADIUS, needleAngleDeg);

  return (
    <section className="metric-card dial-card" id={id} aria-label={`${title} speedometer`}>
      <header
        className="metric-zone-header dial-zone-header"
        style={{
          backgroundColor: isLive ? activeZone.color : '#232B38',
          color: isLive ? activeZone.textOnFill : '#CBD5E1',
        }}
      >
        <span className="dial-header-title">{title}</span>
        <span className="dial-header-zone">
          {isLive ? `Z${activeZone.zone} · ${activeZone.key.toUpperCase()}` : 'READY'}
        </span>
      </header>

      <div className="dial-body">
        <div className="dial-ring-stage" role="meter" aria-valuenow={numericValue}>
          <svg
            className="dial-svg"
            viewBox="0 0 220 174"
            aria-hidden="true"
          >
            {/* Subtle recessed inner guide arc */}
            <path
              d={describeArc(CX, CY, RADIUS - 14, START_ANGLE_DEG, START_ANGLE_DEG + TOTAL_SWEEP_DEG)}
              fill="none"
              stroke="rgba(255, 255, 255, 0.06)"
              strokeWidth={1.5}
              strokeDasharray="3 4"
            />

            {/* 5 Rounded Color-Coded Speedometer Zone Arcs */}
            {zones.map((z, idx) => {
              const segStart = START_ANGLE_DEG + idx * (SEG_SWEEP_DEG + GAP_DEG);
              const segEnd = segStart + SEG_SWEEP_DEG;
              const isCurrent = isLive && z.zone === activeZone.zone;
              const isPassed = isLive && z.zone < activeZone.zone;

              const tickInner = polarToCartesian(CX, CY, RADIUS - 18, segStart);
              const tickOuter = polarToCartesian(CX, CY, RADIUS - 11, segStart);

              return (
                <g key={z.zone}>
                  {idx > 0 && (
                    <line
                      x1={tickInner.x}
                      y1={tickInner.y}
                      x2={tickOuter.x}
                      y2={tickOuter.y}
                      stroke="rgba(255, 255, 255, 0.24)"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                  )}
                  <path
                    d={describeArc(CX, CY, RADIUS, segStart, segEnd)}
                    fill="none"
                    stroke={z.color}
                    strokeWidth={isCurrent ? 16 : 11}
                    strokeLinecap="round"
                    opacity={isCurrent ? 1 : isPassed ? 0.56 : 0.24}
                    className="dial-zone-arc"
                  >
                    <title>
                      {`${z.name}: ${z.minValue}${z.maxValue ? `–${z.maxValue}` : '+'}${thresholdUnitSuffix}`}
                    </title>
                  </path>
                </g>
              );
            })}

            {/* Live Radial Speedometer Pointer & Ring Bead */}
            {isLive && (
              <g className="dial-needle-group">
                <line
                  x1={needleInner.x}
                  y1={needleInner.y}
                  x2={needleOuter.x}
                  y2={needleOuter.y}
                  stroke="#0B0E13"
                  strokeWidth={7}
                  strokeLinecap="round"
                />
                <line
                  x1={needleInner.x}
                  y1={needleInner.y}
                  x2={needleOuter.x}
                  y2={needleOuter.y}
                  stroke="#FFFFFF"
                  strokeWidth={3.8}
                  strokeLinecap="round"
                />
                <circle
                  cx={needleDot.x}
                  cy={needleDot.y}
                  r={5}
                  fill="#FFFFFF"
                  stroke="#0B0E13"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>

          <div className="dial-center-overlay">
            <span className="dial-value tabular" id={`${id}-value`}>
              {valueDisplay}
            </span>
            <span className="dial-unit">{unit}</span>
          </div>
        </div>

        <div className="dial-meta">
          <div className="dial-meta-row">
            <div className="dial-meta-texts">
              <span className="dial-primary-badge tabular">{primaryBadge}</span>
              <span className="dial-secondary-sub tabular">{secondarySub}</span>
            </div>
            {extraControl}
          </div>
        </div>

        <div className="dial-thresholds tabular" aria-label="Zone entry thresholds">
          <span style={{ color: zones[1].color }}>Z2 {zones[1].minValue}</span>
          <span style={{ color: zones[2].color }}>Z3 {zones[2].minValue}</span>
          <span style={{ color: zones[3].color }}>Z4 {zones[3].minValue}</span>
          <span style={{ color: zones[4].color }}>Z5 {zones[4].minValue}</span>
        </div>
      </div>
    </section>
  );
}
