import type { SavedRide } from '../types/fitness';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a Garmin / Strava Training Center XML (.tcx) file containing
 * 1-second indoor cycling telemetry: Power (<ns3:Watts>), Cadence (<Cadence>),
 * Heart Rate (<HeartRateBpm>), Distance (<DistanceMeters>), and Calories.
 */
export function buildRideTcxXml(ride: SavedRide): string {
  const startIso = new Date(ride.startedAtIso).toISOString();

  const trackpointsXml = ride.trackPoints
    .map((pt) => {
      const timeIso = new Date(pt.timestampMs).toISOString();
      const hrBlock =
        pt.heartRateBpm > 0
          ? `
            <HeartRateBpm>
              <Value>${Math.round(pt.heartRateBpm)}</Value>
            </HeartRateBpm>`
          : '';

      return `          <Trackpoint>
            <Time>${timeIso}</Time>
            <DistanceMeters>${pt.distanceMeters.toFixed(2)}</DistanceMeters>${hrBlock}
            <Cadence>${Math.round(pt.cadenceRpm)}</Cadence>
            <Extensions>
              <ns3:TPX>
                <ns3:Speed>${pt.speedMps.toFixed(2)}</ns3:Speed>
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
    <Activity Sport="Biking">
      <Id>${startIso}</Id>
      <Notes>${escapeXml(
        `${ride.title} · ${ride.burnPoints} Burn pts · Avg ${ride.avgWatts}W (${ride.avgWkg.toFixed(2)} W/kg)`
      )}</Notes>
      <Lap StartTime="${startIso}">
        <TotalTimeSeconds>${ride.durationSec}</TotalTimeSeconds>
        <DistanceMeters>${ride.distanceMeters.toFixed(2)}</DistanceMeters>
        <Calories>${Math.round(ride.caloriesKcal)}</Calories>${avgHrBlock}
        <Intensity>Active</Intensity>
        <Cadence>${Math.round(ride.avgCadence)}</Cadence>
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
        <Name>${escapeXml(`Just Believe Fitness (${ride.bikeLabel || 'Indoor Bike'})`)}</Name>
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
