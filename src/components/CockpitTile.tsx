import type { ReactNode } from 'react';
import type {
  ActiveSegmentSummary,
  AthleteProfile,
  LiveTelemetry,
  SportMode,
  ZoneDefinition,
  ZoneId,
} from '../types/fitness';
import type { CockpitTileId, QuadStatId } from '../utils/layoutPrefs';
import {
  computeWattsPerKg,
  formatBikeGearBadge,
  formatDistanceTarget,
  formatDistanceValue,
  formatDuration,
  formatHeightImperial,
  formatPaceSeconds,
  formatRowingSplit,
  formatRunningPacePerMile,
  getCalorieZones,
  getDistanceZones,
  getEffectiveRowFtpWatts,
  getEffectiveRunThresholdPaceSec,
  getInclineZones,
  getRunningSpeedZones,
  getSpeedZones,
  metersToMiles,
  resolveZone,
  rowingWattsToSplitSecPer500m,
} from '../utils/zones';
import { ZoneSpeedometerCard } from './ZoneSpeedometerCard';
import { ZoneMetricCard } from './ZoneMetricCard';
import { RideStatsQuadCard } from './RideStatsQuadCard';
import { IntervalTargetCard } from './IntervalTargetCard';
import { ZoneTimeCard } from './ZoneDistributionList';
import type { TileArrangeBinding } from '../utils/tileArrange';

export interface CockpitTileProps {
  tileId: CockpitTileId;
  gaugeStyle: 'rings' | 'bars';
  context: 'main' | 'focus';
  slotClassName?: string;
  telemetry: LiveTelemetry;
  profile: AthleteProfile;
  elapsedSec: number;
  distanceMeters: number;
  caloriesKcal: number;
  avgRideWatts: number;
  npRideWatts: number;
  burnPoints: number;
  burnZoneTotalSec: number;
  hasHrStream: boolean;
  hrZoneSeconds: Record<ZoneId, number>;
  powerZoneSeconds: Record<ZoneId, number>;
  powerZones: ZoneDefinition[];
  cadenceZones: ZoneDefinition[];
  hrZones: ZoneDefinition[];
  activePowerZone: ZoneDefinition;
  activeCadenceZone: ZoneDefinition;
  activeHrZone: ZoneDefinition;
  activeSegmentInfo: ActiveSegmentSummary | null;
  resistanceControl: ReactNode;
  speedControl?: ReactNode;
  quadStatOrder: QuadStatId[];
  arrange?: TileArrangeBinding;
}

const SPEED_ZONES = getSpeedZones();
const CALORIE_ZONES = getCalorieZones();
const INCLINE_ZONES = getInclineZones();

export function CockpitTile({
  tileId,
  gaugeStyle,
  context,
  slotClassName = '',
  telemetry,
  profile,
  elapsedSec,
  distanceMeters,
  caloriesKcal,
  avgRideWatts,
  npRideWatts,
  burnPoints,
  burnZoneTotalSec,
  hasHrStream,
  hrZoneSeconds,
  powerZoneSeconds,
  powerZones,
  cadenceZones,
  hrZones,
  activePowerZone,
  activeCadenceZone,
  activeHrZone,
  activeSegmentInfo,
  resistanceControl,
  speedControl,
  quadStatOrder,
  arrange,
}: CockpitTileProps) {
  const GaugeCard = gaugeStyle === 'rings' ? ZoneSpeedometerCard : ZoneMetricCard;
  const isFocus = context === 'focus';
  const sport: SportMode = telemetry.sport ?? 'cycling';

  const liveWkg = computeWattsPerKg(telemetry.powerWatts, profile.weightLbs);
  const effFtp = sport === 'rowing' ? getEffectiveRowFtpWatts(profile) : profile.ftpWatts;
  const ftpPct = effFtp > 0 ? Math.round((telemetry.powerWatts / effFtp) * 100) : 0;
  const hrPct =
    profile.maxHrBpm > 0 && telemetry.heartRateBpm > 0
      ? Math.round((telemetry.heartRateBpm / profile.maxHrBpm) * 100)
      : 0;
  const liveRowSplit =
    telemetry.paceSecPer500m && telemetry.paceSecPer500m > 0
      ? telemetry.paceSecPer500m
      : rowingWattsToSplitSecPer500m(telemetry.powerWatts);

  switch (tileId) {
    case 'power': {
      if (sport === 'running') {
        const runThresholdSec = getEffectiveRunThresholdPaceSec(profile);
        const runSpeedZones = getRunningSpeedZones(runThresholdSec);
        const activeRunSpeedZone = resolveZone(telemetry.speedMph, runSpeedZones);
        return (
          <GaugeCard
            id={isFocus ? 'focus-power-card' : 'power-metric-card'}
            tileId="power"
            className={slotClassName}
            title="Pace"
            valueDisplay={formatRunningPacePerMile(telemetry.speedMph)}
            unit="/MI"
            primaryBadge={`${telemetry.speedMph.toFixed(1)} mph · ${Math.round(telemetry.powerWatts)}W`}
            secondarySub={
              isFocus && activeSegmentInfo?.targets.targetSpeedMphRange
                ? `Goal ${activeSegmentInfo.targets.targetSpeedMphRange[0].toFixed(1)}–${activeSegmentInfo.targets.targetSpeedMphRange[1].toFixed(1)} mph`
                : `Incline ${(telemetry.inclinePct ?? 0).toFixed(1)}% · Thr ${formatPaceSeconds(runThresholdSec)}/mi`
            }
            zones={runSpeedZones}
            numericValue={telemetry.speedMph}
            activeZone={activeRunSpeedZone}
            extraControl={speedControl}
            arrange={arrange}
          />
        );
      }

      if (sport === 'rowing') {
        return (
          <GaugeCard
            id={isFocus ? 'focus-power-card' : 'power-metric-card'}
            tileId="power"
            className={slotClassName}
            title="Split /500m"
            valueDisplay={formatRowingSplit(liveRowSplit)}
            unit="/500M"
            primaryBadge={`${Math.round(telemetry.powerWatts)}W · ${ftpPct}% FTP`}
            secondarySub={
              isFocus && activeSegmentInfo?.targets.targetSplitSecRange
                ? `Goal ${formatRowingSplit(activeSegmentInfo.targets.targetSplitSecRange[0])}–${formatRowingSplit(activeSegmentInfo.targets.targetSplitSecRange[1])}`
                : `Row FTP ${effFtp}W (${formatRowingSplit(rowingWattsToSplitSecPer500m(effFtp))})`
            }
            zones={powerZones}
            numericValue={telemetry.powerWatts}
            activeZone={activePowerZone}
            thresholdUnitSuffix="W"
            arrange={arrange}
          />
        );
      }

      return (
        <GaugeCard
          id={isFocus ? 'focus-power-card' : 'power-metric-card'}
          tileId="power"
          className={slotClassName}
          title="Power"
          valueDisplay={`${Math.round(telemetry.powerWatts)}`}
          unit="Watts"
          primaryBadge={`${ftpPct}% FTP · ${liveWkg.toFixed(2)} W/kg`}
          secondarySub={
            isFocus && activeSegmentInfo
              ? `Goal ${activeSegmentInfo.targets.minWatts}–${activeSegmentInfo.targets.maxWatts}W`
              : `FTP ${profile.ftpWatts}W (${profile.weightLbs}#)`
          }
          zones={powerZones}
          numericValue={telemetry.powerWatts}
          activeZone={activePowerZone}
          thresholdUnitSuffix="W"
          arrange={arrange}
        />
      );
    }

    case 'cadence': {
      if (sport === 'running') {
        const showInclinePrimary =
          telemetry.cadenceRpm <= 0 &&
          (telemetry.speedMph > 0.3 || telemetry.bikeFamily === 'ftms-treadmill');
        if (showInclinePrimary) {
          const inclineVal = telemetry.inclinePct ?? 0;
          const activeInclineZone = resolveZone(inclineVal, INCLINE_ZONES);
          return (
            <GaugeCard
              id={isFocus ? 'focus-cadence-card' : 'cadence-metric-card'}
              tileId="cadence"
              className={slotClassName}
              title="Incline"
              valueDisplay={inclineVal.toFixed(1)}
              unit="% GRADE"
              primaryBadge={`${telemetry.speedMph.toFixed(1)} mph`}
              secondarySub={
                activeSegmentInfo?.targets.targetInclinePct !== undefined
                  ? `${isFocus ? 'Goal' : 'Target'} ${activeSegmentInfo.targets.targetInclinePct.toFixed(1)}% grade`
                  : 'Treadmill Grade'
              }
              zones={INCLINE_ZONES}
              numericValue={inclineVal}
              activeZone={activeInclineZone}
              extraControl={resistanceControl}
              arrange={arrange}
            />
          );
        }

        return (
          <GaugeCard
            id={isFocus ? 'focus-cadence-card' : 'cadence-metric-card'}
            tileId="cadence"
            className={slotClassName}
            title="Cadence"
            valueDisplay={`${Math.round(telemetry.cadenceRpm)}`}
            unit="SPM"
            primaryBadge={formatBikeGearBadge(telemetry)}
            secondarySub={
              activeSegmentInfo
                ? `${isFocus ? 'Goal' : 'Target'} ${activeSegmentInfo.segment.cadenceRange[0]}–${activeSegmentInfo.segment.cadenceRange[1]} spm`
                : 'Stride Turnover'
            }
            zones={cadenceZones}
            numericValue={telemetry.cadenceRpm}
            activeZone={activeCadenceZone}
            extraControl={resistanceControl}
            arrange={arrange}
          />
        );
      }

      if (sport === 'rowing') {
        return (
          <GaugeCard
            id={isFocus ? 'focus-cadence-card' : 'cadence-metric-card'}
            tileId="cadence"
            className={slotClassName}
            title="Stroke Rate"
            valueDisplay={`${Math.round(telemetry.cadenceRpm)}`}
            unit="SPM"
            primaryBadge={formatBikeGearBadge(telemetry)}
            secondarySub={
              activeSegmentInfo
                ? `${isFocus ? 'Goal' : 'Target'} ${activeSegmentInfo.segment.cadenceRange[0]}–${activeSegmentInfo.segment.cadenceRange[1]} spm`
                : telemetry.strokeCount
                  ? `${telemetry.strokeCount} strokes`
                  : 'Stroke Rhythm'
            }
            zones={cadenceZones}
            numericValue={telemetry.cadenceRpm}
            activeZone={activeCadenceZone}
            extraControl={resistanceControl}
            arrange={arrange}
          />
        );
      }

      return (
        <GaugeCard
          id={isFocus ? 'focus-cadence-card' : 'cadence-metric-card'}
          tileId="cadence"
          className={slotClassName}
          title="Cadence"
          valueDisplay={`${Math.round(telemetry.cadenceRpm)}`}
          unit="RPM"
          primaryBadge={formatBikeGearBadge(telemetry)}
          secondarySub={
            activeSegmentInfo
              ? `${isFocus ? 'Goal' : 'Target'} ${activeSegmentInfo.segment.cadenceRange[0]}–${activeSegmentInfo.segment.cadenceRange[1]}`
              : 'Spin Rhythm'
          }
          zones={cadenceZones}
          numericValue={telemetry.cadenceRpm}
          activeZone={activeCadenceZone}
          extraControl={resistanceControl}
          arrange={arrange}
        />
      );
    }

    case 'hr':
      return (
        <GaugeCard
          id={isFocus ? 'focus-hr-card' : 'hr-metric-card'}
          tileId="hr"
          className={slotClassName}
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
          arrange={arrange}
        />
      );

    case 'speed': {
      if (sport === 'rowing') {
        return (
          <GaugeCard
            id={isFocus ? 'focus-speed-card' : 'speed-metric-card'}
            tileId="speed"
            className={slotClassName}
            title="Power"
            valueDisplay={`${Math.round(telemetry.powerWatts)}`}
            unit="WATTS"
            primaryBadge={`${formatRowingSplit(liveRowSplit)} /500m`}
            secondarySub={`Row FTP ${effFtp}W · ${liveWkg.toFixed(2)} W/kg`}
            zones={powerZones}
            numericValue={telemetry.powerWatts}
            activeZone={activePowerZone}
            thresholdUnitSuffix="W"
            arrange={arrange}
          />
        );
      }

      if (sport === 'running') {
        const kmh = telemetry.speedMph * 1.60934;
        const runSpeedZones = getRunningSpeedZones(getEffectiveRunThresholdPaceSec(profile));
        const activeRunSpeedZone = resolveZone(telemetry.speedMph, runSpeedZones);
        return (
          <GaugeCard
            id={isFocus ? 'focus-speed-card' : 'speed-metric-card'}
            tileId="speed"
            className={slotClassName}
            title="Speed"
            valueDisplay={telemetry.speedMph.toFixed(1)}
            unit="MPH"
            primaryBadge={`${formatRunningPacePerMile(telemetry.speedMph)}/mi · ${kmh.toFixed(1)} km/h`}
            secondarySub={`Incline ${(telemetry.inclinePct ?? 0).toFixed(1)}% · ${profile.weightLbs}#`}
            zones={runSpeedZones}
            numericValue={telemetry.speedMph}
            activeZone={activeRunSpeedZone}
            arrange={arrange}
          />
        );
      }

      const kmh = telemetry.speedMph * 1.60934;
      const activeSpeedZone = resolveZone(telemetry.speedMph, SPEED_ZONES);
      return (
        <GaugeCard
          id={isFocus ? 'focus-speed-card' : 'speed-metric-card'}
          tileId="speed"
          className={slotClassName}
          title="Speed"
          valueDisplay={telemetry.speedMph.toFixed(1)}
          unit="MPH"
          primaryBadge={`${kmh.toFixed(1)} km/h`}
          secondarySub={`Aero ${formatHeightImperial(profile.heightFeet, profile.heightInches)} · ${profile.weightLbs}#`}
          zones={SPEED_ZONES}
          numericValue={telemetry.speedMph}
          activeZone={activeSpeedZone}
          arrange={arrange}
        />
      );
    }

    case 'distance': {
      const distInfo = activeSegmentInfo?.distanceMode;
      const unit = distInfo?.unit ?? (sport === 'rowing' ? 'm' : 'mi');
      const nativeValue =
        unit === 'm'
          ? Math.round(distanceMeters)
          : unit === 'km'
            ? distanceMeters / 1000
            : metersToMiles(distanceMeters);
      const targetNative = distInfo
        ? unit === 'm'
          ? distInfo.totalTargetMeters
          : unit === 'km'
            ? distInfo.totalTargetMeters / 1000
            : metersToMiles(distInfo.totalTargetMeters)
        : sport === 'rowing'
          ? 5000
          : undefined;
      const distZones = getDistanceZones(targetNative);
      const activeDistZone = resolveZone(nativeValue, distZones);
      const altDistance =
        unit === 'm'
          ? `${(distanceMeters / 1000).toFixed(2)} km · ${metersToMiles(distanceMeters).toFixed(2)} mi`
          : unit === 'km'
            ? `${metersToMiles(distanceMeters).toFixed(2)} mi`
            : `${(distanceMeters / 1000).toFixed(2)} km`;

      return (
        <GaugeCard
          id={isFocus ? 'focus-distance-card' : 'distance-metric-card'}
          tileId="distance"
          className={slotClassName}
          title="Distance"
          valueDisplay={
            unit === 'm' ? nativeValue.toLocaleString('en-US') : nativeValue.toFixed(2)
          }
          unit={unit === 'm' ? 'METERS' : unit.toUpperCase()}
          primaryBadge={
            distInfo
              ? `${Math.round(distInfo.overallProgressPct)}% · ${formatDistanceTarget(distInfo.totalTargetMeters, unit)}`
              : altDistance
          }
          secondarySub={
            distInfo
              ? distInfo.isGoalComplete
                ? 'Challenge complete!'
                : `${formatDistanceValue(distInfo.totalRemainingMeters, unit)} left`
              : sport === 'rowing'
                ? `Split ${formatRowingSplit(liveRowSplit)} /500m`
                : sport === 'running'
                  ? `Pace ${formatRunningPacePerMile(telemetry.speedMph)} /mi`
                  : `Pace ${telemetry.speedMph.toFixed(1)} mph`
          }
          zones={distZones}
          numericValue={nativeValue}
          activeZone={activeDistZone}
          arrange={arrange}
        />
      );
    }

    case 'calories': {
      const activeCalZone = resolveZone(caloriesKcal, CALORIE_ZONES);
      const kcalPerHour = elapsedSec >= 10 ? Math.round((caloriesKcal / elapsedSec) * 3600) : 0;
      return (
        <GaugeCard
          id={isFocus ? 'focus-calories-card' : 'calories-metric-card'}
          tileId="calories"
          className={slotClassName}
          title="Calories"
          valueDisplay={`${Math.round(caloriesKcal)}`}
          unit="KCAL"
          primaryBadge={kcalPerHour > 0 ? `${kcalPerHour} kcal/hr` : 'Power & HR Scaled'}
          secondarySub={`${burnPoints} Burn pts · Z4+Z5 ${formatDuration(burnZoneTotalSec)}`}
          zones={CALORIE_ZONES}
          numericValue={caloriesKcal}
          activeZone={activeCalZone}
          arrange={arrange}
        />
      );
    }

    case 'avgPower': {
      const activeAvgZone = resolveZone(avgRideWatts, powerZones);
      const avgWkg = computeWattsPerKg(avgRideWatts, profile.weightLbs);
      const avgFtpPct = effFtp > 0 ? Math.round((avgRideWatts / effFtp) * 100) : 0;
      const avgSplitLabel =
        sport === 'rowing' && avgRideWatts > 0
          ? `${formatRowingSplit(rowingWattsToSplitSecPer500m(avgRideWatts))}/500m · `
          : '';
      return (
        <GaugeCard
          id={isFocus ? 'focus-avg-power-card' : 'avg-power-metric-card'}
          tileId="avgPower"
          className={slotClassName}
          title="Avg Power"
          valueDisplay={`${avgRideWatts}`}
          unit="AVG W"
          primaryBadge={`${avgSplitLabel}NP ${npRideWatts}W · ${avgWkg.toFixed(2)} W/kg`}
          secondarySub={`${avgFtpPct}% ${sport === 'rowing' ? 'Row ' : ''}FTP (${effFtp}W)`}
          zones={powerZones}
          numericValue={avgRideWatts}
          activeZone={activeAvgZone}
          thresholdUnitSuffix="W"
          arrange={arrange}
        />
      );
    }

    case 'stats':
      return (
        <RideStatsQuadCard
          id={isFocus ? 'focus-ride-stats-card' : 'compact-all-stats-card'}
          tileId="stats"
          className={`${isFocus ? '' : 'compact-telemetry-quad'} ${slotClassName}`.trim()}
          sport={sport}
          speedMph={telemetry.speedMph}
          inclinePct={telemetry.inclinePct}
          paceSecPer500m={telemetry.paceSecPer500m}
          distanceMeters={distanceMeters}
          caloriesKcal={caloriesKcal}
          avgRideWatts={avgRideWatts}
          npRideWatts={npRideWatts}
          burnPoints={burnPoints}
          burnZoneTotalSec={burnZoneTotalSec}
          statOrder={quadStatOrder}
          arrange={arrange}
        />
      );

    case 'interval':
      return (
        <IntervalTargetCard
          id={isFocus ? 'focus-interval-card' : 'interval-target-card'}
          className={slotClassName}
          sport={sport}
          info={activeSegmentInfo}
          arrange={arrange}
        />
      );

    case 'zones':
      return (
        <ZoneTimeCard
          id={isFocus ? 'focus-zones-card' : 'zone-time-card'}
          className={slotClassName}
          hasHrStream={hasHrStream}
          zoneSeconds={hasHrStream ? hrZoneSeconds : powerZoneSeconds}
          arrange={arrange}
        />
      );
  }
}
