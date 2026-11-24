import type { SavedRide } from '../types/fitness';
import {
  formatRowingSplit,
  formatRunningPacePerMile,
  mpsToMph,
  rowingWattsToSplitSecPer500m,
} from '../utils/zones';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const JBF_STRAVA_APP_DOMAIN = 'jbfit.studio';

/**
 * Cleans legacy "JBF " prefixes and redundant "(23 min)" suffixes when
 * the workout title already includes its duration (e.g. "23-Min Signature Burn").
 */
export function normalizeRideTitle(title: string): string {
  let cleaned = title.trim().replace(/^JBF\s+/i, '');
  if (/\b\d+\s*-?\s*min/i.test(cleaned)) {
    cleaned = cleaned.replace(/\s*\(\d+\s*(?:min|m)\)\s*$/i, '');
  }
  return cleaned;
}

/**
 * Shared summary description sent to Strava, Garmin Connect, and embedded TCX <Notes>.
 * Avoids repeating the workout title/duration and appends bare jbfit.studio below the summary.
 */
export function buildRideSummaryDescription(ride: SavedRide): string {
  const sport = ride.sport ?? 'cycling';
  let statsLine: string;

  if (sport === 'running') {
    const deviceTag = ride.bikeLabel || 'Treadmill';
    const avgMph =
      ride.durationSec > 0 && ride.distanceMeters > 0
        ? mpsToMph(ride.distanceMeters / ride.durationSec)
        : 0;
    const paceStr = formatRunningPacePerMile(avgMph);
    const pacePart =
      avgMph > 0.4
        ? `Avg Pace: ${paceStr} /mi (${avgMph.toFixed(1)} mph)`
        : `Avg Power: ${ride.avgWatts}W`;
    statsLine = [
      `Just Believe Fitness · ${deviceTag}`,
      ride.burnPoints > 0 ? `Burn Points: ${ride.burnPoints} | ${pacePart}` : pacePart,
      ride.avgHr > 0 ? `Avg HR: ${ride.avgHr} bpm (Max ${ride.maxHr} bpm)` : null,
      typeof ride.avgInclinePct === 'number' && ride.avgInclinePct > 0
        ? `Avg Incline: ${ride.avgInclinePct.toFixed(1)}% | Calories: ${Math.round(ride.caloriesKcal)} kcal`
        : ride.avgCadence > 0
          ? `Avg Cadence: ${ride.avgCadence} spm | Calories: ${Math.round(ride.caloriesKcal)} kcal`
          : `Calories: ${Math.round(ride.caloriesKcal)} kcal`,
    ]
      .filter(Boolean)
      .join(' • ');
  } else if (sport === 'rowing') {
    const deviceTag = ride.bikeLabel || 'FTMS Rower';
    const avgSplit =
      ride.avgSplitSecPer500m && ride.avgSplitSecPer500m > 0
        ? ride.avgSplitSecPer500m
        : ride.durationSec > 0 && ride.distanceMeters > 50
          ? (ride.durationSec / ride.distanceMeters) * 500
          : rowingWattsToSplitSecPer500m(ride.avgWatts);
    const splitPart =
      avgSplit > 0
        ? `Avg Split: ${formatRowingSplit(avgSplit)} /500m (${ride.avgWatts}W)`
        : `Avg Power: ${ride.avgWatts}W`;
    statsLine = [
      `Just Believe Fitness · ${deviceTag}`,
      ride.burnPoints > 0 ? `Burn Points: ${ride.burnPoints} | ${splitPart}` : splitPart,
      ride.avgHr > 0 ? `Avg HR: ${ride.avgHr} bpm (Max ${ride.maxHr} bpm)` : null,
      `Avg Rate: ${ride.avgCadence} spm | Calories: ${Math.round(ride.caloriesKcal)} kcal`,
    ]
      .filter(Boolean)
      .join(' • ');
  } else {
    const bikeTag = ride.bikeLabel || 'Indoor Bike';
    const powerPart = `Avg Power: ${ride.avgWatts}W (${ride.avgWkg.toFixed(2)} W/kg, NP ${ride.normalizedWatts}W)`;
    statsLine = [
      `Just Believe Fitness · ${bikeTag}`,
      ride.burnPoints > 0 ? `Burn Points: ${ride.burnPoints} | ${powerPart}` : powerPart,
      ride.avgHr > 0 ? `Avg HR: ${ride.avgHr} bpm (Max ${ride.maxHr} bpm)` : null,
      `Avg Cadence: ${ride.avgCadence} rpm | Calories: ${Math.round(ride.caloriesKcal)} kcal`,
    ]
      .filter(Boolean)
      .join(' • ');
  }

  const trimmedNotes = ride.notes?.trim();
  const alreadyHasDomain = trimmedNotes?.toLowerCase().includes(JBF_STRAVA_APP_DOMAIN) ?? false;
  const summaryFooter = alreadyHasDomain ? statsLine : `${statsLine}\n${JBF_STRAVA_APP_DOMAIN}`;
  return trimmedNotes ? `${trimmedNotes}\n\n${summaryFooter}` : summaryFooter;
}

function formatTcxIsoSecond(ms: number): string {
  const secMs = Math.round(ms / 1000) * 1000;
  return new Date(secMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Generates a Garmin / Strava Training Center XML (.tcx) file containing
 * 1-second telemetry: Power (<ns3:Watts>), Cadence (<Cadence> / <ns3:RunCadence>),
 * Heart Rate (<HeartRateBpm>), Distance (<DistanceMeters>), and Calories.
 */
export function buildRideTcxXml(ride: SavedRide): string {
  const sport = ride.sport ?? 'cycling';
  const tcxSportAttr = sport === 'running' ? 'Running' : sport === 'rowing' ? 'Other' : 'Biking';
  const defaultDeviceLabel =
    sport === 'running' ? 'Treadmill' : sport === 'rowing' ? 'FTMS Rower' : 'Indoor Bike';

  const parsedStartMs = Date.parse(ride.startedAtIso);
  const startMs = Number.isFinite(parsedStartMs)
    ? parsedStartMs
    : ride.trackPoints[0]?.timestampMs ?? Date.now();
  const startSecMs = Math.round(startMs / 1000) * 1000;
  const startIso = formatTcxIsoSecond(startSecMs);

  let lastPointSecMs = startSecMs - 1000;
  const trackpointsXml = ride.trackPoints
    .map((pt, i) => {
      const rawSecMs =
        Math.round((pt.timestampMs || startMs + (pt.elapsedSec ?? i) * 1000) / 1000) * 1000;
      const pointSecMs = Math.max(lastPointSecMs + 1000, rawSecMs);
      lastPointSecMs = pointSecMs;
      const timeIso = formatTcxIsoSecond(pointSecMs);
      const hrBlock =
        pt.heartRateBpm > 0
          ? `
            <HeartRateBpm>
              <Value>${Math.round(pt.heartRateBpm)}</Value>
            </HeartRateBpm>`
          : '';
      const cadenceLine =
        sport === 'running'
          ? ''
          : `
            <Cadence>${Math.round(pt.cadenceRpm)}</Cadence>`;
      const runCadenceLine =
        sport === 'running' && pt.cadenceRpm > 0
          ? `
                <ns3:RunCadence>${Math.round(pt.cadenceRpm / 2)}</ns3:RunCadence>`
          : '';

      return `          <Trackpoint>
            <Time>${timeIso}</Time>
            <DistanceMeters>${pt.distanceMeters.toFixed(2)}</DistanceMeters>${hrBlock}${cadenceLine}
            <Extensions>
              <ns3:TPX>
                <ns3:Speed>${pt.speedMps.toFixed(2)}</ns3:Speed>${runCadenceLine}
                <ns3:Watts>${Math.round(pt.powerWatts)}</ns3:Watts>
              </ns3:TPX>
            </Extensions>
          </Trackpoint>`;
    })
    .join('\n');

  const avgHrBlock =
    ride.avgHr > 0
      ? `
        <AverageHeartRateBpm>
          <Value>${Math.round(ride.avgHr)}</Value>
        </AverageHeartRateBpm>
        <MaximumHeartRateBpm>
          <Value>${Math.round(ride.maxHr)}</Value>
        </MaximumHeartRateBpm>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd"
  xmlns:ns5="http://www.garmin.com/xmlschemas/ActivityGoals/v1"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"
  xmlns:ns2="http://www.garmin.com/xmlschemas/UserProfile/v2"
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Activities>
    <Activity Sport="${tcxSportAttr}">
      <Id>${startIso}</Id>
      <Notes>${escapeXml(buildRideSummaryDescription(ride))}</Notes>
      <Lap StartTime="${startIso}">
        <TotalTimeSeconds>${ride.durationSec}</TotalTimeSeconds>
        <DistanceMeters>${ride.distanceMeters.toFixed(2)}</DistanceMeters>
        <Calories>${Math.round(ride.caloriesKcal)}</Calories>${avgHrBlock}
        <Intensity>Active</Intensity>
        <Cadence>${Math.round(sport === 'running' ? ride.avgCadence / 2 : ride.avgCadence)}</Cadence>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
${trackpointsXml}
        </Track>
        <Extensions>
          <ns3:LX>
            <ns3:AvgWatts>${Math.round(ride.avgWatts)}</ns3:AvgWatts>
            <ns3:MaxWatts>${Math.round(ride.maxWatts)}</ns3:MaxWatts>
          </ns3:LX>
        </Extensions>
      </Lap>
      <Creator xsi:type="Device_t">
        <Name>${escapeXml(`Just Believe Fitness (${ride.bikeLabel || defaultDeviceLabel})`)}</Name>
        <UnitId>0</UnitId>
        <ProductID>0</ProductID>
        <Version>
          <VersionMajor>1</VersionMajor>
          <VersionMinor>0</VersionMinor>
          <BuildMajor>0</BuildMajor>
          <BuildMinor>0</BuildMinor>
        </Version>
      </Creator>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}

export function downloadRideTcx(ride: SavedRide): void {
  const xml = buildRideTcxXml(ride);
  const blob = new Blob([xml], { type: 'application/vnd.garmin.tcx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const datePart = ride.startedAtIso.slice(0, 10);
  const safeTitle = ride.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `jbf-${datePart}-${safeTitle || 'ride'}.tcx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
