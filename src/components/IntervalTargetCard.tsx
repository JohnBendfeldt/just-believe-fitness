import type { ActiveSegmentSummary, SportMode } from '../types/fitness';
import {
  ZONE_PALETTE,
  cueDisplayLabel,
  formatDistanceTarget,
  formatDistanceValue,
  formatDuration,
  formatRowingSplit,
  formatRunningPacePerMile,
} from '../utils/zones';
import { TileArrangeArrows, TileArrangeGrip } from './TileReorderControls';
import { getTileArrangeSectionProps, type TileArrangeBinding } from '../utils/tileArrange';

interface IntervalTargetCardProps {
  id?: string;
  className?: string;
  sport?: SportMode;
  info: ActiveSegmentSummary | null;
  arrange?: TileArrangeBinding;
}

/** Cockpit-sized card showing the current interval or distance stage targets, countdown, and what's next. */
export function IntervalTargetCard({
  id = 'interval-target-card',
  className = '',
  sport = 'cycling',
  info,
  arrange,
}: IntervalTargetCardProps) {
  const dist = info?.distanceMode;
  const targetColor = info ? ZONE_PALETTE[info.segment.targetZone].color : '#fb923c';
  const freeLabel =
    sport === 'running' ? 'Free Run' : sport === 'rowing' ? 'Free Row' : 'Free Ride';

  return (
    <section
      className={`metric-card interval-target-card tabular ${className}`.trim()}
      id={id}
      data-tile-id="interval"
      aria-label={dist ? 'Current distance challenge targets' : 'Current interval targets'}
      {...getTileArrangeSectionProps(arrange)}
    >
      <header
        className="metric-zone-header dial-zone-header"
        style={{ background: '#232B38', color: '#CBD5E1' }}
      >
        <span className="dial-header-title">
          {arrange && <TileArrangeGrip />}
          {dist ? 'Distance Goal' : 'Interval'}
        </span>
        {arrange ? (
          <TileArrangeArrows arrange={arrange} />
        ) : (
          <span className="dial-header-zone" style={{ color: '#fb923c' }}>
            {info
              ? dist
                ? dist.isGoalComplete
                  ? 'COMPLETE'
                  : `Stage ${info.index + 1}/${info.totalSegments} · ${Math.round(dist.overallProgressPct)}%`
                : `Block ${info.index + 1}/${info.totalSegments}`
              : freeLabel}
          </span>
        )}
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
            {sport === 'running' && info.targets.targetSpeedMphRange ? (
              <>
                <div className="quad-cell">
                  <span className="quad-label">Speed</span>
                  <span className="quad-val">
                    {info.targets.targetSpeedMphRange[0].toFixed(1)}–
                    {info.targets.targetSpeedMphRange[1].toFixed(1)}
                  </span>
                  <span className="quad-sub">
                    mph ({formatRunningPacePerMile(info.targets.targetSpeedMphRange[1])}/mi)
                  </span>
                </div>
                <div className="quad-cell">
                  <span className="quad-label">Incline</span>
                  <span className="quad-val">
                    {(info.targets.targetInclinePct ?? 1.0).toFixed(1)}%
                  </span>
                  <span className="quad-sub">grade</span>
                </div>
              </>
            ) : sport === 'rowing' && info.targets.targetSplitSecRange ? (
              <>
                <div className="quad-cell">
                  <span className="quad-label">Split /500m</span>
                  <span className="quad-val">
                    {formatRowingSplit(info.targets.targetSplitSecRange[0])}–
                    {formatRowingSplit(info.targets.targetSplitSecRange[1])}
                  </span>
                  <span className="quad-sub">
                    {info.targets.minWatts}–{info.targets.maxWatts}W
                  </span>
                </div>
                <div className="quad-cell">
                  <span className="quad-label">Stroke Rate</span>
                  <span className="quad-val">
                    {info.segment.cadenceRange[0]}–{info.segment.cadenceRange[1]}
                  </span>
                  <span className="quad-sub">spm</span>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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
              {sport === 'running'
                ? `${info.segment.cadenceRange[0]}–${info.segment.cadenceRange[1]} spm`
                : sport === 'rowing'
                  ? `Damper ${info.targets.suggestedResistanceLow}–${info.targets.suggestedResistanceHigh}`
                  : `Res ${info.targets.suggestedResistanceLow}–${info.targets.suggestedResistanceHigh}`}
            </strong>
          </div>
        </div>
      ) : (
        <div className="cockpit-card-body interval-body interval-body-empty">
          <div className="interval-name">
            <strong>{freeLabel}</strong>
          </div>
          <div className="interval-empty-note">
            Pick a workout or distance challenge to see targets here.
          </div>
        </div>
      )}
    </section>
  );
}
