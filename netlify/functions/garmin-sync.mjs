import { inflateRawSync } from 'node:zlib';
import {
  Garmin,
  GarminAuthError,
  GarminClient,
  GarminRateLimitError,
} from 'garminconnect-js';

const PERSONAL_API_BASE = 'https://personal.connectapi.garmin.com';
const MAX_FIT_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_FIT_UNCOMPRESSED_BYTES = 15 * 1024 * 1024;

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify(payload),
  };
}

function createMemoryBackedStore(initialTokens) {
  let current = initialTokens || null;
  return {
    getCurrent: () => current,
    store: {
      async load() {
        return current;
      },
      async save(tokens) {
        current = tokens;
      },
      async clear() {
        current = null;
      },
    },
  };
}

function extractActivityIdFromUploadResult(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const detailed = raw.detailedImportResult;
  if (detailed && typeof detailed === 'object') {
    const successes = Array.isArray(detailed.successes) ? detailed.successes : [];
    if (successes.length > 0 && typeof successes[0]?.internalId === 'number') {
      return successes[0].internalId;
    }
  }
  if (typeof raw.activityId === 'number') return raw.activityId;
  if (typeof raw.internalId === 'number') return raw.internalId;
  return undefined;
}

function normalizeTokenPayload(rawInput) {
  let parsed = rawInput;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return null;
    parsed = JSON.parse(trimmed);
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    parsed.tokens &&
    typeof parsed.tokens === 'object' &&
    !Array.isArray(parsed.tokens)
  ) {
    parsed = parsed.tokens;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    return null;
  }
  return parsed;
}

function extractPersonalApiBearerToken(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed.trim();
    if (parsed && typeof parsed === 'object') {
      const candidate =
        parsed.access_token || parsed.token || parsed.jwt || parsed.accessToken || '';
      return String(candidate).trim();
    }
  } catch {
    // Plain JWT or quoted string response
  }
  return trimmed.replace(/^["']|["']$/g, '').trim();
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchPersonalApiJson(path, bearerToken) {
  let resp = await fetch(`${PERSONAL_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/json',
    },
  });
  if (resp.status === 406) {
    resp = await fetch(`${PERSONAL_API_BASE}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: '*/*',
      },
    });
  }
  if (!resp.ok || resp.status === 204) return null;
  const text = await resp.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchPersonalApiBinary(path, bearerToken) {
  const resp = await fetch(`${PERSONAL_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/octet-stream, application/zip, */*',
    },
  });
  if (!resp.ok || resp.status === 204) return null;
  const contentLength = Number(resp.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_FIT_ARCHIVE_BYTES) {
    return null;
  }
  const ab = await resp.arrayBuffer();
  if (!ab || ab.byteLength === 0 || ab.byteLength > MAX_FIT_ARCHIVE_BYTES) {
    return null;
  }
  return Buffer.from(ab);
}

function toWeightKg(rawWeight) {
  const n = Number(rawWeight);
  if (!Number.isFinite(n) || n <= 0) return null;
  const kg = n > 1000 ? n / 1000 : n >= 25 && n <= 300 ? n : null;
  if (kg === null || kg < 30 || kg > 250) return null;
  return kg;
}

function weightKgToValidLbs(weightKg) {
  if (!Number.isFinite(weightKg)) return null;
  const lbs = Math.round(weightKg * 2.20462262);
  return lbs >= 70 && lbs <= 450 ? lbs : null;
}

function toValidBmi(rawBmi) {
  const n = Number(rawBmi);
  return Number.isFinite(n) && n >= 12 && n <= 65 ? n : null;
}

function heightCmToFeetInches(heightCm) {
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 240) return null;
  const totalInches = Math.round(heightCm / 2.54);
  return {
    heightFeet: Math.floor(totalInches / 12),
    heightInches: totalInches % 12,
  };
}

function heightCmFromWeightAndBmi(weightKg, bmi) {
  if (!weightKg || !bmi) return null;
  const heightCm = Math.sqrt(weightKg / bmi) * 100;
  return Number.isFinite(heightCm) && heightCm >= 100 && heightCm <= 240 ? heightCm : null;
}

function toValidFtp(rawFtp) {
  const n = Number(rawFtp);
  return Number.isFinite(n) && n >= 50 && n <= 600 ? Math.round(n) : null;
}

function parseGarminTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value.trim());
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function extractWeightAndBmiFromWeightRange(weightRange) {
  if (!weightRange || typeof weightRange !== 'object') {
    return { weightKg: null, bmiPair: null };
  }

  const orderedEntries = [];
  if (Array.isArray(weightRange.dailyWeightSummaries)) {
    for (const summary of weightRange.dailyWeightSummaries) {
      if (!summary || typeof summary !== 'object') continue;
      const summaryTs = parseGarminTimestampMs(summary.summaryDate);
      const candidates = [];
      if (summary.latestWeight && typeof summary.latestWeight === 'object') {
        candidates.push(summary.latestWeight);
      }
      if (Array.isArray(summary.allWeightMetrics)) {
        for (const metric of summary.allWeightMetrics) {
          if (metric && typeof metric === 'object') candidates.push(metric);
        }
      }
      for (const entry of candidates) {
        const weightKg = toWeightKg(entry.weight);
        if (!weightKg) continue;
        const ts =
          parseGarminTimestampMs(entry.timestampGMT) ||
          parseGarminTimestampMs(entry.date) ||
          parseGarminTimestampMs(entry.calendarDate) ||
          summaryTs;
        orderedEntries.push({
          ts,
          weightKg,
          bmi: toValidBmi(entry.bmi),
        });
      }
    }
    orderedEntries.sort((a, b) => b.ts - a.ts);
  }

  for (const fallback of [weightRange.previousDateWeight, weightRange.totalAverage]) {
    if (!fallback || typeof fallback !== 'object') continue;
    const weightKg = toWeightKg(fallback.weight);
    if (!weightKg) continue;
    orderedEntries.push({
      ts:
        parseGarminTimestampMs(fallback.timestampGMT) ||
        parseGarminTimestampMs(fallback.date) ||
        parseGarminTimestampMs(fallback.calendarDate) ||
        0,
      weightKg,
      bmi: toValidBmi(fallback.bmi),
    });
  }

  if (orderedEntries.length === 0) {
    return { weightKg: null, bmiPair: null };
  }

  const latestWeightKg = orderedEntries[0].weightKg;
  const matchedPair = orderedEntries.find((e) => e.bmi !== null) || null;
  return {
    weightKg: latestWeightKg,
    bmiPair: matchedPair ? { weightKg: matchedPair.weightKg, bmi: matchedPair.bmi } : null,
  };
}

function isCyclingActivity(act) {
  if (!act || typeof act !== 'object') return false;
  const typeKey = String(
    act.activityType?.typeKey || act.activityTypeDTO?.typeKey || ''
  ).toLowerCase();
  if (!typeKey) return false;
  return (
    typeKey.includes('cycling') ||
    typeKey.includes('biking') ||
    typeKey.includes('bike') ||
    typeKey === 'virtual_ride' ||
    typeKey === 'spin'
  );
}

function hasPowerMetrics(act) {
  if (!act || typeof act !== 'object') return false;
  return Boolean(
    Number(act.avgPower) > 0 ||
      Number(act.averagePower) > 0 ||
      Number(act.normPower) > 0 ||
      Number(act.normalizedPower) > 0 ||
      Number(act.maxPower) > 0 ||
      Number(act.maxFtp) > 0 ||
      Number(act.intensityFactor) > 0 ||
      Number(act.trainingStressScore) > 0
  );
}

function extractDirectFtpFromActivity(activity) {
  if (!activity || typeof activity !== 'object') return null;
  const summary = activity.summaryDTO && typeof activity.summaryDTO === 'object'
    ? activity.summaryDTO
    : null;
  const directCandidates = [
    summary?.functionalThresholdPower,
    summary?.directFunctionalThresholdPower,
    activity.functionalThresholdPower,
    activity.directFunctionalThresholdPower,
    activity.maxFtp,
    activity.thresholdPower,
  ];
  for (const val of directCandidates) {
    const ftp = toValidFtp(val);
    if (ftp) return ftp;
  }
  if (Array.isArray(activity.splitSummaries)) {
    for (const split of activity.splitSummaries) {
      if (!split || typeof split !== 'object') continue;
      const splitFtp =
        toValidFtp(split.functionalThresholdPower) ||
        toValidFtp(split.directFunctionalThresholdPower);
      if (splitFtp) return splitFtp;
    }
  }
  return null;
}

function extractDerivedFtpFromActivity(activity) {
  if (!activity || typeof activity !== 'object') return null;
  const summary = activity.summaryDTO && typeof activity.summaryDTO === 'object'
    ? activity.summaryDTO
    : null;
  const np = Number(summary?.normalizedPower ?? activity.normalizedPower ?? activity.normPower);
  if (!Number.isFinite(np) || np < 50 || np > 600) return null;

  const rawIf = Number(summary?.intensityFactor ?? activity.intensityFactor);
  if (Number.isFinite(rawIf) && rawIf > 0) {
    const ifRatio = rawIf > 2.5 ? rawIf / 100 : rawIf;
    if (ifRatio >= 0.25 && ifRatio <= 1.8) {
      const derived = toValidFtp(np / ifRatio);
      if (derived) return derived;
    }
  }

  const tss = Number(summary?.trainingStressScore ?? activity.trainingStressScore);
  const durationSec = Number(summary?.duration ?? activity.duration);
  if (
    Number.isFinite(tss) &&
    tss >= 5 &&
    Number.isFinite(durationSec) &&
    durationSec >= 300
  ) {
    const derived = toValidFtp(np * Math.sqrt(durationSec / (36 * tss)));
    if (derived) return derived;
  }

  return null;
}

/** Extract a .FIT binary payload from either a raw .FIT buffer or a Garmin activity ZIP archive. */
export function extractFitBytesFromArchive(rawBytes) {
  if (!rawBytes || rawBytes.length < 14) return null;
  const buf = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);

  if (buf.subarray(8, 12).toString('ascii') === '.FIT') {
    return buf;
  }

  // Locate ZIP End of Central Directory (0x06054b50) scanning backwards from the end.
  // Reading sizes from Central Directory handles Java ZipOutputStream data descriptors (bit 3).
  const minEocdOffset = Math.max(0, buf.length - 65557);
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= minEocdOffset; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const cdEntryCount = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  if (cdOffset >= buf.length) return null;

  let pos = cdOffset;
  let chosenEntry = null;
  for (let idx = 0; idx < cdEntryCount && pos + 46 <= buf.length; idx += 1) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    pos += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    const entry = { method, compressedSize, uncompressedSize, localHeaderOffset, name };
    if (name.toLowerCase().endsWith('.fit')) {
      chosenEntry = entry;
      break;
    }
    if (!chosenEntry) chosenEntry = entry;
  }

  if (!chosenEntry) return null;
  if (chosenEntry.uncompressedSize > MAX_FIT_UNCOMPRESSED_BYTES) return null;

  const lh = chosenEntry.localHeaderOffset;
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) return null;
  const lhNameLen = buf.readUInt16LE(lh + 26);
  const lhExtraLen = buf.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + lhNameLen + lhExtraLen;
  const dataEnd = dataStart + chosenEntry.compressedSize;
  if (dataEnd > buf.length) return null;

  const compressed = buf.subarray(dataStart, dataEnd);
  if (chosenEntry.method === 0) return compressed;
  if (chosenEntry.method === 8) {
    try {
      const inflated = inflateRawSync(compressed, { maxOutputLength: MAX_FIT_UNCOMPRESSED_BYTES });
      return inflated.length >= 14 && inflated.subarray(8, 12).toString('ascii') === '.FIT'
        ? inflated
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Lightweight zero-dependency Garmin .FIT binary scanner for athlete biometrics.
 * Extracts height/weight/HR/FTP from user_profile (msg 3), zones_target (msg 7),
 * session (msg 18), and Garmin watch user_data (msg 79).
 */
export function parseFitBiometrics(rawBytes, options = {}) {
  const allowFtp = Boolean(options.allowFtp);
  const fitBuf = extractFitBytesFromArchive(rawBytes);
  const result = {};
  if (!fitBuf || fitBuf.length < 14) return result;

  const readUint = (pos, size, littleEndian) => {
    if (size === 1) return fitBuf.readUInt8(pos);
    if (size === 2) return littleEndian ? fitBuf.readUInt16LE(pos) : fitBuf.readUInt16BE(pos);
    if (size === 4) return littleEndian ? fitBuf.readUInt32LE(pos) : fitBuf.readUInt32BE(pos);
    return null;
  };

  let offset = 0;
  while (offset + 14 <= fitBuf.length) {
    const headerSize = fitBuf.readUInt8(offset);
    if (headerSize < 12 || offset + headerSize > fitBuf.length) break;
    if (fitBuf.subarray(offset + 8, offset + 12).toString('ascii') !== '.FIT') break;
    const dataSize = fitBuf.readUInt32LE(offset + 4);
    const dataStart = offset + headerSize;
    const dataEnd = Math.min(fitBuf.length, dataStart + dataSize);
    if (dataSize === 0 || dataStart >= dataEnd) break;

    const localDefs = new Map();
    let pos = dataStart;

    while (pos < dataEnd) {
      const recordHeader = fitBuf.readUInt8(pos);
      pos += 1;

      if ((recordHeader & 0x80) !== 0) {
        // Compressed timestamp header message
        const localNum = (recordHeader >> 5) & 0x03;
        const def = localDefs.get(localNum);
        if (!def || pos + def.recordSize > dataEnd) break;
        pos += def.recordSize;
        continue;
      }

      if ((recordHeader & 0x40) !== 0) {
        // Definition message
        if (pos + 5 > dataEnd) break;
        const localNum = recordHeader & 0x0f;
        const hasDevData = (recordHeader & 0x20) !== 0;
        const arch = fitBuf.readUInt8(pos + 1);
        const littleEndian = arch === 0;
        const globalMsgNum = littleEndian
          ? fitBuf.readUInt16LE(pos + 2)
          : fitBuf.readUInt16BE(pos + 2);
        const numFields = fitBuf.readUInt8(pos + 4);
        pos += 5;
        if (pos + numFields * 3 > dataEnd) break;

        const fields = [];
        let fieldOffset = 0;
        for (let f = 0; f < numFields; f += 1) {
          const fieldNum = fitBuf.readUInt8(pos);
          const size = fitBuf.readUInt8(pos + 1);
          const baseType = fitBuf.readUInt8(pos + 2);
          fields.push({ fieldNum, size, baseType, offset: fieldOffset });
          fieldOffset += size;
          pos += 3;
        }

        let devBytes = 0;
        if (hasDevData) {
          if (pos >= dataEnd) break;
          const numDevFields = fitBuf.readUInt8(pos);
          pos += 1;
          if (pos + numDevFields * 3 > dataEnd) break;
          for (let d = 0; d < numDevFields; d += 1) {
            devBytes += fitBuf.readUInt8(pos + 1);
            pos += 3;
          }
        }

        localDefs.set(localNum, {
          globalMsgNum,
          littleEndian,
          fields,
          recordSize: fieldOffset + devBytes,
        });
        continue;
      }

      // Normal data message
      const localNum = recordHeader & 0x0f;
      const def = localDefs.get(localNum);
      if (!def || pos + def.recordSize > dataEnd) break;

      const msgNum = def.globalMsgNum;
      if (msgNum === 3 || msgNum === 7 || msgNum === 18 || msgNum === 79) {
        let sessionNp = null;
        let sessionIf = null;
        for (const field of def.fields) {
          if (field.size !== 1 && field.size !== 2) continue;
          const rawVal = readUint(pos + field.offset, field.size, def.littleEndian);
          if (rawVal === null) continue;
          if ((field.size === 1 && rawVal === 0xff) || (field.size === 2 && rawVal === 0xffff)) {
            continue;
          }

          if (msgNum === 3) {
            // user_profile: field 3 height (cm), field 4 weight (0.1 kg), field 8 RHR, field 10/11 Max HR
            if (field.fieldNum === 3 && rawVal >= 100 && rawVal <= 240 && !result.heightCm) {
              result.heightCm = rawVal;
            } else if (field.fieldNum === 4 && rawVal >= 250 && rawVal <= 3000 && !result.weightKg) {
              result.weightKg = rawVal / 10;
            } else if (field.fieldNum === 8 && rawVal >= 25 && rawVal <= 130 && !result.restingHrBpm) {
              result.restingHrBpm = rawVal;
            } else if (
              (field.fieldNum === 10 || field.fieldNum === 11) &&
              rawVal >= 120 &&
              rawVal <= 230 &&
              !result.maxHrBpm
            ) {
              result.maxHrBpm = rawVal;
            }
          } else if (msgNum === 79) {
            // Garmin watch user_data: field 2 height (cm), field 3 weight (0.1 kg), field 6 max_hr
            if (field.fieldNum === 2 && rawVal >= 100 && rawVal <= 240 && !result.heightCm) {
              result.heightCm = rawVal;
            } else if (field.fieldNum === 3 && rawVal >= 250 && rawVal <= 3000 && !result.weightKg) {
              result.weightKg = rawVal / 10;
            } else if (field.fieldNum === 6 && rawVal >= 120 && rawVal <= 230 && !result.maxHrBpm) {
              result.maxHrBpm = rawVal;
            }
          } else if (msgNum === 7) {
            // zones_target: field 1 max_heart_rate, field 3 functional_threshold_power
            if (field.fieldNum === 1 && rawVal >= 120 && rawVal <= 230 && !result.maxHrBpm) {
              result.maxHrBpm = rawVal;
            } else if (
              allowFtp &&
              field.fieldNum === 3 &&
              rawVal >= 50 &&
              rawVal <= 600 &&
              !result.ftpWatts
            ) {
              result.ftpWatts = rawVal;
            }
          } else if (msgNum === 18 && allowFtp) {
            // session: field 45 threshold_power, field 34 normalized_power, field 36 intensity_factor (/1000)
            if (field.fieldNum === 45 && rawVal >= 50 && rawVal <= 600 && !result.ftpWatts) {
              result.ftpWatts = rawVal;
            } else if (field.fieldNum === 34 && rawVal >= 50 && rawVal <= 600) {
              sessionNp = rawVal;
            } else if (field.fieldNum === 36 && rawVal >= 250 && rawVal <= 1800) {
              sessionIf = rawVal / 1000;
            }
          }
        }
        if (allowFtp && !result.ftpWatts && sessionNp && sessionIf) {
          const derived = toValidFtp(sessionNp / sessionIf);
          if (derived) result.ftpWatts = derived;
        }
      }

      pos += def.recordSize;
    }

    // Advance past trailing 2-byte FIT CRC to support chained FIT files
    offset = dataStart + dataSize + 2;
  }

  return result;
}

function buildImportedProfileFromPersonalApi(
  settings,
  hrZonesRaw,
  { weightRange = null, fitnessAge = null, cyclingActivities = [], activityDetails = [], fitBiometrics = null } = {}
) {
  const imported = {};
  const userData =
    settings && typeof settings === 'object' && settings.userData && typeof settings.userData === 'object'
      ? settings.userData
      : settings || {};

  // 1. Weight (settings.userData -> official weight-service/weight/range -> FIT fallback)
  let weightKg = toWeightKg(userData.weight);
  const { weightKg: rangeWeightKg, bmiPair } = extractWeightAndBmiFromWeightRange(weightRange);
  if (!weightKg && rangeWeightKg) {
    weightKg = rangeWeightKg;
  }
  if (!weightKg && fitBiometrics?.weightKg) {
    weightKg = toWeightKg(fitBiometrics.weightKg);
  }
  const weightLbs = weightKgToValidLbs(weightKg);
  if (weightLbs !== null) {
    imported.weightLbs = weightLbs;
  }

  // 2. Height (settings.userData -> weight+BMI from weight-service -> weight+BMI from fitnessage -> FIT fallback)
  const rawHeight = Number(userData.height);
  let heightImperial = heightCmToFeetInches(rawHeight);
  if (!heightImperial && bmiPair) {
    heightImperial = heightCmToFeetInches(
      heightCmFromWeightAndBmi(bmiPair.weightKg, bmiPair.bmi)
    );
  }
  if (!heightImperial && weightKg && fitnessAge && typeof fitnessAge === 'object') {
    const fitnessAgeBmi = toValidBmi(
      fitnessAge.components?.bmi?.value ?? fitnessAge.components?.BMI?.value
    );
    if (fitnessAgeBmi) {
      heightImperial = heightCmToFeetInches(heightCmFromWeightAndBmi(weightKg, fitnessAgeBmi));
    }
  }
  if (!heightImperial && fitBiometrics?.heightCm) {
    heightImperial = heightCmToFeetInches(fitBiometrics.heightCm);
  }
  if (heightImperial) {
    imported.heightFeet = heightImperial.heightFeet;
    imported.heightInches = heightImperial.heightInches;
  }

  // 3. Max HR & Resting HR (settings.userData -> heartRateZones/v2 -> fitnessage -> FIT fallback)
  const rawMaxHr = Number(userData.maxHeartRate);
  if (Number.isFinite(rawMaxHr) && rawMaxHr >= 120 && rawMaxHr <= 230) {
    imported.maxHrBpm = Math.round(rawMaxHr);
  }

  const rawRestingHr = Number(
    userData.restingHeartRate ?? userData.minHeartRate ?? settings?.restingHeartRate
  );
  if (Number.isFinite(rawRestingHr) && rawRestingHr >= 25 && rawRestingHr <= 130) {
    imported.restingHrBpm = Math.round(rawRestingHr);
  }

  const zoneEntry = Array.isArray(hrZonesRaw)
    ? hrZonesRaw.find((z) => z?.sport === 'CYCLING') ||
      hrZonesRaw.find((z) => z?.sport === 'DEFAULT') ||
      hrZonesRaw[0]
    : hrZonesRaw;

  if (zoneEntry && typeof zoneEntry === 'object') {
    if (!imported.maxHrBpm) {
      const zoneMax = Number(zoneEntry.maxHeartRateUsed ?? zoneEntry.zone5Ceiling);
      if (Number.isFinite(zoneMax) && zoneMax >= 120 && zoneMax <= 230) {
        imported.maxHrBpm = Math.round(zoneMax);
      }
    }
    if (!imported.restingHrBpm) {
      const zoneRest = Number(zoneEntry.restingHeartRateUsed);
      if (Number.isFinite(zoneRest) && zoneRest >= 25 && zoneRest <= 130) {
        imported.restingHrBpm = Math.round(zoneRest);
      }
    }
  }

  if (!imported.restingHrBpm && fitnessAge && typeof fitnessAge === 'object') {
    const fitnessAgeRhr = Number(
      fitnessAge.components?.rhr?.value ?? fitnessAge.components?.RHR?.value
    );
    if (Number.isFinite(fitnessAgeRhr) && fitnessAgeRhr >= 25 && fitnessAgeRhr <= 130) {
      imported.restingHrBpm = Math.round(fitnessAgeRhr);
    }
  }

  if (!imported.maxHrBpm && fitBiometrics?.maxHrBpm) {
    imported.maxHrBpm = Math.round(fitBiometrics.maxHrBpm);
  }
  if (!imported.restingHrBpm && fitBiometrics?.restingHrBpm) {
    imported.restingHrBpm = Math.round(fitBiometrics.restingHrBpm);
  }

  // 4. Cycling FTP (settings.userData -> direct FTP in activity details/list -> derived NP/IF or TSS -> FIT fallback)
  let ftpWatts = toValidFtp(
    userData.cyclingFtp ??
      userData.ftp ??
      userData.functionalThresholdPower ??
      settings?.cyclingFtp ??
      settings?.ftp
  );
  if (!ftpWatts) {
    for (const detail of activityDetails) {
      const found = extractDirectFtpFromActivity(detail);
      if (found) {
        ftpWatts = found;
        break;
      }
    }
  }
  if (!ftpWatts) {
    for (const act of cyclingActivities) {
      const found = extractDirectFtpFromActivity(act);
      if (found) {
        ftpWatts = found;
        break;
      }
    }
  }
  if (!ftpWatts && fitBiometrics?.ftpWatts) {
    ftpWatts = toValidFtp(fitBiometrics.ftpWatts);
  }
  if (!ftpWatts) {
    for (const detail of activityDetails) {
      const derived = extractDerivedFtpFromActivity(detail);
      if (derived) {
        ftpWatts = derived;
        break;
      }
    }
  }
  if (!ftpWatts) {
    for (const act of cyclingActivities) {
      const derived = extractDerivedFtpFromActivity(act);
      if (derived) {
        ftpWatts = derived;
        break;
      }
    }
  }
  if (ftpWatts) {
    imported.ftpWatts = ftpWatts;
  }

  return imported;
}

function mapPersonalApiActivities(rawActivities) {
  if (!Array.isArray(rawActivities)) return [];
  return rawActivities
    .filter((item) => item && typeof item.activityId === 'number')
    .slice(0, 10)
    .map((item) => {
      const avgPower = item.avgPower ?? item.averagePower;
      const normPower = item.normPower ?? item.normalizedPower;
      return {
        activityId: item.activityId,
        name: item.activityName || 'Garmin Workout',
        typeKey: item.activityType?.typeKey || item.activityTypeDTO?.typeKey || 'cycling',
        startedAtLocal: item.startTimeLocal || item.startTimeGMT || '',
        durationSec: Math.round(Number(item.duration) || 0),
        distanceMeters: Number(item.distance) || 0,
        caloriesKcal: Math.round(Number(item.calories) || 0),
        avgWatts: avgPower ? Math.round(Number(avgPower)) : undefined,
        normalizedWatts: normPower ? Math.round(Number(normPower)) : undefined,
        avgHr: item.averageHR ? Math.round(Number(item.averageHR)) : undefined,
        maxHr: item.maxHR ? Math.round(Number(item.maxHR)) : undefined,
      };
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(event) {
  if (event.httpMethod === 'GET') {
    // Personal Garmin credentials are never read from server env vars (public endpoint);
    // each visitor supplies their own per request.
    return jsonResponse(200, {
      ok: true,
      hasServerCredentials: false,
      hasServerPersonalApiKey: false,
    });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const action = payload.action;

    if (action === 'login') {
      const email = (payload.email || '').trim();
      const password = payload.password || '';

      if (!email || !password) {
        return jsonResponse(400, {
          error: 'Enter your Garmin Connect email and password to sign in.',
        });
      }

      const { getCurrent, store } = createMemoryBackedStore(null);
      const client = new GarminClient({ tokenStore: store });
      const loginResult = await client.login(email, password);

      if (loginResult && loginResult.state === 'mfa_required') {
        return jsonResponse(200, {
          ok: true,
          mfaRequired: true,
          mfaMethod: loginResult.mfaState?.mfaMethod || 'code',
          mfaState: loginResult.mfaState,
        });
      }

      const garmin = new Garmin(client);
      let athleteName = email;
      try {
        const full = await garmin.fullName();
        if (full) athleteName = full;
      } catch {
        // Optional profile lookup
      }

      return jsonResponse(200, {
        ok: true,
        connected: true,
        athleteName,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    if (action === 'mfa') {
      const { mfaState, code, email } = payload;
      if (!mfaState || !code) {
        return jsonResponse(400, {
          error: 'Missing Garmin verification code or session state.',
        });
      }

      const { getCurrent, store } = createMemoryBackedStore(null);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 0 });
      await client.resumeLogin(mfaState, String(code).trim());

      const garmin = new Garmin(client);
      let athleteName = email || 'Garmin Athlete';
      try {
        const full = await garmin.fullName();
        if (full) athleteName = full;
      } catch {
        // Optional profile lookup
      }

      return jsonResponse(200, {
        ok: true,
        connected: true,
        athleteName,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    if (action === 'verify_tokens') {
      let normalizedTokens;
      try {
        normalizedTokens = normalizeTokenPayload(payload.tokens);
      } catch {
        return jsonResponse(400, {
          error: 'Invalid Garmin session token JSON format.',
        });
      }

      if (!normalizedTokens) {
        return jsonResponse(400, {
          error: 'Paste valid Garmin OAuth session token JSON.',
        });
      }

      const { getCurrent, store } = createMemoryBackedStore(normalizedTokens);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 0 });
      const loaded = await client.loadTokens();
      if (!loaded) {
        return jsonResponse(400, {
          error: 'Invalid or expired Garmin session token JSON.',
        });
      }

      const garmin = new Garmin(client);
      let athleteName = (payload.email || '').trim() || 'Garmin Athlete';
      try {
        const full = await garmin.fullName();
        if (full) athleteName = full;
      } catch (err) {
        if (err instanceof GarminAuthError) throw err;
      }

      return jsonResponse(200, {
        ok: true,
        connected: true,
        athleteName,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    if (action === 'personal_api_sync') {
      const apiKey = String(payload.apiKey || '').trim();
      if (!apiKey) {
        return jsonResponse(400, {
          error: 'Enter your Garmin Personal API Key (GCDC_...).',
        });
      }

      const tokenResp = await fetch(
        `${PERSONAL_API_BASE}/personalapitoken-service/personal-api/personal-api-key/token`,
        {
          method: 'POST',
          headers: {
            Authorization: `ApiKey ${apiKey}`,
            Accept: 'application/json, text/plain, */*',
          },
        }
      );

      if (!tokenResp.ok) {
        const status = tokenResp.status === 401 || tokenResp.status === 403 ? 401 : 502;
        return jsonResponse(status, {
          error:
            'Garmin Personal API key was rejected or expired. Check your GCDC_ key under Garmin Connect -> Profile & Account -> Settings -> Personal API Key.',
        });
      }

      const rawTokenText = await tokenResp.text();
      const bearerToken = extractPersonalApiBearerToken(rawTokenText);
      if (!bearerToken) {
        return jsonResponse(502, {
          error: 'Garmin Personal API did not return a Bearer token.',
        });
      }

      const now = new Date();
      const todayIso = formatUtcDate(now);
      const thirtyDaysAgoIso = formatUtcDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

      // Layer 1: Official Garmin Connect Personal API JSON endpoints
      const [
        settingsResult,
        hrZonesResult,
        weightRangeResult,
        fitnessAgeResult,
        activitiesResult,
        cyclingActivitiesResult,
      ] = await Promise.allSettled([
        fetchPersonalApiJson('/userprofile-service/userprofile/settings', bearerToken),
        fetchPersonalApiJson('/biometric-service/heartRateZones/v2', bearerToken),
        fetchPersonalApiJson(
          `/weight-service/weight/range/${thirtyDaysAgoIso}/${todayIso}?includeAll=true`,
          bearerToken
        ),
        fetchPersonalApiJson(`/fitnessage-service/fitnessage/v2/${todayIso}`, bearerToken),
        fetchPersonalApiJson(
          '/activitylist-service/activities/search/activities?start=0&limit=10',
          bearerToken
        ),
        fetchPersonalApiJson(
          '/activitylist-service/activities/search/activities?start=0&limit=10&activityType=cycling',
          bearerToken
        ),
      ]);

      const val = (r) => (r.status === 'fulfilled' ? r.value : null);
      const settings = val(settingsResult);
      const hrZones = val(hrZonesResult);
      const weightRange = val(weightRangeResult);
      const fitnessAge = val(fitnessAgeResult);
      const rawActivities = val(activitiesResult);
      const rawCyclingActivities = val(cyclingActivitiesResult);

      const recentActivityList = Array.isArray(rawActivities) ? rawActivities : [];
      const seenCyclingIds = new Set();
      const cyclingActivities = [];
      for (const act of [
        ...(Array.isArray(rawCyclingActivities) ? rawCyclingActivities : []),
        ...recentActivityList.filter((a) => isCyclingActivity(a)),
      ]) {
        if (!act || typeof act.activityId !== 'number' || seenCyclingIds.has(act.activityId)) {
          continue;
        }
        seenCyclingIds.add(act.activityId);
        cyclingActivities.push(act);
      }

      // Layer 2: Fetch full ActivitySummaryDTO for up to 3 recent cycling rides when direct FTP is not yet known
      const settingsUserData =
        settings && typeof settings === 'object' && settings.userData && typeof settings.userData === 'object'
          ? settings.userData
          : settings || {};
      const hasDirectFtp = Boolean(
        toValidFtp(
          settingsUserData.cyclingFtp ??
            settingsUserData.ftp ??
            settingsUserData.functionalThresholdPower ??
            settings?.cyclingFtp ??
            settings?.ftp
        ) || cyclingActivities.some((act) => extractDirectFtpFromActivity(act))
      );

      let activityDetails = [];
      if (!hasDirectFtp && cyclingActivities.length > 0) {
        const powerCycling = cyclingActivities.filter((act) => hasPowerMetrics(act));
        const detailCandidates = [
          ...powerCycling,
          ...cyclingActivities.filter((act) => !hasPowerMetrics(act)),
        ].slice(0, 3);
        const detailResults = await Promise.allSettled(
          detailCandidates.map((act) =>
            fetchPersonalApiJson(`/activity-service/activity/${act.activityId}`, bearerToken)
          )
        );
        activityDetails = detailResults.map(val).filter(Boolean);
      }

      let importedProfile = buildImportedProfileFromPersonalApi(settings, hrZones, {
        weightRange,
        fitnessAge,
        cyclingActivities,
        activityDetails,
      });

      // Layer 3: Fallback to official .FIT activity file download ONLY if weight, height, or FTP is still missing.
      // Garmin watch .FIT files often carry user_data (msg 79: height/weight), user_profile (msg 3),
      // and zones_target (msg 7: functional_threshold_power).
      const needsWeightOrHeight =
        importedProfile.weightLbs === undefined || importedProfile.heightFeet === undefined;
      const needsFtp = importedProfile.ftpWatts === undefined;
      if (needsWeightOrHeight || needsFtp) {
        const fitCandidates = [];
        const seenFitIds = new Set();
        const addFitCandidate = (act, allowFtp) => {
          if (
            !act ||
            typeof act.activityId !== 'number' ||
            act.manualActivity ||
            act.isManualActivity ||
            seenFitIds.has(act.activityId)
          ) {
            return;
          }
          seenFitIds.add(act.activityId);
          fitCandidates.push({ activityId: act.activityId, allowFtp });
        };

        if (needsFtp) {
          const topPowerRides = cyclingActivities.filter((a) => hasPowerMetrics(a));
          for (const ride of [...topPowerRides, ...cyclingActivities]) {
            if (fitCandidates.length >= 2) break;
            addFitCandidate(ride, true);
          }
        }
        if (needsWeightOrHeight) {
          const latestNonCycling = recentActivityList.find(
            (a) =>
              a &&
              typeof a.activityId === 'number' &&
              !a.manualActivity &&
              !a.isManualActivity &&
              !isCyclingActivity(a)
          );
          if (latestNonCycling && fitCandidates.length < 3) {
            addFitCandidate(latestNonCycling, false);
          }
          for (const act of recentActivityList) {
            if (fitCandidates.length >= 3) break;
            addFitCandidate(act, isCyclingActivity(act));
          }
        }

        if (fitCandidates.length > 0) {
          const fitResults = await Promise.allSettled(
            fitCandidates.slice(0, 3).map(async (cand) => {
              const rawBytes = await fetchPersonalApiBinary(
                `/download-service/files/activity/${cand.activityId}`,
                bearerToken
              );
              if (!rawBytes) return null;
              return parseFitBiometrics(rawBytes, { allowFtp: cand.allowFtp });
            })
          );
          const mergedFit = {};
          for (const res of fitResults) {
            const parsed = val(res);
            if (!parsed) continue;
            if (!mergedFit.weightKg && parsed.weightKg) mergedFit.weightKg = parsed.weightKg;
            if (!mergedFit.heightCm && parsed.heightCm) mergedFit.heightCm = parsed.heightCm;
            if (!mergedFit.ftpWatts && parsed.ftpWatts) mergedFit.ftpWatts = parsed.ftpWatts;
            if (!mergedFit.maxHrBpm && parsed.maxHrBpm) mergedFit.maxHrBpm = parsed.maxHrBpm;
            if (!mergedFit.restingHrBpm && parsed.restingHrBpm) {
              mergedFit.restingHrBpm = parsed.restingHrBpm;
            }
          }
          if (Object.keys(mergedFit).length > 0) {
            importedProfile = buildImportedProfileFromPersonalApi(settings, hrZones, {
              weightRange,
              fitnessAge,
              cyclingActivities,
              activityDetails,
              fitBiometrics: mergedFit,
            });
          }
        }
      }

      const recentActivities = mapPersonalApiActivities(recentActivityList);
      const isUuid = (v) =>
        typeof v === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
      const pickName = (...candidates) =>
        candidates.find((c) => typeof c === 'string' && c.trim().length > 0 && !isUuid(c)) ||
        'Garmin Athlete';
      const athleteName = pickName(
        settings?.displayName,
        settings?.userName,
        recentActivityList[0]?.ownerFullName,
        cyclingActivities[0]?.ownerFullName,
        recentActivityList[0]?.ownerDisplayName,
        cyclingActivities[0]?.ownerDisplayName
      );

      return jsonResponse(200, {
        ok: true,
        athleteName,
        importedProfile,
        recentActivities,
      });
    }

    if (action === 'upload') {
      const { tokens, tcxXml, filename, title, description, uploadMode, startedAtIso } = payload;

      if (!tcxXml) {
        return jsonResponse(400, { error: 'Missing TCX workout payload.' });
      }

      const { getCurrent, store } = createMemoryBackedStore(tokens || null);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 0 });

      const hasValidSession = await client.loadTokens();
      if (!hasValidSession) {
        return jsonResponse(401, {
          error: 'Garmin Connect is not signed in yet. Open Garmin Settings to connect.',
        });
      }

      const garmin = new Garmin(client);
      const safeName =
        typeof filename === 'string' && filename.endsWith('.tcx')
          ? filename
          : `jbf-ride-${Date.now()}.tcx`;
      const blob = new Blob([tcxXml], { type: 'application/vnd.garmin.tcx+xml' });

      // 'import' avoids Garmin auto-forwarding a duplicate to Strava when pushing to both!
      // 'device' uses Garmin's standard device upload endpoint.
      const rawUpload =
        uploadMode === 'import'
          ? await garmin.importActivity(blob, safeName)
          : await garmin.uploadActivity(blob, safeName);

      let activityId = extractActivityIdFromUploadResult(rawUpload);

      if (!activityId) {
        const rideStartMs = startedAtIso ? Date.parse(startedAtIso) : NaN;
        for (const waitMs of [1800, 2400]) {
          await sleep(waitMs);
          try {
            const latest = await garmin.getLastActivity();
            if (latest && typeof latest.activityId === 'number') {
              const latestStartGmt = latest.startTimeGMT
                ? Date.parse(`${latest.startTimeGMT.replace(' ', 'T')}Z`)
                : NaN;
              if (
                Number.isNaN(rideStartMs) ||
                Number.isNaN(latestStartGmt) ||
                Math.abs(latestStartGmt - rideStartMs) < 15 * 60 * 1000
              ) {
                activityId = latest.activityId;
                break;
              }
            }
          } catch {
            // Ignore polling hiccup
          }
        }
      }

      if (activityId) {
        if (title) {
          try {
            await garmin.setActivityName(activityId, String(title));
          } catch {
            // Non-fatal if Garmin is still indexing metadata
          }
        }
        if (description) {
          try {
            await garmin.setActivityDescription(activityId, String(description));
          } catch {
            // Non-fatal if Garmin is still indexing metadata
          }
        }
      }

      return jsonResponse(200, {
        ok: true,
        activityId,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    if (action === 'update_meta') {
      const { tokens, activityId, title, description } = payload;
      if (!activityId) {
        return jsonResponse(400, { error: 'Missing Garmin activityId.' });
      }
      const { getCurrent, store } = createMemoryBackedStore(tokens || null);
      const client = new GarminClient({ tokenStore: store, loginDelayMs: 0 });
      if (!(await client.loadTokens())) {
        return jsonResponse(401, { error: 'Garmin session expired. Please reconnect Garmin.' });
      }
      const garmin = new Garmin(client);
      if (title) await garmin.setActivityName(activityId, String(title));
      if (description !== undefined) {
        await garmin.setActivityDescription(activityId, String(description));
      }
      return jsonResponse(200, {
        ok: true,
        tokens: getCurrent() || client.getTokens(),
      });
    }

    return jsonResponse(400, { error: `Unknown Garmin action: ${String(action)}` });
  } catch (err) {
    if (err instanceof GarminAuthError) {
      return jsonResponse(401, {
        error: `Garmin authentication failed: ${err.message}`,
      });
    }
    if (err instanceof GarminRateLimitError) {
      return jsonResponse(429, {
        error:
          'Garmin SSO is temporarily rate-limiting logins from shared cloud IPs (30-60 min cooldown). Pause password retries and either paste a local Session Token (run `npm run garmin:token` on your computer) for ride uploads, or use your Garmin Personal API Key (GCDC_) for profile & history sync.',
      });
    }
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : 'Garmin Connect sync failed.',
    });
  }
}
