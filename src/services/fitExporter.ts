import type { SavedRide, TrackPoint } from '../types/fitness';
import { computeNormalizedPower, computeWattsPerKg, DEFAULT_ATHLETE_PROFILE } from '../utils/zones';

/** Garmin FIT Epoch: 1989-12-31T00:00:00Z in Unix seconds */
const FIT_EPOCH_UNIX_SEC = 631065600;

export type FitDevicePresetId = 'edge-830' | 'tacx-app' | 'zwift' | 'standard';

export interface FitDevicePreset {
  id: FitDevicePresetId;
  label: string;
  description: string;
  manufacturer: number;
  product: number;
  serialNumber: number;
  softwareVersion: number;
  /** FIT sub_sport enum: 6 = indoor_cycling, 58 = virtual_activity */
  subSport: number;
}

export const FIT_DEVICE_PRESETS: Record<FitDevicePresetId, FitDevicePreset> = {
  'edge-830': {
    id: 'edge-830',
    label: 'Garmin Edge 830 (Training Status)',
    description: 'Tags FIT header as Edge 830 indoor cycling so Garmin Connect calculates Training Load & Status.',
    manufacturer: 1, // Garmin
    product: 3122, // Edge 830
    serialNumber: 3412567890,
    softwareVersion: 975, // 9.75
    subSport: 6, // indoor_cycling
  },
  'tacx-app': {
    id: 'tacx-app',
    label: 'Tacx Training App (Training Status)',
    description: 'Tags FIT header as Garmin/Tacx virtual ride for Unified Training Status.',
    manufacturer: 89, // Tacx
    product: 20533, // Tacx Training App
    serialNumber: 3412567891,
    softwareVersion: 400, // 4.00
    subSport: 58, // virtual_activity
  },
  zwift: {
    id: 'zwift',
    label: 'Zwift Virtual Ride (Partner ID)',
    description: 'Tags FIT header as a Zwift virtual ride (Garmin Training Status partner).',
    manufacturer: 260, // Zwift
    product: 0,
    serialNumber: 3412567892,
    softwareVersion: 100, // 1.00
    subSport: 58, // virtual_activity
  },
  standard: {
    id: 'standard',
    label: 'Standard .FIT (Generic App)',
    description: 'Standard indoor cycling .FIT file (no device ID override; Garmin skips Training Status).',
    manufacturer: 255, // Development
    product: 0,
    serialNumber: 1,
    softwareVersion: 100,
    subSport: 6, // indoor_cycling
  },
};

const FIT_CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

/** Official Garmin FIT CRC-16 checksum over [start, end). */
export function computeFitCrc(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    const byte = bytes[i];
    let tmp = FIT_CRC_TABLE[crc & 0x0f];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ FIT_CRC_TABLE[byte & 0x0f];

    tmp = FIT_CRC_TABLE[crc & 0x0f];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ FIT_CRC_TABLE[(byte >> 4) & 0x0f];
  }
  return crc & 0xffff;
}

const BASE_TYPE = {
  enum: { code: 0x00, size: 1, invalid: 0xff },
  uint8: { code: 0x02, size: 1, invalid: 0xff },
  uint16: { code: 0x84, size: 2, invalid: 0xffff },
  uint32: { code: 0x86, size: 4, invalid: 0xffffffff },
  uint32z: { code: 0x8c, size: 4, invalid: 0x00000000 },
} as const;

type FitBaseTypeKey = keyof typeof BASE_TYPE;

interface FitFieldDef {
  num: number;
  type: FitBaseTypeKey;
}

class FitBinaryWriter {
  private chunks: number[] = [];

  public pushU8(v: number): void {
    this.chunks.push(v & 0xff);
  }

  public pushU16LE(v: number): void {
    const n = v >>> 0;
    this.chunks.push(n & 0xff, (n >>> 8) & 0xff);
  }

  public pushU32LE(v: number): void {
    const n = v >>> 0;
    this.chunks.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
  }

  public writeDefinition(localMsgNum: number, globalMsgNum: number, fields: FitFieldDef[]): void {
    // Record header: bit 6 = 1 (definition message), bits 0..3 = local message type
    this.pushU8(0x40 | (localMsgNum & 0x0f));
    this.pushU8(0); // reserved
    this.pushU8(0); // architecture: 0 = little-endian
    this.pushU16LE(globalMsgNum);
    this.pushU8(fields.length);
    for (const f of fields) {
      const bt = BASE_TYPE[f.type];
      this.pushU8(f.num);
      this.pushU8(bt.size);
      this.pushU8(bt.code);
    }
  }

  public writeData(
    localMsgNum: number,
    fields: FitFieldDef[],
    values: Array<number | undefined | null>
  ): void {
    // Record header: bit 6 = 0 (data message), bits 0..3 = local message type
    this.pushU8(localMsgNum & 0x0f);
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const bt = BASE_TYPE[f.type];
      const raw = values[i];
      const val =
        raw === undefined || raw === null || !Number.isFinite(raw) ? bt.invalid : Math.round(raw);
      if (bt.size === 1) {
        this.pushU8(val);
      } else if (bt.size === 2) {
        this.pushU16LE(val);
      } else {
        this.pushU32LE(val);
      }
    }
  }

  public buildFitFile(): Uint8Array {
    const dataBytes = new Uint8Array(this.chunks);
    const headerSize = 14;
    const totalSize = headerSize + dataBytes.length + 2;
    const out = new Uint8Array(totalSize);

    // 14-byte FIT v2.0 file header
    out[0] = headerSize;
    out[1] = 0x20; // Protocol version 2.0
    const profileVersion = 2132; // Profile 21.32
    out[2] = profileVersion & 0xff;
    out[3] = (profileVersion >> 8) & 0xff;

    const dataSize = dataBytes.length >>> 0;
    out[4] = dataSize & 0xff;
    out[5] = (dataSize >>> 8) & 0xff;
    out[6] = (dataSize >>> 16) & 0xff;
    out[7] = (dataSize >>> 24) & 0xff;

    // ".FIT" signature
    out[8] = 0x2e;
    out[9] = 0x46;
    out[10] = 0x49;
    out[11] = 0x54;

    const headerCrc = computeFitCrc(out, 0, 12);
    out[12] = headerCrc & 0xff;
    out[13] = (headerCrc >> 8) & 0xff;

    out.set(dataBytes, headerSize);

    // Trailer CRC over data bytes (mathematically equal to CRC over [0..headerSize+dataSize) since header CRC zeroes out)
    const fileCrc = computeFitCrc(out, 0, headerSize + dataBytes.length);
    out[headerSize + dataBytes.length] = fileCrc & 0xff;
    out[headerSize + dataBytes.length + 1] = (fileCrc >> 8) & 0xff;

    return out;
  }
}

function toFitTimestamp(ms: number): number {
  return Math.max(0, Math.round(ms / 1000) - FIT_EPOCH_UNIX_SEC);
}

function clampU8(val: number, max = 254): number {
  return Math.max(0, Math.min(max, Math.round(val)));
}

function clampU16(val: number, max = 65534): number {
  return Math.max(0, Math.min(max, Math.round(val)));
}

/**
 * Encodes a SavedRide into a spec-compliant Garmin FIT v2.0 binary file (.fit)
 * with 1-second Power, Heart Rate, Cadence, Speed, Distance, Normalized Power,
 * Intensity Factor, TSS, and optional Garmin Training Status device metadata.
 */
export function buildRideFitBytes(
  ride: SavedRide,
  presetId: FitDevicePresetId = 'edge-830'
): Uint8Array {
  const preset = FIT_DEVICE_PRESETS[presetId] ?? FIT_DEVICE_PRESETS['edge-830'];
  const writer = new FitBinaryWriter();

  const parsedStartMs = Date.parse(ride.startedAtIso);
  const startMs = Number.isFinite(parsedStartMs)
    ? parsedStartMs
    : ride.trackPoints[0]?.timestampMs ?? Date.now();
  const parsedEndMs = Date.parse(ride.endedAtIso);
  const endMs = Number.isFinite(parsedEndMs)
    ? Math.max(startMs + 1000, parsedEndMs)
    : startMs + Math.max(1, ride.durationSec) * 1000;

  const startFitTs = toFitTimestamp(startMs);
  const endFitTs = toFitTimestamp(endMs);
  const durationSec = Math.max(1, Math.round(ride.durationSec || (endMs - startMs) / 1000));
  const durationMs = durationSec * 1000;

  // Derived speed / power / TSS summary metrics
  const avgSpeedMps = ride.distanceMeters > 0 ? ride.distanceMeters / durationSec : 0;
  const maxSpeedMps = ride.trackPoints.reduce((m, p) => Math.max(m, p.speedMps || 0), avgSpeedMps);
  const ftpWatts = ride.athleteSnapshot?.ftpWatts || DEFAULT_ATHLETE_PROFILE.ftpWatts;
  const npWatts = ride.normalizedWatts || ride.avgWatts || 0;
  const intensityFactor = ftpWatts > 0 && npWatts > 0 ? npWatts / ftpWatts : 0;
  const tss =
    ftpWatts > 0 && npWatts > 0
      ? (durationSec * npWatts * intensityFactor) / (ftpWatts * 36)
      : 0;
  const totalWorkJoules = Math.max(0, Math.round((ride.avgWatts || 0) * durationSec));

  // Local 0: file_id (global 0)
  const fileIdFields: FitFieldDef[] = [
    { num: 0, type: 'enum' }, // type = 4 (activity)
    { num: 1, type: 'uint16' }, // manufacturer
    { num: 2, type: 'uint16' }, // product
    { num: 3, type: 'uint32z' }, // serial_number
    { num: 4, type: 'uint32' }, // time_created
  ];
  writer.writeDefinition(0, 0, fileIdFields);
  writer.writeData(0, fileIdFields, [
    4,
    preset.manufacturer,
    preset.product,
    preset.serialNumber,
    startFitTs,
  ]);

  // Local 1: device_info (global 23)
  const deviceInfoFields: FitFieldDef[] = [
    { num: 253, type: 'uint32' }, // timestamp
    { num: 0, type: 'uint8' }, // device_index = 0 (creator)
    { num: 2, type: 'uint16' }, // manufacturer
    { num: 4, type: 'uint16' }, // product
    { num: 3, type: 'uint32z' }, // serial_number
    { num: 5, type: 'uint16' }, // software_version (scale 100)
  ];
  writer.writeDefinition(1, 23, deviceInfoFields);
  writer.writeData(1, deviceInfoFields, [
    startFitTs,
    0,
    preset.manufacturer,
    preset.product,
    preset.serialNumber,
    preset.softwareVersion,
  ]);

  // Local 2: event (global 21) - timer start
  const eventFields: FitFieldDef[] = [
    { num: 253, type: 'uint32' }, // timestamp
    { num: 0, type: 'enum' }, // event = 0 (timer)
    { num: 1, type: 'enum' }, // event_type = 0 (start) / 4 (stop_all)
    { num: 4, type: 'uint8' }, // event_group = 0
  ];
  writer.writeDefinition(2, 21, eventFields);
  writer.writeData(2, eventFields, [startFitTs, 0, 0, 0]);

  // Local 3: record (global 20) - 1-second telemetry trackpoints
  const recordFields: FitFieldDef[] = [
    { num: 253, type: 'uint32' }, // timestamp
    { num: 5, type: 'uint32' }, // distance (scale 100 -> cm)
    { num: 6, type: 'uint16' }, // speed (scale 1000 -> mm/s)
    { num: 73, type: 'uint32' }, // enhanced_speed (scale 1000 -> mm/s)
    { num: 3, type: 'uint8' }, // heart_rate (bpm)
    { num: 4, type: 'uint8' }, // cadence (rpm)
    { num: 7, type: 'uint16' }, // power (watts)
  ];
  writer.writeDefinition(3, 20, recordFields);

  const points = ride.trackPoints;
  let lastRecordTs = startFitTs - 1;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const rawTs = toFitTimestamp(pt.timestampMs || startMs + (pt.elapsedSec ?? i) * 1000);
    const ts = Math.max(lastRecordTs + 1, rawTs);
    lastRecordTs = ts;
    const distCm = Math.max(0, Math.round((pt.distanceMeters || 0) * 100));
    const speedMmS = Math.max(0, Math.round((pt.speedMps || 0) * 1000));
    const hr = pt.heartRateBpm > 0 ? clampU8(pt.heartRateBpm) : undefined;
    const cad = clampU8(pt.cadenceRpm || 0);
    const watts = clampU16(pt.powerWatts || 0);
    writer.writeData(3, recordFields, [
      ts,
      distCm,
      clampU16(speedMmS),
      speedMmS,
      hr,
      cad,
      watts,
    ]);
  }

  const stopFitTs = Math.max(endFitTs, lastRecordTs);

  // Timer stop_all event
  writer.writeData(2, eventFields, [stopFitTs, 0, 4, 0]);

  // Local 4: lap (global 19)
  const lapFields: FitFieldDef[] = [
    { num: 253, type: 'uint32' }, // timestamp
    { num: 2, type: 'uint32' }, // start_time
    { num: 7, type: 'uint32' }, // total_elapsed_time (ms)
    { num: 8, type: 'uint32' }, // total_timer_time (ms)
    { num: 9, type: 'uint32' }, // total_distance (cm)
    { num: 11, type: 'uint16' }, // total_calories
    { num: 13, type: 'uint16' }, // avg_speed (mm/s)
    { num: 14, type: 'uint16' }, // max_speed (mm/s)
    { num: 15, type: 'uint8' }, // avg_heart_rate
    { num: 16, type: 'uint8' }, // max_heart_rate
    { num: 17, type: 'uint8' }, // avg_cadence
    { num: 18, type: 'uint8' }, // max_cadence
    { num: 19, type: 'uint16' }, // avg_power
    { num: 20, type: 'uint16' }, // max_power
    { num: 33, type: 'uint16' }, // normalized_power
    { num: 25, type: 'enum' }, // sport = 2 (cycling)
    { num: 39, type: 'enum' }, // sub_sport
    { num: 0, type: 'enum' }, // event = 9 (lap)
    { num: 1, type: 'enum' }, // event_type = 1 (stop)
    { num: 24, type: 'enum' }, // lap_trigger = 7 (session_end)
    { num: 254, type: 'uint16' }, // message_index = 0
  ];
  writer.writeDefinition(4, 19, lapFields);
  writer.writeData(4, lapFields, [
    stopFitTs,
    startFitTs,
    durationMs,
    durationMs,
    Math.max(0, Math.round(ride.distanceMeters * 100)),
    clampU16(ride.caloriesKcal),
    clampU16(avgSpeedMps * 1000),
    clampU16(maxSpeedMps * 1000),
    ride.avgHr > 0 ? clampU8(ride.avgHr) : undefined,
    ride.maxHr > 0 ? clampU8(ride.maxHr) : undefined,
    clampU8(ride.avgCadence),
    clampU8(ride.maxCadence),
    clampU16(ride.avgWatts),
    clampU16(ride.maxWatts),
    npWatts > 0 ? clampU16(npWatts) : undefined,
    2,
    preset.subSport,
    9,
    1,
    7,
    0,
  ]);

  // Local 5: session (global 18)
  const sessionFields: FitFieldDef[] = [
    { num: 253, type: 'uint32' }, // timestamp
    { num: 2, type: 'uint32' }, // start_time
    { num: 0, type: 'enum' }, // event = 9 (lap)
    { num: 1, type: 'enum' }, // event_type = 1 (stop)
    { num: 5, type: 'enum' }, // sport = 2 (cycling)
    { num: 6, type: 'enum' }, // sub_sport
    { num: 7, type: 'uint32' }, // total_elapsed_time (ms)
    { num: 8, type: 'uint32' }, // total_timer_time (ms)
    { num: 9, type: 'uint32' }, // total_distance (cm)
    { num: 11, type: 'uint16' }, // total_calories
    { num: 14, type: 'uint16' }, // avg_speed (mm/s)
    { num: 15, type: 'uint16' }, // max_speed (mm/s)
    { num: 16, type: 'uint8' }, // avg_heart_rate
    { num: 17, type: 'uint8' }, // max_heart_rate
    { num: 18, type: 'uint8' }, // avg_cadence
    { num: 19, type: 'uint8' }, // max_cadence
    { num: 20, type: 'uint16' }, // avg_power
    { num: 21, type: 'uint16' }, // max_power
    { num: 34, type: 'uint16' }, // normalized_power
    { num: 35, type: 'uint16' }, // training_stress_score (scale 10)
    { num: 36, type: 'uint16' }, // intensity_factor (scale 1000)
    { num: 48, type: 'uint32' }, // total_work (Joules)
    { num: 25, type: 'uint16' }, // first_lap_index = 0
    { num: 26, type: 'uint16' }, // num_laps = 1
    { num: 28, type: 'enum' }, // trigger = 0 (activity_end)
    { num: 254, type: 'uint16' }, // message_index = 0
  ];
  writer.writeDefinition(5, 18, sessionFields);
  writer.writeData(5, sessionFields, [
    stopFitTs,
    startFitTs,
    9,
    1,
    2,
    preset.subSport,
    durationMs,
    durationMs,
    Math.max(0, Math.round(ride.distanceMeters * 100)),
    clampU16(ride.caloriesKcal),
    clampU16(avgSpeedMps * 1000),
    clampU16(maxSpeedMps * 1000),
    ride.avgHr > 0 ? clampU8(ride.avgHr) : undefined,
    ride.maxHr > 0 ? clampU8(ride.maxHr) : undefined,
    clampU8(ride.avgCadence),
    clampU8(ride.maxCadence),
    clampU16(ride.avgWatts),
    clampU16(ride.maxWatts),
    npWatts > 0 ? clampU16(npWatts) : undefined,
    tss > 0 ? clampU16(tss * 10) : undefined,
    intensityFactor > 0 ? clampU16(intensityFactor * 1000) : undefined,
    totalWorkJoules,
    0,
    1,
    0,
    0,
  ]);

  // Local 6: activity (global 34)
  const tzOffsetSec = new Date(endMs).getTimezoneOffset() * 60;
  const localEndFitTs = Math.max(0, stopFitTs - tzOffsetSec);
  const activityFields: FitFieldDef[] = [
    { num: 253, type: 'uint32' }, // timestamp
    { num: 0, type: 'uint32' }, // total_timer_time (ms)
    { num: 1, type: 'uint16' }, // num_sessions = 1
    { num: 2, type: 'enum' }, // type = 0 (manual)
    { num: 3, type: 'enum' }, // event = 26 (activity)
    { num: 4, type: 'enum' }, // event_type = 1 (stop)
    { num: 5, type: 'uint32' }, // local_timestamp
  ];
  writer.writeDefinition(6, 34, activityFields);
  writer.writeData(6, activityFields, [
    stopFitTs,
    durationMs,
    1,
    0,
    26,
    1,
    localEndFitTs,
  ]);

  return writer.buildFitFile();
}

function getChildTextByLocalName(parent: Element, localName: string): string | null {
  const target = localName.toLowerCase();
  const nodes = parent.getElementsByTagName('*');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const name = (el.localName || el.tagName.split(':').pop() || '').toLowerCase();
    if (name === target) {
      return el.textContent?.trim() ?? null;
    }
  }
  return null;
}

/**
 * Parses an existing Training Center XML (.tcx) string into a SavedRide
 * so it can be converted directly into a binary Garmin .FIT file in-browser.
 */
export function parseTcxXmlToRide(xmlText: string, fallbackTitle = 'Converted Indoor Ride'): SavedRide {
  if (typeof DOMParser === 'undefined') {
    throw new Error('TCX parsing requires a browser DOMParser environment.');
  }
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Could not parse .TCX file — invalid XML format.');
  }

  const allElements = Array.from(doc.getElementsByTagName('*'));
  const tpElements = allElements.filter(
    (el) => (el.localName || el.tagName.split(':').pop() || '').toLowerCase() === 'trackpoint'
  );

  if (tpElements.length === 0) {
    throw new Error('This .TCX file has no <Trackpoint> telemetry records.');
  }

  const activityEl = allElements.find(
    (el) => (el.localName || el.tagName.split(':').pop() || '').toLowerCase() === 'activity'
  );
  const lapEl = allElements.find(
    (el) => (el.localName || el.tagName.split(':').pop() || '').toLowerCase() === 'lap'
  );

  const trackPoints: TrackPoint[] = [];
  let firstTsMs = NaN;

  for (let i = 0; i < tpElements.length; i++) {
    const tp = tpElements[i];
    const timeStr = getChildTextByLocalName(tp, 'Time');
    const tsMs = timeStr ? Date.parse(timeStr) : NaN;
    if (Number.isNaN(firstTsMs) && !Number.isNaN(tsMs)) {
      firstTsMs = tsMs;
    }
    const resolvedTs = Number.isNaN(tsMs) ? (Number.isNaN(firstTsMs) ? Date.now() : firstTsMs) + i * 1000 : tsMs;
    const elapsedSec = Number.isNaN(firstTsMs) ? i : Math.max(0, Math.round((resolvedTs - firstTsMs) / 1000));

    const distanceMeters = Number(getChildTextByLocalName(tp, 'DistanceMeters')) || 0;
    const hrVal = Number(getChildTextByLocalName(tp, 'Value')) || 0;
    const cadenceRpm = Number(getChildTextByLocalName(tp, 'Cadence')) || 0;
    const speedMps = Number(getChildTextByLocalName(tp, 'Speed')) || 0;
    const powerWatts = Number(getChildTextByLocalName(tp, 'Watts')) || 0;

    trackPoints.push({
      timestampMs: resolvedTs,
      elapsedSec,
      powerWatts,
      cadenceRpm,
      resistance: 0,
      heartRateBpm: hrVal,
      speedMps,
      distanceMeters,
      caloriesKcal: 0,
      hrZone: 1,
      powerZone: 1,
    });
  }

  const idIso = activityEl ? getChildTextByLocalName(activityEl, 'Id') : null;
  const startedMs =
    idIso && !Number.isNaN(Date.parse(idIso))
      ? Date.parse(idIso)
      : trackPoints[0].timestampMs;
  const lastTpMs = trackPoints[trackPoints.length - 1].timestampMs;

  const lapDuration = lapEl ? Number(getChildTextByLocalName(lapEl, 'TotalTimeSeconds')) : NaN;
  const durationSec =
    Number.isFinite(lapDuration) && lapDuration > 0
      ? Math.round(lapDuration)
      : Math.max(1, Math.round((lastTpMs - startedMs) / 1000) || trackPoints.length);

  const lapDistance = lapEl ? Number(getChildTextByLocalName(lapEl, 'DistanceMeters')) : NaN;
  const maxTpDistance = trackPoints.reduce((m, p) => Math.max(m, p.distanceMeters), 0);
  const distanceMeters =
    Number.isFinite(lapDistance) && lapDistance > 0 ? lapDistance : maxTpDistance;

  const lapCalories = lapEl ? Number(getChildTextByLocalName(lapEl, 'Calories')) : NaN;
  const caloriesKcal = Number.isFinite(lapCalories) && lapCalories > 0 ? Math.round(lapCalories) : 0;

  const wattsArr = trackPoints.map((p) => p.powerWatts);
  const cadArr = trackPoints.map((p) => p.cadenceRpm);
  const hrArr = trackPoints.map((p) => p.heartRateBpm).filter((h) => h > 0);

  const avgWatts = Math.round(wattsArr.reduce((a, b) => a + b, 0) / wattsArr.length);
  const maxWatts = Math.max(...wattsArr, 0);
  const normalizedWatts = computeNormalizedPower(wattsArr);
  const avgCadence = Math.round(cadArr.reduce((a, b) => a + b, 0) / cadArr.length);
  const maxCadence = Math.max(...cadArr, 0);
  const avgHr = hrArr.length ? Math.round(hrArr.reduce((a, b) => a + b, 0) / hrArr.length) : 0;
  const maxHr = hrArr.length ? Math.max(...hrArr) : 0;

  const notes = activityEl ? getChildTextByLocalName(activityEl, 'Notes') ?? undefined : undefined;
  const cleanTitle = fallbackTitle.replace(/\.tcx$/i, '').trim() || 'Converted Indoor Ride';

  return {
    id: `tcx-conv-${Date.now()}`,
    title: cleanTitle,
    workoutName: cleanTitle,
    bikeLabel: 'Indoor Bike',
    startedAtIso: new Date(startedMs).toISOString(),
    endedAtIso: new Date(startedMs + durationSec * 1000).toISOString(),
    durationSec,
    distanceMeters,
    caloriesKcal,
    burnPoints: 0,
    avgWatts,
    maxWatts,
    normalizedWatts,
    avgWkg: computeWattsPerKg(avgWatts, DEFAULT_ATHLETE_PROFILE.weightLbs),
    avgCadence,
    maxCadence,
    avgResistance: 0,
    avgHr,
    maxHr,
    notes,
    athleteSnapshot: { ...DEFAULT_ATHLETE_PROFILE },
    hrZoneSeconds: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    powerZoneSeconds: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    trackPoints,
  };
}

export function convertTcxXmlToFitBytes(
  xmlText: string,
  presetId: FitDevicePresetId = 'edge-830',
  fallbackTitle?: string
): { bytes: Uint8Array; ride: SavedRide } {
  const ride = parseTcxXmlToRide(xmlText, fallbackTitle);
  const bytes = buildRideFitBytes(ride, presetId);
  return { bytes, ride };
}

export function downloadFitBytes(bytes: Uint8Array, filename: string): void {
  const safeName = filename.toLowerCase().endsWith('.fit') ? filename : `${filename}.fit`;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/vnd.ant.fit' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadRideFit(
  ride: SavedRide,
  presetId: FitDevicePresetId = 'edge-830'
): void {
  const bytes = buildRideFitBytes(ride, presetId);
  const datePart = ride.startedAtIso.slice(0, 10);
  const safeTitle = ride.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  downloadFitBytes(bytes, `jbf-${datePart}-${safeTitle || 'ride'}.fit`);
}
