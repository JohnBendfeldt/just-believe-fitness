import type { ReactNode } from 'react';
import type {
  ActiveSegmentSummary,
  AthleteProfile,
  LiveTelemetry,
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
  getCalorieZones,
  getDistanceZones,
  getSpeedZones,
  metersToMiles,
  resolveZone,
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
  quadStatOrder: QuadStatId[];
  arrange?: TileArrangeBinding;
}

const SPEED_ZONES = getSpeedZones();
const CALORIE_ZONES = getCalorieZones();

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
  quadStatOrder,
  arrange,
}: CockpitTileProps) {
  const GaugeCard = gaugeStyle === 'rings' ? ZoneSpeedometerCard : ZoneMetricCard;
  const isFocus = context === 'focus';

  const liveWkg = computeWattsPerKg(telemetry.powerWatts, profile.weightLbs);
  const ftpPct =
    profile.ftpWatts > 0 ? Math.round((telemetry.powerWatts / profile.ftpWatts) * 100) : 0;
  const hrPct =
    profile.maxHrBpm > 0 && telemetry.heartRateBpm > 0
      ? Math.round((telemetry.heartRateBpm / profile.maxHrBpm) * 100)
      : 0;

  switch (tileId) {
    case 'power':
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

    case 'cadence':
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
      const unit = distInfo?.unit ?? 'mi';
      const nativeValue = unit === 'km' ? distanceMeters / 1000 : metersToMiles(distanceMeters);
      const targetNative = distInfo
        ? unit === 'km'
          ? distInfo.totalTargetMeters / 1000
          : metersToMiles(distInfo.totalTargetMeters)
        : undefined;
      const distZones = getDistanceZones(targetNative);
      const activeDistZone = resolveZone(nativeValue, distZones);
      const altDistance =
        unit === 'km'
          ? `${metersToMiles(distanceMeters).toFixed(2)} mi`
          : `${(distanceMeters / 1000).toFixed(2)} km`;

      return (
        <GaugeCard
          id={isFocus ? 'focus-distance-card' : 'distance-metric-card'}
          tileId="distance"
          className={slotClassName}
          title="Distance"
          valueDisplay={nativeValue.toFixed(2)}
          unit={unit.toUpperCase()}
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
      const avgFtpPct =
        profile.ftpWatts > 0 ? Math.round((avgRideWatts / profile.ftpWatts) * 100) : 0;
      return (
        <GaugeCard
          id={isFocus ? 'focus-avg-power-card' : 'avg-power-metric-card'}
          tileId="avgPower"
          className={slotClassName}
          title="Avg Power"
          valueDisplay={`${avgRideWatts}`}
          unit="AVG W"
          primaryBadge={`NP ${npRideWatts}W · ${avgWkg.toFixed(2)} W/kg`}
          secondarySub={`${avgFtpPct}% FTP (${profile.ftpWatts}W)`}
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
          speedMph={telemetry.speedMph}
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
