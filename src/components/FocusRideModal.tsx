import { useEffect, useState, type ReactNode } from 'react';
import {
  FastForward,
  Flame,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  ActiveSegmentSummary,
  AthleteProfile,
  LiveTelemetry,
  WorkoutTemplate,
  ZoneDefinition,
} from '../types/fitness';
import {
  ZONE_PALETTE,
  computeWattsPerKg,
  cueDisplayLabel,
  formatBikeGearBadge,
  formatDistanceTarget,
  formatDistanceValue,
  formatDuration,
} from '../utils/zones';
import { isBrowserFullscreen, toggleBrowserFullscreen } from '../utils/fullscreen';
import { formatWorkoutOptionLabel, groupWorkoutTemplates } from '../data/workouts';
import { ZoneSpeedometerCard } from './ZoneSpeedometerCard';
import { RideStatsQuadCard } from './RideStatsQuadCard';

export type { ActiveSegmentSummary };

interface FocusRideModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: WorkoutTemplate[];
  selectedWorkout: WorkoutTemplate;
  onSelectWorkoutId: (id: string) => void;
  activeSegmentInfo: ActiveSegmentSummary | null;
  rideState: 'idle' | 'running' | 'paused';
  elapsedSec: number;
  burnPoints: number;
  burnZoneTotalSec: number;
  distanceMeters: number;
  caloriesKcal: number;
  avgRideWatts: number;
  npRideWatts: number;
  telemetry: LiveTelemetry;
  profile: AthleteProfile;
  powerZones: ZoneDefinition[];
  cadenceZones: ZoneDefinition[];
  hrZones: ZoneDefinition[];
  activePowerZone: ZoneDefinition;
  activeCadenceZone: ZoneDefinition;
  activeHrZone: ZoneDefinition;
  headlineZone: ZoneDefinition;
  resistanceControl: ReactNode;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  isHudPipActive: boolean;
  onLaunchHudPip: () => void;
  onStartOrResume: () => void;
  onPause: () => void;
  onSkipSegment: () => void;
  onFinishAndSave: () => void;
  onResetWorkout: () => void;
}

export function FocusRideModal({
  isOpen,
  onClose,
  workouts,
  selectedWorkout,
  onSelectWorkoutId,
  activeSegmentInfo,
  rideState,
  elapsedSec,
  burnPoints,
  burnZoneTotalSec,
  distanceMeters,
  caloriesKcal,
  avgRideWatts,
  npRideWatts,
  telemetry,
  profile,
  powerZones,
  cadenceZones,
  hrZones,
  activePowerZone,
  activeCadenceZone,
  activeHrZone,
  headlineZone,
  resistanceControl,
  audioEnabled,
  onToggleAudio,
  isHudPipActive,
  onLaunchHudPip,
  onStartOrResume,
  onPause,
  onSkipSegment,
  onFinishAndSave,
  onResetWorkout,
}: FocusRideModalProps) {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isBrowserFullscreen());

  useEffect(() => {
    if (!isOpen) return;
    const syncFullscreen = () => setIsFullscreen(isBrowserFullscreen());
    syncFullscreen();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBrowserFullscreen()) {
        onClose();
      }
    };

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAnySensorLive =
    telemetry.powerWatts > 0 || telemetry.heartRateBpm > 0 || rideState === 'running';
  const liveWkg = computeWattsPerKg(telemetry.powerWatts, profile.weightLbs);
  const ftpPct =
    profile.ftpWatts > 0 ? Math.round((telemetry.powerWatts / profile.ftpWatts) * 100) : 0;
  const hrPct =
    profile.maxHrBpm > 0 && telemetry.heartRateBpm > 0
      ? Math.round((telemetry.heartRateBpm / profile.maxHrBpm) * 100)
      : 0;

  const targetPalette = activeSegmentInfo
    ? ZONE_PALETTE[activeSegmentInfo.segment.targetZone]
    : isAnySensorLive
      ? ZONE_PALETTE[headlineZone.zone]
      : null;

  const dist = activeSegmentInfo?.distanceMode;
  const segDuration = activeSegmentInfo?.segment.durationSec ?? 1;
  const segElapsed = activeSegmentInfo
    ? Math.max(0, segDuration - activeSegmentInfo.remainingSec)
    : 0;
  const segProgressPct = activeSegmentInfo
    ? dist
      ? dist.overallProgressPct
      : Math.min(100, Math.max(0, (segElapsed / Math.max(1, segDuration)) * 100))
    : 0;
  const groupedWorkouts = groupWorkoutTemplates(workouts);

  return (
    <div
      className="modal-backdrop focus-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Focused Workout Cockpit"
    >
      <div
        className="focus-modal-card"
        id="focus-workout-modal"
      >
        {/* Top Bar: Workout Selector + Sensor Status + Fullscreen / PiP / Audio / Exit */}
        <header className="focus-topbar">
          <div className="focus-topbar-left">
            <span
              className={`status-dot ${
                telemetry.bikeConnected && telemetry.hrConnected
                  ? 'connected'
                  : telemetry.bikeConnected || telemetry.hrConnected || telemetry.isSimulating
                    ? 'connecting'
                    : ''
              }`}
              title={
                telemetry.bikeConnected
                  ? 'Sensors connected'
                  : telemetry.isSimulating
                    ? 'Demo Simulator active'
                    : 'Sensors idle'
              }
            />
            <select
              id="focus-workout-select"
              className="focus-workout-select"
              value={selectedWorkout.id}
              onChange={(e) => onSelectWorkoutId(e.target.value)}
              aria-label="Select workout"
            >
              {groupedWorkouts.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.workouts.map((w) => (
                    <option key={w.id} value={w.id}>
                      {formatWorkoutOptionLabel(w, 'm')}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="focus-topbar-actions">
            <button
              type="button"
              className={`btn btn-sm ${isFullscreen ? 'btn-primary' : ''}`}
              id="focus-fullscreen-btn"
              onClick={() => void toggleBrowserFullscreen()}
              title={isFullscreen ? 'Exit browser fullscreen' : 'Enter full screen'}
              aria-label={isFullscreen ? 'Exit browser fullscreen' : 'Enter full screen'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span className="focus-hide-xs">{isFullscreen ? 'Window' : 'Full'}</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${isHudPipActive ? 'btn-primary' : ''}`}
              id="focus-pip-btn"
              onClick={onLaunchHudPip}
              title="Pop out floating PiP gauges"
            >
              <PictureInPicture2 size={14} />
              <span className="focus-hide-xs">PiP</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${audioEnabled ? 'btn-primary' : ''}`}
              id="focus-audio-btn"
              onClick={onToggleAudio}
              aria-pressed={audioEnabled}
              title={
                audioEnabled
                  ? 'Coach audio ON (mixes over music) — tap to mute'
                  : 'Coach audio OFF — tap to opt in to coach voice & chimes'
              }
            >
              {audioEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span className="focus-hide-xs">{audioEnabled ? 'Coach On' : 'Audio Off'}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              id="close-focus-modal-btn"
              onClick={onClose}
              title="Exit Focused Mode"
            >
              <X size={15} /> Exit
            </button>
          </div>
        </header>

        {/* Workout Instructions + Targets Card Directly Above Transport & 4-Grid */}
        <section
          className="focus-instructions-card"
          style={{
            borderColor: dist?.isGoalComplete
              ? '#22C55E99'
              : targetPalette
                ? `${targetPalette.color}66`
                : 'var(--hairline-strong)',
          }}
        >
          <div
            className="focus-cue-banner"
            style={{
              backgroundColor: dist?.isGoalComplete
                ? '#22C55E'
                : targetPalette
                  ? targetPalette.color
                  : '#232B38',
              color: dist?.isGoalComplete
                ? '#052E16'
                : targetPalette
                  ? targetPalette.textOnFill
                  : '#F8FAFC',
            }}
          >
            <div className="focus-cue-left">
              <span className="focus-cue-pill">
                {activeSegmentInfo
                  ? dist
                    ? dist.isGoalComplete
                      ? `CHALLENGE COMPLETE · ${selectedWorkout.name.toUpperCase()}`
                      : `STAGE ${activeSegmentInfo.index + 1}/${activeSegmentInfo.totalSegments} · ${Math.round(dist.overallProgressPct)}% · ${cueDisplayLabel(activeSegmentInfo.segment.cue)}`
                    : `BLOCK ${activeSegmentInfo.index + 1}/${activeSegmentInfo.totalSegments} · ${cueDisplayLabel(activeSegmentInfo.segment.cue)}`
                  : isAnySensorLive
                    ? `ZONE ${headlineZone.zone} · ${headlineZone.stageLabel}`
                    : 'OPEN STUDIO'}
              </span>
              <span className="focus-cue-title">
                {activeSegmentInfo ? activeSegmentInfo.segment.label : selectedWorkout.name}
              </span>
            </div>

            <div className="focus-cue-timers tabular">
              {activeSegmentInfo && !dist && (
                <div className="focus-timer-block">
                  <span className="focus-timer-label">Block Left</span>
                  <span className="focus-timer-val">
                    {formatDuration(activeSegmentInfo.remainingSec)}
                  </span>
                </div>
              )}
              {dist && (
                <>
                  <div className="focus-timer-block">
                    <span className="focus-timer-label">To Go</span>
                    <span className="focus-timer-val" id="focus-distance-remaining">
                      {dist.isGoalComplete
                        ? 'DONE'
                        : formatDistanceValue(dist.totalRemainingMeters, dist.unit)}
                    </span>
                  </div>
                  <div className="focus-timer-block">
                    <span className="focus-timer-label">ETA</span>
                    <span className="focus-timer-val" id="focus-distance-eta">
                      {dist.isGoalComplete
                        ? '00:00'
                        : dist.etaRemainingSec !== null
                          ? formatDuration(dist.etaRemainingSec)
                          : '--'}
                    </span>
                  </div>
                </>
              )}
              <div className="focus-timer-block">
                <span className="focus-timer-label">Elapsed</span>
                <span className="focus-timer-val">{formatDuration(elapsedSec)}</span>
              </div>
              <div className="focus-timer-block">
                <span className="focus-timer-label">Burn</span>
                <span
                  className="focus-timer-val"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                >
                  <Flame size={16} /> {burnPoints}
                </span>
              </div>
            </div>
          </div>

          <div className="focus-instructions-body">
            {activeSegmentInfo ? (
              <>
                <p className="focus-coaching-note">
                  {dist?.isGoalComplete
                    ? `${selectedWorkout.name} complete (${formatDistanceTarget(dist.totalTargetMeters, dist.unit)})! Keep spinning easy to cool down or tap Stop & Save.`
                    : activeSegmentInfo.segment.coachingNote}
                </p>

                <div className="focus-targets-row tabular">
                  <span className="focus-target-chip">
                    <strong>{activeSegmentInfo.targets.minWatts}–{activeSegmentInfo.targets.maxWatts}W</strong>
                  </span>
                  <span className="focus-target-chip">
                    <strong>{activeSegmentInfo.segment.cadenceRange[0]}–{activeSegmentInfo.segment.cadenceRange[1]}</strong> RPM
                  </span>
                  <span className="focus-target-chip">
                    Gear <strong>{activeSegmentInfo.targets.suggestedResistanceLow}–{activeSegmentInfo.targets.suggestedResistanceHigh}</strong>
                  </span>
                  {dist && (
                    <span className="focus-target-chip">
                      <strong>{formatDistanceValue(distanceMeters, dist.unit)}</strong> /{' '}
                      {formatDistanceTarget(dist.totalTargetMeters, dist.unit)}
                      {!dist.isGoalComplete && (
                        <>
                          {' '}· Stage left{' '}
                          <strong>{formatDistanceValue(dist.stageRemainingMeters, dist.unit)}</strong>
                        </>
                      )}
                    </span>
                  )}
                  {activeSegmentInfo.nextSegment && (
                    <span className="focus-next-preview">
                      Next: <strong>{activeSegmentInfo.nextSegment.label}</strong>
                    </span>
                  )}
                </div>

                <div className="focus-progress-track" aria-hidden="true">
                  <div
                    className="focus-progress-fill"
                    style={{
                      width: `${segProgressPct}%`,
                      backgroundColor: dist?.isGoalComplete
                        ? '#22C55E'
                        : (targetPalette?.color ?? 'var(--accent-orange)'),
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="focus-coaching-note">
                Ride at your own pace — earn 1 <strong>Burn Point</strong> per minute in{' '}
                <strong>Orange (≥ {hrZones[3].minValue} bpm / ≥ {powerZones[3].minValue}W)</strong>{' '}
                or <strong>Red</strong>.
              </p>
            )}
          </div>
        </section>

        {/* Dedicated Always-Visible Play / Pause / Block Transport Bar */}
        <div className="focus-transport-dock">
          {rideState !== 'running' ? (
            <button
              type="button"
              id="focus-play-resume-btn"
              className="btn btn-primary focus-play-btn"
              onClick={onStartOrResume}
            >
              <Play size={18} fill="currentColor" />
              {rideState === 'paused' ? 'Resume Workout' : 'Start Workout'}
            </button>
          ) : (
            <button
              type="button"
              id="focus-pause-btn"
              className="btn focus-play-btn focus-pause-active"
              onClick={onPause}
            >
              <Pause size={18} /> Pause Workout
            </button>
          )}

          {activeSegmentInfo && !dist && activeSegmentInfo.nextSegment && rideState !== 'idle' && (
            <button
              type="button"
              id="focus-next-block-btn"
              className="btn focus-secondary-btn"
              onClick={onSkipSegment}
              title="Skip to next interval block"
            >
              <FastForward size={16} /> Next
            </button>
          )}

          {(rideState !== 'idle' || elapsedSec > 0) && (
            <>
              <button
                type="button"
                id="focus-save-ride-btn"
                className="btn btn-strava focus-secondary-btn"
                onClick={onFinishAndSave}
              >
                <Square size={15} /> Stop &amp; Save
              </button>
              <button
                type="button"
                id="focus-reset-ride-btn"
                className="btn focus-icon-btn"
                onClick={onResetWorkout}
                title="Discard & reset workout timer"
              >
                <RotateCcw size={15} />
              </button>
            </>
          )}
        </div>

        {/* Dedicated 4-Grid Telemetry Cockpit (Power, Cadence + Gear, Heart Rate, Ride Stats) */}
        <div className="focus-four-grid">
          <ZoneSpeedometerCard
            id="focus-power-card"
            title="Power"
            valueDisplay={`${Math.round(telemetry.powerWatts)}`}
            unit="Watts"
            primaryBadge={`${ftpPct}% FTP · ${liveWkg.toFixed(2)} W/kg`}
            secondarySub={
              activeSegmentInfo
                ? `Goal ${activeSegmentInfo.targets.minWatts}–${activeSegmentInfo.targets.maxWatts}W`
                : `FTP ${profile.ftpWatts}W (${profile.weightLbs}#)`
            }
            zones={powerZones}
            numericValue={telemetry.powerWatts}
            activeZone={activePowerZone}
            thresholdUnitSuffix="W"
          />

          <ZoneSpeedometerCard
            id="focus-cadence-card"
            title="Cadence"
            valueDisplay={`${Math.round(telemetry.cadenceRpm)}`}
            unit="RPM"
            primaryBadge={formatBikeGearBadge(telemetry)}
            secondarySub={
              activeSegmentInfo
                ? `Goal ${activeSegmentInfo.segment.cadenceRange[0]}–${activeSegmentInfo.segment.cadenceRange[1]}`
                : 'Spin Rhythm'
            }
            zones={cadenceZones}
            numericValue={telemetry.cadenceRpm}
            activeZone={activeCadenceZone}
            extraControl={resistanceControl}
          />

          <ZoneSpeedometerCard
            id="focus-hr-card"
            title="Heart Rate"
            valueDisplay={
              telemetry.heartRateBpm > 0 ? `${Math.round(telemetry.heartRateBpm)}` : '--'
            }
            unit="BPM"
            primaryBadge={
              telemetry.heartRateBpm > 0
                ? `${hrPct}% MAX HR`
                : telemetry.hrName || 'BLE HR Ready'
            }
            secondarySub={`Max ${profile.maxHrBpm} · Burn ≥ ${hrZones[3].minValue}`}
            zones={hrZones}
            numericValue={telemetry.heartRateBpm}
            activeZone={activeHrZone}
          />

          <RideStatsQuadCard
            id="focus-ride-stats-card"
            speedMph={telemetry.speedMph}
            distanceMeters={distanceMeters}
            caloriesKcal={caloriesKcal}
            avgRideWatts={avgRideWatts}
            npRideWatts={npRideWatts}
            burnPoints={burnPoints}
            burnZoneTotalSec={burnZoneTotalSec}
          />
        </div>
      </div>
    </div>
  );
}
