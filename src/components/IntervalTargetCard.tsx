import type { ActiveSegmentSummary } from '../types/fitness';
import {
  ZONE_PALETTE,
  cueDisplayLabel,
  formatDistanceTarget,
  formatDistanceValue,
  formatDuration,
} from '../utils/zones';

interface IntervalTargetCardProps {
  className?: string;
  info: ActiveSegmentSummary | null;
}

/** Cockpit-sized card showing the current interval or distance stage targets, countdown, and what's next. */
export function IntervalTargetCard({ className = '', info }: IntervalTargetCardProps) {
  const dist = info?.distanceMode;
  const targetColor = info ? ZONE_PALETTE[info.segment.targetZone].color : '#fb923c';

  return (
    <section
      className={`metric-card interval-target-card tabular ${className}`.trim()}
      id="interval-target-card"
      aria-label={dist ? 'Current distance challenge targets' : 'Current interval targets'}
    >
      <header
        className="metric-zone-header dial-zone-header"
        style={{ background: '#232B38', color: '#CBD5E1' }}
      >
        <span className="dial-header-title">{dist ? 'Distance Goal' : 'Interval'}</span>
        <span className="dial-header-zone" style={{ color: '#fb923c' }}>
          {info
            ? dist
              ? dist.isGoalComplete
                ? 'COMPLETE'
                : `Stage ${info.index + 1}/${info.totalSegments} · ${Math.round(dist.overallProgressPct)}%`
              : `Block ${info.index + 1}/${info.totalSegments}`
            : 'Free Ride'}
        </span>
      </header>

      {info ? (
        <div className="cockpit-card-body interval-body">
          <div className="interval-name">
            <span className="interval-cue">
              {dist?.isGoalComplete ? 'CHALLENGE COMPLETE' : cueDisplayLabel(info.segment.cue)}
            </span>
            <strong>{info.segment.label}</strong>
          </div>
          <div className="interval-clock">
            {dist
              ? dist.isGoalComplete
                ? formatDistanceTarget(dist.totalTargetMeters, dist.unit)
                : formatDistanceValue(dist.totalRemainingMeters, dist.unit)
              : formatDuration(info.remainingSec)}
          </div>
          {dist && (
            <div className="interval-distance-meta">
              <div className="interval-distance-row">
                <span>
                  {dist.isGoalComplete
                    ? 'Goal reached · cool down or save'
                    : `Stage left: ${formatDistanceValue(dist.stageRemainingMeters, dist.unit)}`}
                </span>
                <span>
                  {dist.isGoalComplete
                    ? '100%'
                    : dist.etaRemainingSec !== null
                      ? `ETA ${formatDuration(dist.etaRemainingSec)}`
                      : 'ETA --'}
                </span>
              </div>
              <div className="interval-distance-track" aria-hidden="true">
                <div
                  className="interval-distance-fill"
                  style={{
                    width: `${dist.overallProgressPct}%`,
                    backgroundColor: dist.isGoalComplete ? '#22C55E' : targetColor,
                  }}
                />
              </div>
            </div>
          )}
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
                : dist?.isGoalComplete
                  ? 'Goal complete'
                  : 'Final stage'}
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
          <div className="quad-sub">Pick a workout or distance challenge to see targets here.</div>
        </div>
      )}
    </section>
  );
}
