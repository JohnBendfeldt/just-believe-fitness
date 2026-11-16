import type { WorkoutSegment } from '../types/fitness';
import { cueDisplayLabel, formatDuration } from '../utils/zones';

interface IntervalTargetCardProps {
  className?: string;
  info: {
    index: number;
    totalSegments: number;
    segment: WorkoutSegment;
    remainingSec: number;
    nextSegment: WorkoutSegment | null;
    targets: {
      minWatts: number;
      maxWatts: number;
      suggestedResistanceLow: number;
      suggestedResistanceHigh: number;
    };
  } | null;
}

/** Cockpit-sized card showing the current interval's targets, countdown, and what's next. */
export function IntervalTargetCard({ className = '', info }: IntervalTargetCardProps) {
  return (
    <section
      className={`metric-card interval-target-card tabular ${className}`.trim()}
      id="interval-target-card"
      aria-label="Current interval targets"
    >
      <header
        className="metric-zone-header dial-zone-header"
        style={{ background: '#232B38', color: '#CBD5E1' }}
      >
        <span className="dial-header-title">Interval</span>
        <span className="dial-header-zone" style={{ color: '#fb923c' }}>
          {info ? `Block ${info.index + 1}/${info.totalSegments}` : 'Free Ride'}
        </span>
      </header>

      {info ? (
        <div className="cockpit-card-body interval-body">
          <div className="interval-name">
            <span className="interval-cue">{cueDisplayLabel(info.segment.cue)}</span>
            <strong>{info.segment.label}</strong>
          </div>
          <div className="interval-clock">{formatDuration(info.remainingSec)}</div>
          <div className="quad-grid interval-targets">
            <div className="quad-cell">
              <span className="quad-label">Power</span>
              <span className="quad-val">
                {info.targets.minWatts}–{info.targets.maxWatts}
              </span>
              <span className="quad-sub">watts</span>
            </div>
            <div className="quad-cell">
              <span className="quad-label">Cadence</span>
              <span className="quad-val">
                {info.segment.cadenceRange[0]}–{info.segment.cadenceRange[1]}
              </span>
              <span className="quad-sub">rpm</span>
            </div>
          </div>
          <div className="quad-burn-footer interval-next">
            <span>
              {info.nextSegment
                ? `Next: ${cueDisplayLabel(info.nextSegment.cue)} · ${info.nextSegment.label}`
                : 'Final block'}
            </span>
            <strong>
              Res {info.targets.suggestedResistanceLow}–{info.targets.suggestedResistanceHigh}
            </strong>
          </div>
        </div>
      ) : (
        <div className="cockpit-card-body interval-body">
          <div className="interval-name">
            <strong>Free Ride</strong>
          </div>
          <div className="quad-sub">Pick a workout to see interval targets here.</div>
        </div>
      )}
    </section>
  );
}
