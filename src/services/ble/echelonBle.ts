import type { BikeFamilyId, BikeUnlockStatus, SportMode } from '../../types/fitness';
import { getBluetoothUnsupportedMessage } from '../../utils/browserSupport';
import {
  rowingSplitSecPer500mToWatts,
  rowingSplitToSpeedMps,
  rowingWattsToSplitSecPer500m,
} from '../../utils/zones';
import { isBleTransportSupported, requestBleDevice } from './bleTransport';

export const ECHELON_ADV_SERVICE = '0bf669f0-45f2-11e7-9598-0800200c9a66';
export const ECHELON_COMM_SERVICE = '0bf669f1-45f2-11e7-9598-0800200c9a66';
export const ECHELON_WRITE_CHAR = '0bf669f2-45f2-11e7-9598-0800200c9a66';
export const ECHELON_NOTIFY_1_CHAR = '0bf669f3-45f2-11e7-9598-0800200c9a66';
export const ECHELON_NOTIFY_2_CHAR = '0bf669f4-45f2-11e7-9598-0800200c9a66';

export const ECHELON_ACTIVATION_FRAME = new Uint8Array([0xf0, 0xb0, 0x01, 0x01, 0xa2]);
export const ECHELON_UNLOCK_ACK_FRAME = new Uint8Array([0xf0, 0xa5, 0x01, 0x0e, 0xa4]);

export const FTMS_SERVICE = 0x1826;
export const FTMS_TREADMILL_DATA = 0x2acd;
export const FTMS_ROWER_DATA = 0x2ad1;
export const FTMS_INDOOR_BIKE_DATA = 0x2ad2;
export const FTMS_CONTROL_POINT = 0x2ad9;
export const CYCLING_POWER_SERVICE = 0x1818;
export const CYCLING_POWER_MEASUREMENT = 0x2a63;
export const CYCLING_SPEED_CADENCE_SERVICE = 0x1816;
export const CSC_MEASUREMENT = 0x2a5b;
export const RUNNING_SPEED_CADENCE_SERVICE = 0x1814;
export const RSC_MEASUREMENT = 0x2a53;

const COMMON_BIKE_NAME_PREFIXES = [
  'ECH',
  'Echelon',
  'IC Bike',
  'Schwinn',
  'Bowflex',
  'YESOUL',
  'Yesoul',
  'MERACH',
  'Merach',
  'MRK',
  'Domyos',
  'Keiser',
  'M3',
  'Stages',
  'Wattbike',
  'BikeErg',
  'RowErg',
  'Concept2',
  'PM5',
  'WaterRower',
  'SmartRow',
  'Fluid',
  'Rower',
  'ROW',
  'Hydrow',
  'Aviron',
  'RP3',
  'Ergatta',
  'Sole',
  'SOLE',
  'Horizon',
  'NordicTrack',
  'ProForm',
  'Matrix',
  'Technogym',
  'Woodway',
  'WalkingPad',
  'NoblePro',
  'Assault',
  'Tread',
  'Stryd',
  'Runn',
  'RUNN',
  'RunPod',
  'RENPHO',
  'Zycle',
  'Joroto',
  'KICKR',
  'Wahoo',
  'Tacx',
  'Saris',
  'Elite',
  'Zwift',
  'JetBlack',
  'Assioma',
  'Rally',
  'Vector',
  '4iiii',
  'Quarq',
  'Magene',
  'Coospo',
];

export type BikeProtocolKind =
  | 'echelon'
  | 'ftms'
  | 'ftms-treadmill'
  | 'ftms-rower'
  | 'cps'
  | 'csc'
  | 'rsc';
export type EchelonUnlockStatus = BikeUnlockStatus;
export type EchelonUnlockError =
  | 'invalid-length'
  | 'invalid-prefix'
  | 'invalid-decimal-prefix'
  | 'zero-divisor'
  | 'result-out-of-range';

export interface EchelonUnlockResult {
  response: Uint8Array | null;
  authValue: number | null;
  error: EchelonUnlockError | null;
}

export interface BikeModelProfile {
  family: BikeFamilyId;
  protocol: BikeProtocolKind;
  sport: SportMode;
  shortLabel: string;
  displayName: string;
  hasMotorizedResistance: boolean;
  hasMotorizedSpeed?: boolean;
  hasMotorizedIncline?: boolean;
  hasBuiltInScreen?: boolean;
  recommendedCurve: 'ex3-vector' | 'sport-compact';
}

export interface CrankSample {
  revs: number;
  time1024: number;
}

export interface EchelonRawReading {
  cadenceRpm: number;
  resistance: number;
  directWatts?: number;
  maxResistance?: number;
  sport?: SportMode;
  /** Direct machine speed in meters/sec (FTMS Treadmill, FTMS Rower, RSC Footpod). */
  directSpeedMps?: number;
  /** Live treadmill incline grade (%) from FTMS Treadmill Data (0x2ACD). */
  inclinePct?: number;
  /** Live rowing split pace (seconds per 500m) from FTMS Rower Data (0x2AD1). */
  paceSecPer500m?: number;
  /** Cumulative stroke count from FTMS Rower Data (0x2AD1). */
  strokeCount?: number;
  /** Cumulative machine distance in meters when reported by FTMS/RSC. */
  deviceDistanceMeters?: number;
  /** Optional heart rate broadcast directly by an FTMS machine. */
  machineHeartRateBpm?: number;
}

export type BikeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface EchelonBleCallbacks {
  onReading: (reading: EchelonRawReading) => void;
  onStatusChange: (
    status: BikeConnectionStatus,
    deviceName: string | null,
    message?: string,
    modelProfile?: BikeModelProfile | null,
    unlockStatus?: EchelonUnlockStatus
  ) => void;
}

/**
 * Identifies the fitness machine brand/model family, sport modality, and control capabilities
 * from its Bluetooth name and connected GATT protocol.
 */
export function detectBikeModelProfile(
  deviceName: string | null | undefined,
  protocol: BikeProtocolKind = 'echelon',
  hasFtmsControl = false
): BikeModelProfile {
  const raw = (deviceName ?? '').trim();
  const upper = raw.toUpperCase();

  if (protocol === 'ftms-treadmill') {
    const treadmillMappings: Array<[RegExp, string, string]> = [
      [/KICKR\s*RUN/i, 'KICKR Run', 'Wahoo KICKR RUN'],
      [/STRIDE/i, 'Stride', 'Echelon Stride'],
      [/SOLE|\bF63\b|\bF80\b|\bF85\b|\bTT8\b/i, 'Sole', 'Sole Treadmill'],
      [/HORIZON|7\.0AT|7\.4AT|7\.8AT/i, 'Horizon', 'Horizon Treadmill'],
      [/NORDICTRACK/i, 'NordicTrack', 'NordicTrack Treadmill'],
      [/PROFORM/i, 'ProForm', 'ProForm Treadmill'],
      [/BOWFLEX|\bBXT/i, 'Bowflex', 'Bowflex Treadmill'],
      [/MATRIX/i, 'Matrix', 'Matrix Treadmill'],
      [/TECHNOGYM/i, 'Technogym', 'Technogym Treadmill'],
      [/WOODWAY/i, 'Woodway', 'Woodway Treadmill'],
      [/WALKINGPAD|KINGSMITH|^KS-/i, 'WalkingPad', 'WalkingPad Treadmill'],
      [/NOBLEPRO/i, 'NoblePro', 'NoblePro Treadmill'],
      [/DOMYOS/i, 'Domyos', 'Domyos Treadmill'],
      [/MERACH|^MRK/i, 'Merach', 'Merach Treadmill'],
      [/ASSAULT|AIRRUNNER/i, 'Assault', 'Assault Runner'],
      [/RUNN/i, 'Runn', 'NPE Runn Treadmill Sensor'],
    ];
    for (const [pattern, shortLabel, displayName] of treadmillMappings) {
      if (pattern.test(raw)) {
        return {
          family: 'ftms-treadmill',
          protocol: 'ftms-treadmill',
          sport: 'running',
          shortLabel,
          displayName,
          hasMotorizedResistance: false,
          hasMotorizedSpeed: hasFtmsControl,
          hasMotorizedIncline: hasFtmsControl,
          recommendedCurve: 'ex3-vector',
        };
      }
    }
    return {
      family: 'ftms-treadmill',
      protocol: 'ftms-treadmill',
      sport: 'running',
      shortLabel: raw ? raw.slice(0, 10) : 'Treadmill',
      displayName: raw || 'FTMS Treadmill',
      hasMotorizedResistance: false,
      hasMotorizedSpeed: hasFtmsControl,
      hasMotorizedIncline: hasFtmsControl,
      recommendedCurve: 'ex3-vector',
    };
  }

  if (protocol === 'rsc') {
    const rscMappings: Array<[RegExp, string, string]> = [
      [/STRYD/i, 'Stryd', 'Stryd Footpod'],
      [/RUNN/i, 'Runn', 'NPE Runn Sensor'],
      [/RUNPOD|ZWIFT/i, 'RunPod', 'Zwift RunPod'],
      [/GARMIN|HRM-PRO|FORERUNNER|FENIX/i, 'Garmin Run', 'Garmin Virtual Run'],
      [/COROS/i, 'COROS', 'COROS POD'],
      [/POLAR/i, 'Polar', 'Polar Stride Sensor'],
    ];
    for (const [pattern, shortLabel, displayName] of rscMappings) {
      if (pattern.test(raw)) {
        return {
          family: 'rsc-footpod',
          protocol: 'rsc',
          sport: 'running',
          shortLabel,
          displayName,
          hasMotorizedResistance: false,
          recommendedCurve: 'ex3-vector',
        };
      }
    }
    return {
      family: 'rsc-footpod',
      protocol: 'rsc',
      sport: 'running',
      shortLabel: raw ? raw.slice(0, 10) : 'Run Pod',
      displayName: raw || 'BLE Running Sensor',
      hasMotorizedResistance: false,
      recommendedCurve: 'ex3-vector',
    };
  }

  if (protocol === 'ftms-rower') {
    const rowerMappings: Array<[RegExp, string, string]> = [
      [/ROWERG|PM5|CONCEPT2/i, 'RowErg', 'Concept2 RowErg'],
      [/SMARTROW/i, 'SmartRow', 'WaterRower SmartRow'],
      [/WATERROWER|COMMODULE|\bS4\b/i, 'WaterRower', 'WaterRower'],
      [/FLUID|FDF/i, 'FluidRower', 'Fluid Rower'],
      [/ECH.*ROW|ECHELON/i, 'Echelon Row', 'Echelon Row'],
      [/MERACH|^MRK/i, 'Merach Row', 'Merach Rower'],
      [/DOMYOS/i, 'Domyos Row', 'Domyos Rower'],
      [/HYDROW/i, 'Hydrow', 'Hydrow Rower'],
      [/AVIRON/i, 'Aviron', 'Aviron Rower'],
      [/ERGATTA/i, 'Ergatta', 'Ergatta Rower'],
      [/RP3/i, 'RP3', 'RP3 Dynamic Rower'],
      [/ASSAULT/i, 'AssaultRow', 'AssaultRower'],
      [/SCHWINN|CREWMASTER/i, 'SchwinnRow', 'Schwinn Rower'],
      [/BOWFLEX/i, 'BowflexRow', 'Bowflex Rower'],
      [/YESOUL/i, 'Yesoul Row', 'Yesoul Rower'],
    ];
    for (const [pattern, shortLabel, displayName] of rowerMappings) {
      if (pattern.test(raw)) {
        return {
          family: 'ftms-rower',
          protocol: 'ftms-rower',
          sport: 'rowing',
          shortLabel,
          displayName,
          hasMotorizedResistance: hasFtmsControl,
          recommendedCurve: 'ex3-vector',
        };
      }
    }
    return {
      family: 'ftms-rower',
      protocol: 'ftms-rower',
      sport: 'rowing',
      shortLabel: raw ? raw.slice(0, 10) : 'Rower',
      displayName: raw || 'FTMS Rowing Machine',
      hasMotorizedResistance: hasFtmsControl,
      recommendedCurve: 'ex3-vector',
    };
  }

  if (protocol === 'echelon' || upper.startsWith('ECH')) {
    if (upper.includes('SPORT-S') || upper.includes('SPORTS')) {
      return {
        family: 'echelon-sport-knob',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'Sport-s',
        displayName: 'Echelon Sport-s',
        hasMotorizedResistance: false,
        hasBuiltInScreen: true,
        recommendedCurve: 'sport-compact',
      };
    }
    if (upper.includes('SPORT') || upper.includes('SPT')) {
      return {
        family: 'echelon-sport-knob',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'Sport',
        displayName: 'Echelon Connect Sport',
        hasMotorizedResistance: false,
        recommendedCurve: 'sport-compact',
      };
    }
    if (upper.includes('EX15') || upper.includes('EX-15')) {
      return {
        family: 'echelon-sport-knob',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-15',
        displayName: 'Echelon EX-15',
        hasMotorizedResistance: false,
        recommendedCurve: 'sport-compact',
      };
    }
    if (upper.includes('PRIME')) {
      return {
        family: 'echelon-sport-knob',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'Prime',
        displayName: 'Echelon Connect Prime',
        hasMotorizedResistance: false,
        recommendedCurve: 'sport-compact',
      };
    }
    if (upper.includes('GT')) {
      return {
        family: 'echelon-sport-knob',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'GT+',
        displayName: 'Echelon Connect GT+',
        hasMotorizedResistance: false,
        recommendedCurve: 'sport-compact',
      };
    }
    if (/EX-?1(?![0-9])/.test(upper)) {
      return {
        family: 'echelon-sport-knob',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-1',
        displayName: 'Echelon EX-1',
        hasMotorizedResistance: false,
        recommendedCurve: 'sport-compact',
      };
    }
    if (upper.includes('EXPRO') || upper.includes('EX-PRO') || upper.includes('ECH-PRO')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-Pro',
        displayName: 'Echelon EX-Pro',
        hasMotorizedResistance: true,
        hasBuiltInScreen: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    if (upper.includes('EX8') || upper.includes('EX-8')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-8s',
        displayName: 'Echelon EX-8s',
        hasMotorizedResistance: true,
        hasBuiltInScreen: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    if (upper.includes('EX7') || upper.includes('EX-7')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-7s',
        displayName: 'Echelon EX-7s',
        hasMotorizedResistance: true,
        hasBuiltInScreen: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    if (upper.includes('EX5S') || upper.includes('EX-5S')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-5s',
        displayName: 'Echelon EX-5s',
        hasMotorizedResistance: true,
        hasBuiltInScreen: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    if (upper.includes('EX5') || upper.includes('EX-5')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-5',
        displayName: 'Echelon EX-5',
        hasMotorizedResistance: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    if (upper.includes('EX4S+') || upper.includes('EX-4S+')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-4s+',
        displayName: 'Echelon EX-4s+',
        hasMotorizedResistance: true,
        hasBuiltInScreen: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    if (upper.includes('EX4') || upper.includes('EX-4')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-4s',
        displayName: 'Echelon EX-4s',
        hasMotorizedResistance: true,
        hasBuiltInScreen: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    if (upper.includes('EX3') || upper.includes('EX-3')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
        sport: 'cycling',
        shortLabel: 'EX-3',
        displayName: 'Echelon EX-3',
        hasMotorizedResistance: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    return {
      family: 'echelon-ex-motorized',
      protocol: 'echelon',
      sport: 'cycling',
      shortLabel: 'Echelon',
      displayName: raw || 'Echelon Connect Bike',
      hasMotorizedResistance: true,
      recommendedCurve: 'ex3-vector',
    };
  }

  if (protocol === 'ftms') {
    const brandMappings: Array<[RegExp, string, string]> = [
      [/^IC BIKE|SCHWINN/i, 'IC4', 'Schwinn IC4'],
      [/BOWFLEX|\bC6\b/i, 'C6', 'Bowflex C6'],
      [/YESOUL/i, 'Yesoul', 'Yesoul Smart Bike'],
      [/MERACH|^MRK/i, 'Merach', 'Merach Smart Bike'],
      [/DOMYOS/i, 'Domyos', 'Domyos Bike'],
      [/KEISER|\bM3/i, 'Keiser', 'Keiser M3i'],
      [/STAGES/i, 'Stages', 'Stages Bike'],
      [/WATTBIKE/i, 'Wattbike', 'Wattbike'],
      [/BIKEERG|^PM5/i, 'BikeErg', 'Concept2 BikeErg'],
      [/RENPHO/i, 'Renpho', 'Renpho AI Bike'],
      [/ZYCLE/i, 'Zycle', 'Zycle Smart Bike'],
      [/JOROTO/i, 'Joroto', 'Joroto Bike'],
      [/KICKR|WAHOO/i, 'KICKR', 'Wahoo KICKR'],
      [/TACX/i, 'Tacx', 'Garmin Tacx'],
      [/ZWIFT/i, 'Zwift', 'Zwift Ride'],
      [/SARIS/i, 'Saris', 'Saris Trainer'],
      [/ELITE/i, 'Elite', 'Elite Trainer'],
      [/JETBLACK/i, 'JetBlack', 'JetBlack Trainer'],
    ];
    for (const [pattern, shortLabel, displayName] of brandMappings) {
      if (pattern.test(raw)) {
        return {
          family: 'ftms-bike',
          protocol: 'ftms',
          sport: 'cycling',
          shortLabel,
          displayName,
          hasMotorizedResistance: hasFtmsControl,
          recommendedCurve: 'ex3-vector',
        };
      }
    }
    return {
      family: 'ftms-bike',
      protocol: 'ftms',
      sport: 'cycling',
      shortLabel: raw ? raw.slice(0, 10) : 'FTMS Bike',
      displayName: raw || 'FTMS Stationary Bike',
      hasMotorizedResistance: hasFtmsControl,
      recommendedCurve: 'ex3-vector',
    };
  }

  if (protocol === 'cps') {
    const shortLabel = /ASSIOMA/i.test(raw)
      ? 'Assioma'
      : /RALLY|VECTOR/i.test(raw)
        ? 'Rally'
        : /4IIII/i.test(raw)
          ? '4iiii'
          : /STAGES/i.test(raw)
            ? 'Stages'
            : raw
              ? raw.slice(0, 10)
              : 'Power';
    return {
      family: 'power-meter-bike',
      protocol: 'cps',
      sport: 'cycling',
      shortLabel,
      displayName: raw || 'Bluetooth Power Meter',
      hasMotorizedResistance: false,
      recommendedCurve: 'ex3-vector',
    };
  }

  return {
    family: 'cadence-bike',
    protocol: 'csc',
    sport: 'cycling',
    shortLabel: raw ? raw.slice(0, 10) : 'Cadence',
    displayName: raw || 'Bluetooth Cadence Bike',
    hasMotorizedResistance: false,
    recommendedCurve: 'ex3-vector',
  };
}

function computeCrankCadenceRpm(
  crankRevs: number,
  crankTime1024: number,
  prev: CrankSample | null
): { rpm: number | null; sample: CrankSample } {
  const sample: CrankSample = { revs: crankRevs, time1024: crankTime1024 };
  if (!prev) {
    return { rpm: null, sample };
  }
  const deltaRevs = (crankRevs - prev.revs + 65536) & 0xffff;
  const deltaTime = (crankTime1024 - prev.time1024 + 65536) & 0xffff;
  if (deltaRevs === 0 || deltaTime === 0) {
    return { rpm: null, sample };
  }
  const seconds = deltaTime / 1024;
  const rpm = Math.round((deltaRevs / seconds) * 60);
  if (rpm <= 0 || rpm > 240) {
    return { rpm: null, sample };
  }
  return { rpm, sample };
}

/**
 * Parses standard Bluetooth SIG Cycling Power Measurement (0x2A63), extracting
 * both Instantaneous Power (watts) and optional Crank Revolution Cadence (RPM).
 */
export function parseCpsMeasurement(
  view: DataView,
  prevSample: CrankSample | null
): { watts: number; cadenceRpm: number | null; nextSample: CrankSample | null } | null {
  if (view.byteLength < 4) return null;
  const flags = view.getUint16(0, true);
  const watts = Math.max(0, view.getInt16(2, true));
  let offset = 4;

  // Bit 0: Pedal Power Balance (uint8)
  if (flags & 0x0001) offset += 1;
  // Bit 2: Accumulated Torque (uint16)
  if (flags & 0x0004) offset += 2;
  // Bit 4: Wheel Revolution Data (uint32 + uint16 = 6 bytes)
  if (flags & 0x0010) offset += 6;

  // Bit 5: Crank Revolution Data (uint16 cumulative revs + uint16 1/1024s event time)
  if (flags & 0x0020 && offset + 4 <= view.byteLength) {
    const crankRevs = view.getUint16(offset, true);
    const crankTime1024 = view.getUint16(offset + 2, true);
    const { rpm, sample } = computeCrankCadenceRpm(crankRevs, crankTime1024, prevSample);
    return { watts, cadenceRpm: rpm, nextSample: sample };
  }

  return { watts, cadenceRpm: null, nextSample: prevSample };
}

/**
 * Parses standard Bluetooth SIG Cycling Speed & Cadence Measurement (0x2A5B)
 * for standalone cadence pods mounted on manual spin bikes.
 */
export function parseCscMeasurement(
  view: DataView,
  prevSample: CrankSample | null
): { cadenceRpm: number | null; nextSample: CrankSample | null } | null {
  if (view.byteLength < 1) return null;
  const flags = view.getUint8(0);
  let offset = 1;

  // Bit 0: Wheel Revolution Data Present (uint32 + uint16 = 6 bytes)
  if (flags & 0x01) offset += 6;

  // Bit 1: Crank Revolution Data Present (uint16 revs + uint16 1/1024s event time)
  if (flags & 0x02 && offset + 4 <= view.byteLength) {
    const crankRevs = view.getUint16(offset, true);
    const crankTime1024 = view.getUint16(offset + 2, true);
    const { rpm, sample } = computeCrankCadenceRpm(crankRevs, crankTime1024, prevSample);
    return { cadenceRpm: rpm, nextSample: sample };
  }

  return { cadenceRpm: null, nextSample: prevSample };
}

export interface FtmsTreadmillParsed {
  speedMps?: number;
  inclinePct?: number;
  totalDistanceMeters?: number;
  powerWatts?: number;
  heartRateBpm?: number;
}

/**
 * Parses standard Bluetooth SIG FTMS Treadmill Data (0x2ACD) notifications.
 * Supports split packets where Bit 0 ("More Data") is 1 and only optional fields appear.
 */
export function parseFtmsTreadmillData(view: DataView): FtmsTreadmillParsed | null {
  if (view.byteLength < 2) return null;
  const flags = view.getUint16(0, true);
  let offset = 2;
  const result: FtmsTreadmillParsed = {};

  // Bit 0 == 0: Instantaneous Speed (uint16, 0.01 km/h)
  if ((flags & 0x0001) === 0 && offset + 2 <= view.byteLength) {
    const kmh = view.getUint16(offset, true) * 0.01;
    result.speedMps = kmh / 3.6;
    offset += 2;
  }
  // Bit 1: Average Speed (uint16, 0.01 km/h)
  if (flags & 0x0002) offset += 2;
  // Bit 2: Total Distance (uint24, meters)
  if (flags & 0x0004 && offset + 3 <= view.byteLength) {
    result.totalDistanceMeters =
      view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    offset += 3;
  }
  // Bit 3: Inclination (sint16, 0.1%) + Ramp Angle Setting (sint16, 0.1 deg)
  if (flags & 0x0008 && offset + 4 <= view.byteLength) {
    const rawIncline = view.getInt16(offset, true);
    if (rawIncline !== 0x7fff && rawIncline >= -500 && rawIncline <= 500) {
      result.inclinePct = Math.round(rawIncline) / 10;
    }
    offset += 4;
  }
  // Bit 4: Positive Elevation Gain (uint16) + Negative Elevation Gain (uint16)
  if (flags & 0x0010) offset += 4;
  // Bit 5: Instantaneous Pace (uint8, 0.1 km/min per FTMS v1.0)
  if (flags & 0x0020) offset += 1;
  // Bit 6: Average Pace (uint8, 0.1 km/min)
  if (flags & 0x0040) offset += 1;
  // Bit 7: Expended Energy (Total uint16 + Per Hour uint16 + Per Minute uint8 = 5 bytes)
  if (flags & 0x0080) offset += 5;
  // Bit 8: Heart Rate (uint8, bpm)
  if (flags & 0x0100 && offset + 1 <= view.byteLength) {
    const hr = view.getUint8(offset);
    if (hr > 30 && hr < 240) {
      result.heartRateBpm = hr;
    }
    offset += 1;
  }
  // Bit 9: Metabolic Equivalent (uint8)
  if (flags & 0x0200) offset += 1;
  // Bit 10: Elapsed Time (uint16)
  if (flags & 0x0400) offset += 2;
  // Bit 11: Remaining Time (uint16)
  if (flags & 0x0800) offset += 2;
  // Bit 12: Force on Belt (sint16, N) + Power Output (sint16, W)
  if (flags & 0x1000 && offset + 4 <= view.byteLength) {
    const rawWatts = view.getInt16(offset + 2, true);
    if (rawWatts >= 0 && rawWatts < 3000) {
      result.powerWatts = rawWatts;
    }
  }

  return result;
}

export interface FtmsRowerParsed {
  strokeRateSpm?: number;
  strokeCount?: number;
  totalDistanceMeters?: number;
  paceSecPer500m?: number;
  powerWatts?: number;
  resistanceLevel?: number;
  heartRateBpm?: number;
}

/**
 * Parses standard Bluetooth SIG FTMS Rower Data (0x2AD1) notifications
 * (Concept2 RowErg PM5, WaterRower/SmartRow, Fluid Rower, Merach, Domyos, Echelon Row, etc.).
 * Supports split packets where Bit 0 ("More Data") is 1.
 */
export function parseFtmsRowerData(view: DataView): FtmsRowerParsed | null {
  if (view.byteLength < 2) return null;
  const flags = view.getUint16(0, true);
  let offset = 2;
  const result: FtmsRowerParsed = {};

  // Bit 0 == 0: Stroke Rate (uint8, 0.5 strokes/min) + Stroke Count (uint16)
  if ((flags & 0x0001) === 0 && offset + 3 <= view.byteLength) {
    result.strokeRateSpm = Math.round(view.getUint8(offset) * 0.5);
    result.strokeCount = view.getUint16(offset + 1, true);
    offset += 3;
  }
  // Bit 1: Average Stroke Rate (uint8, 0.5 strokes/min)
  if (flags & 0x0002) offset += 1;
  // Bit 2: Total Distance (uint24, meters)
  if (flags & 0x0004 && offset + 3 <= view.byteLength) {
    result.totalDistanceMeters =
      view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    offset += 3;
  }
  // Bit 3: Instantaneous Pace (uint16, seconds per 500m)
  if (flags & 0x0008 && offset + 2 <= view.byteLength) {
    const rawPace = view.getUint16(offset, true);
    result.paceSecPer500m = rawPace > 0 && rawPace < 0xffff ? rawPace : 0;
    offset += 2;
  }
  // Bit 4: Average Pace (uint16, seconds per 500m)
  if (flags & 0x0010) offset += 2;
  // Bit 5: Instantaneous Power (sint16, watts)
  if (flags & 0x0020 && offset + 2 <= view.byteLength) {
    result.powerWatts = Math.max(0, view.getInt16(offset, true));
    offset += 2;
  }
  // Bit 6: Average Power (sint16, watts)
  if (flags & 0x0040) offset += 2;
  // Bit 7: Resistance Level (sint16 per FTMS v1.0; guard single-byte quirk if trailing)
  if (flags & 0x0080) {
    if (offset + 2 <= view.byteLength) {
      result.resistanceLevel = Math.max(0, view.getInt16(offset, true));
      offset += 2;
    } else if (offset + 1 <= view.byteLength) {
      result.resistanceLevel = view.getUint8(offset);
      offset += 1;
    }
  }
  // Bit 8: Expended Energy (Total uint16 + Per Hour uint16 + Per Minute uint8 = 5 bytes)
  if (flags & 0x0100) offset += 5;
  // Bit 9: Heart Rate (uint8, bpm)
  if (flags & 0x0200 && offset + 1 <= view.byteLength) {
    const hr = view.getUint8(offset);
    if (hr > 30 && hr < 240) {
      result.heartRateBpm = hr;
    }
    offset += 1;
  }
  // Bit 10: Metabolic Equivalent (uint8)
  if (flags & 0x0400) offset += 1;
  // Bit 11: Elapsed Time (uint16)
  if (flags & 0x0800) offset += 2;
  // Bit 12: Remaining Time (uint16)
  if (flags & 0x1000) offset += 2;

  return result;
}

export interface RscParsed {
  speedMps: number;
  cadenceSpm: number;
  isRunning: boolean;
  strideLengthMeters?: number;
  totalDistanceMeters?: number;
}

/**
 * Parses standard Bluetooth SIG Running Speed & Cadence Measurement (0x2A53)
 * for footpods (Stryd, Zwift RunPod, NPE Runn, Polar/Garmin Virtual Run).
 */
export function parseRscMeasurement(view: DataView): RscParsed | null {
  if (view.byteLength < 4) return null;
  const flags = view.getUint8(0);
  const speedMps = view.getUint16(1, true) / 256;
  const rawCadence = view.getUint8(3);
  const isRunning = Boolean(flags & 0x04);

  // Normalize single-foot stride rate (e.g. 85 strides/min) to total steps/min (170 spm),
  // while leaving dual-foot sensors that already transmit 150-200 spm untouched.
  const cadenceSpm =
    isRunning && rawCadence > 0 && rawCadence < 115
      ? rawCadence * 2
      : !isRunning && rawCadence > 0 && rawCadence < 75
        ? rawCadence * 2
        : rawCadence;

  let offset = 4;
  let strideLengthMeters: number | undefined;
  let totalDistanceMeters: number | undefined;

  if (flags & 0x01 && offset + 2 <= view.byteLength) {
    strideLengthMeters = view.getUint16(offset, true) * 0.01;
    offset += 2;
  }
  if (flags & 0x02 && offset + 4 <= view.byteLength) {
    totalDistanceMeters = view.getUint32(offset, true) * 0.1;
  }

  return {
    speedMps,
    cadenceSpm,
    isRunning,
    ...(strideLengthMeters !== undefined ? { strideLengthMeters } : {}),
    ...(totalDistanceMeters !== undefined ? { totalDistanceMeters } : {}),
  };
}

function parseLeadingDecimalDigitsFromHex(bytes: number[]): number | null {
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  let digits = '';
  for (const ch of hex) {
    if (ch >= '0' && ch <= '9') {
      digits += ch;
    } else {
      break;
    }
  }
  if (!digits) return null;
  return Number.parseInt(digits, 10);
}

/**
 * Computes the direct offline challenge-response frame for locked Echelon firmware (0xF0 0xE0 frames),
 * including post-July 2025 firmware locks. Protocol discovery and validation credited to
 * Christian Emerson (@christianbemerson) and QZ PR #5358.
 */
export function solveEchelonUnlockChallenge(challenge: Uint8Array): EchelonUnlockResult {
  if (challenge.length !== 8) {
    return { response: null, authValue: null, error: 'invalid-length' };
  }
  if (challenge[0] !== 0xf0 || challenge[1] !== 0xe0) {
    return { response: null, authValue: null, error: 'invalid-prefix' };
  }
  const a = parseLeadingDecimalDigitsFromHex([challenge[4], challenge[2]]);
  const b = parseLeadingDecimalDigitsFromHex([challenge[3], challenge[5]]);
  const c = parseLeadingDecimalDigitsFromHex([challenge[6]]);
  if (a === null || b === null || c === null) {
    return { response: null, authValue: null, error: 'invalid-decimal-prefix' };
  }
  if (c === 0) {
    return { response: null, authValue: null, error: 'zero-divisor' };
  }
  const authValue = (a * b) % c;
  if (authValue < 0 || authValue > 99) {
    return { response: null, authValue: null, error: 'result-out-of-range' };
  }
  const packedBcd = ((Math.floor(authValue / 10) & 0x0f) << 4) | (authValue % 10);
  const frame = new Uint8Array([0xf0, 0xe0, 0x00, 0x00, packedBcd, 0x00, 0x00, 0x00]);
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum = (sum + frame[i]) & 0xff;
  }
  frame[7] = sum;
  return { response: frame, authValue, error: null };
}

export function computeEchelonUnlockResponse(challenge: Uint8Array): Uint8Array | null {
  return solveEchelonUnlockChallenge(challenge).response;
}

function isEchoedEchelonUnlockAck(bytes: Uint8Array, expectedAuthByte: number | null): boolean {
  if (
    expectedAuthByte === null ||
    bytes.length !== 8 ||
    bytes[0] !== 0xf0 ||
    bytes[1] !== 0xe0 ||
    bytes[2] !== 0x00 ||
    bytes[3] !== 0x00 ||
    bytes[4] !== expectedAuthByte ||
    bytes[5] !== 0x00 ||
    bytes[6] !== 0x00
  ) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum = (sum + bytes[i]) & 0xff;
  }
  return bytes[7] === sum;
}

/**
 * Returns true if an incoming Echelon GATT notification confirms the bike is in an active,
 * unlocked telemetry state (F0 A5 01 0E A4 ACK, F0 D1 telemetry, F0 D2 resistance, or an
 * echoed checksum-valid F0 E0 response carrying the expected auth byte).
 */
export function isEchelonPostAuthFrame(
  bytes: Uint8Array,
  expectedAuthByte: number | null = null
): boolean {
  if (
    bytes.length === ECHELON_UNLOCK_ACK_FRAME.length &&
    bytes.every((val, idx) => val === ECHELON_UNLOCK_ACK_FRAME[idx])
  ) {
    return true;
  }
  if (bytes.length === 13 && bytes[0] === 0xf0 && bytes[1] === 0xd1) {
    return true;
  }
  if (bytes.length === 5 && bytes[0] === 0xf0 && bytes[1] === 0xd2) {
    return true;
  }
  return isEchoedEchelonUnlockAck(bytes, expectedAuthByte);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export class EchelonBikeConnection {
  private device: BluetoothDevice | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private ftmsControlChar: BluetoothRemoteGATTCharacteristic | null = null;
  private ftmsControlGranted = false;
  private notifyChars: BluetoothRemoteGATTCharacteristic[] = [];
  private modelProfile: BikeModelProfile | null = null;
  private pollTimer: number | null = null;
  private pollCounter = 1;
  private writeChain: Promise<void> = Promise.resolve();
  private manualDisconnect = false;
  private gattSessionId = 0;
  private echelonSessionReady = false;
  private unlockState: EchelonUnlockStatus = 'idle';
  private unlockActivationSent = false;
  private unlockAuthAckReceived = false;
  private unlockExpectedAuthByte: number | null = null;
  private unlockActivationTimer: number | null = null;
  private unlockFallbackTimer: number | null = null;
  private unlockRetryUsed = false;
  private pendingResistanceLevel: number | null = null;
  private cadenceRpm = 0;
  private resistance = 1;
  private maxResistance = 32;
  private preferredSport: SportMode | undefined;
  private lastSpeedMps = 0;
  private lastInclinePct = 0;
  private lastPaceSec500m = 0;
  private lastDirectWatts: number | undefined;
  private lastStrokeCount = 0;
  private prevCrankSample: CrankSample | null = null;
  private lastPedalPacketAt = 0;
  private zeroCadenceWatchdog: number | null = null;
  private connectAttemptId = 0;
  private readonly callbacks: EchelonBleCallbacks;

  private readonly boundHandleDisconnect: () => void;
  private readonly boundHandleNotify: (ev: Event) => void;
  private readonly boundHandleFtms: (ev: Event) => void;
  private readonly boundHandleFtmsTreadmill: (ev: Event) => void;
  private readonly boundHandleFtmsRower: (ev: Event) => void;
  private readonly boundHandleCps: (ev: Event) => void;
  private readonly boundHandleCsc: (ev: Event) => void;
  private readonly boundHandleRsc: (ev: Event) => void;

  constructor(callbacks: EchelonBleCallbacks) {
    this.callbacks = callbacks;
    this.boundHandleDisconnect = () => {
      void this.handleUnexpectedDisconnect();
    };
    this.boundHandleNotify = (ev: Event) => {
      const target = ev.target as BluetoothRemoteGATTCharacteristic | null;
      if (target?.value) {
        this.parseEchelonNotification(target.value);
      }
    };
    this.boundHandleFtms = (ev: Event) => {
      const target = ev.target as BluetoothRemoteGATTCharacteristic | null;
      if (target?.value) {
        this.parseFtmsNotification(target.value);
      }
    };
    this.boundHandleFtmsTreadmill = (ev: Event) => {
      const target = ev.target as BluetoothRemoteGATTCharacteristic | null;
      if (target?.value) {
        this.parseFtmsTreadmillNotification(target.value);
      }
    };
    this.boundHandleFtmsRower = (ev: Event) => {
      const target = ev.target as BluetoothRemoteGATTCharacteristic | null;
      if (target?.value) {
        this.parseFtmsRowerNotification(target.value);
      }
    };
    this.boundHandleCps = (ev: Event) => {
      const target = ev.target as BluetoothRemoteGATTCharacteristic | null;
      if (target?.value) {
        this.parseCpsNotification(target.value);
      }
    };
    this.boundHandleCsc = (ev: Event) => {
      const target = ev.target as BluetoothRemoteGATTCharacteristic | null;
      if (target?.value) {
        this.parseCscNotification(target.value);
      }
    };
    this.boundHandleRsc = (ev: Event) => {
      const target = ev.target as BluetoothRemoteGATTCharacteristic | null;
      if (target?.value) {
        this.parseRscNotification(target.value);
      }
    };
  }

  public static isSupported(): boolean {
    return isBleTransportSupported();
  }

  public getModelProfile(): BikeModelProfile | null {
    return this.modelProfile;
  }

  public getUnlockStatus(): EchelonUnlockStatus {
    return this.unlockState;
  }

  private getCurrentDeviceLabel(): string {
    return this.device?.name || this.modelProfile?.displayName || 'Fitness Machine';
  }

  public async requestAndConnect(options?: {
    acceptAllDevices?: boolean;
    preferredSport?: SportMode;
  }): Promise<void> {
    if (!EchelonBikeConnection.isSupported()) {
      throw new Error(getBluetoothUnsupportedMessage());
    }

    const attemptId = ++this.connectAttemptId;
    this.manualDisconnect = false;
    this.preferredSport = options?.preferredSport;
    this.callbacks.onStatusChange('connecting', null, undefined, null, 'idle');

    const optionalServices: BluetoothServiceUUID[] = [
      ECHELON_ADV_SERVICE,
      ECHELON_COMM_SERVICE,
      FTMS_SERVICE,
      CYCLING_POWER_SERVICE,
      CYCLING_SPEED_CADENCE_SERVICE,
      RUNNING_SPEED_CADENCE_SERVICE,
      'device_information',
      'battery_service',
    ];

    try {
      const device = options?.acceptAllDevices
        ? await requestBleDevice({
            acceptAllDevices: true,
            optionalServices,
          })
        : await requestBleDevice({
            filters: [
              { services: [ECHELON_ADV_SERVICE] },
              { services: [ECHELON_COMM_SERVICE] },
              { services: [FTMS_SERVICE] },
              { services: [CYCLING_POWER_SERVICE] },
              { services: [CYCLING_SPEED_CADENCE_SERVICE] },
              { services: [RUNNING_SPEED_CADENCE_SERVICE] },
              ...COMMON_BIKE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
            ],
            optionalServices,
          });

      // Ignore if the user canceled or started a newer scan while the OS picker was open
      if (attemptId !== this.connectAttemptId || this.manualDisconnect) {
        if (device.gatt?.connected) {
          device.gatt.disconnect();
        }
        return;
      }

      if (this.device) {
        this.cleanupListeners();
      }

      this.device = device;
      device.addEventListener('gattserverdisconnected', this.boundHandleDisconnect);
      await this.establishGattSession(device);
    } catch (err) {
      if (attemptId === this.connectAttemptId) {
        this.gattSessionId++;
        this.echelonSessionReady = false;
        this.resetDirectUnlockState();
        this.clearTimers();
        this.cleanupListeners();
        if (this.device?.gatt?.connected) {
          this.device.gatt.disconnect();
        }
        this.device = null;
        this.modelProfile = null;
        this.callbacks.onStatusChange('disconnected', null, undefined, null, 'idle');
      }
      throw err;
    }
  }

  private async establishGattSession(device: BluetoothDevice): Promise<void> {
    if (!device.gatt) {
      throw new Error('Selected Bluetooth device does not expose a GATT server.');
    }

    const sessionId = ++this.gattSessionId;
    this.echelonSessionReady = false;
    this.clearTimers();
    this.resetDirectUnlockState();
    this.writeChar = null;
    this.ftmsControlChar = null;
    this.ftmsControlGranted = false;
    this.prevCrankSample = null;
    this.maxResistance = 32;
    this.lastSpeedMps = 0;
    this.lastInclinePct = 0;
    this.lastPaceSec500m = 0;
    this.lastDirectWatts = undefined;
    this.lastStrokeCount = 0;
    this.notifyChars = [];

    const server = await device.gatt.connect();
    if (sessionId !== this.gattSessionId) return;

    const tryFtmsSession = async (): Promise<boolean> => {
      try {
        const ftms = await server.getPrimaryService(FTMS_SERVICE);
        const probes: Array<{
          uuid: number;
          protocol: 'ftms' | 'ftms-rower' | 'ftms-treadmill';
          handler: (ev: Event) => void;
        }> =
          this.preferredSport === 'running'
            ? [
                {
                  uuid: FTMS_TREADMILL_DATA,
                  protocol: 'ftms-treadmill',
                  handler: this.boundHandleFtmsTreadmill,
                },
                { uuid: FTMS_INDOOR_BIKE_DATA, protocol: 'ftms', handler: this.boundHandleFtms },
                {
                  uuid: FTMS_ROWER_DATA,
                  protocol: 'ftms-rower',
                  handler: this.boundHandleFtmsRower,
                },
              ]
            : this.preferredSport === 'rowing'
              ? [
                  {
                    uuid: FTMS_ROWER_DATA,
                    protocol: 'ftms-rower',
                    handler: this.boundHandleFtmsRower,
                  },
                  { uuid: FTMS_INDOOR_BIKE_DATA, protocol: 'ftms', handler: this.boundHandleFtms },
                  {
                    uuid: FTMS_TREADMILL_DATA,
                    protocol: 'ftms-treadmill',
                    handler: this.boundHandleFtmsTreadmill,
                  },
                ]
              : [
                  { uuid: FTMS_INDOOR_BIKE_DATA, protocol: 'ftms', handler: this.boundHandleFtms },
                  {
                    uuid: FTMS_ROWER_DATA,
                    protocol: 'ftms-rower',
                    handler: this.boundHandleFtmsRower,
                  },
                  {
                    uuid: FTMS_TREADMILL_DATA,
                    protocol: 'ftms-treadmill',
                    handler: this.boundHandleFtmsTreadmill,
                  },
                ];

        for (const probe of probes) {
          try {
            const dataChar = await ftms.getCharacteristic(probe.uuid);
            dataChar.addEventListener('characteristicvaluechanged', probe.handler);
            await dataChar.startNotifications();
            this.notifyChars.push(dataChar);

            let hasFtmsControl = false;
            try {
              const ctrl = await ftms.getCharacteristic(FTMS_CONTROL_POINT);
              if (ctrl && ctrl !== dataChar) {
                this.ftmsControlChar = ctrl;
                hasFtmsControl = true;
              }
            } catch {
              // Read-only FTMS machines (e.g. Schwinn IC4, Concept2 RowErg) omit control point
            }

            this.modelProfile = detectBikeModelProfile(device.name, probe.protocol, hasFtmsControl);
            const label = device.name || this.modelProfile.displayName;
            this.startCadenceWatchdog();
            this.callbacks.onStatusChange('connected', label, undefined, this.modelProfile, 'idle');
            return true;
          } catch {
            // Try next FTMS data characteristic
          }
        }
      } catch {
        // Device does not expose FTMS service
      }
      return false;
    };

    // When pairing in Running or Rowing mode, check standard FTMS first so Echelon Stride/Row
    // over FTMS match immediately before probing the Echelon bike-only GATT service.
    if (this.preferredSport === 'running' || this.preferredSport === 'rowing') {
      if (await tryFtmsSession()) {
        return;
      }
    }

    // 1. Native Echelon Bike GATT channel (Connect Sport, EX-15, Prime, GT+, EX-1/3/4s/4s+/5/5s/7s/8s/Pro)
    try {
      const echelonService = await server.getPrimaryService(ECHELON_COMM_SERVICE);
      this.writeChar = await echelonService.getCharacteristic(ECHELON_WRITE_CHAR);
      this.modelProfile = detectBikeModelProfile(device.name, 'echelon');
      const label = device.name || this.modelProfile.displayName;

      for (const uuid of [ECHELON_NOTIFY_1_CHAR, ECHELON_NOTIFY_2_CHAR]) {
        try {
          const ch = await echelonService.getCharacteristic(uuid);
          ch.addEventListener('characteristicvaluechanged', this.boundHandleNotify);
          await ch.startNotifications();
          this.notifyChars.push(ch);
        } catch {
          // Some firmware revisions expose only one notify characteristic
        }
      }

      if (sessionId !== this.gattSessionId) return;

      // Brief listen window in case a locked Echelon bike immediately emits an 0xF0 0xE0 challenge
      await sleep(260);
      if (sessionId !== this.gattSessionId) return;

      if (this.unlockState === 'idle') {
        await this.sendClassicHandshake(sessionId);
      }
      if (sessionId !== this.gattSessionId) return;

      this.echelonSessionReady = true;
      this.startKeepalivePoll();
      this.startCadenceWatchdog();
      const readyMessage =
        this.unlockState === 'unlocked'
          ? `${label} unlocked & ready!`
          : this.unlockState === 'failed'
            ? `${label} appears firmware-locked and didn't confirm direct unlock. Try unplugging the bike for 10 seconds and pairing again.`
            : undefined;
      this.callbacks.onStatusChange(
        'connected',
        label,
        readyMessage,
        this.modelProfile,
        this.unlockState
      );
      return;
    } catch {
      // Fall through to standard FTMS / Cycling Power / CSC / RSC
    }

    // 2. Standard FTMS (0x1826) — Indoor Bikes (0x2AD2), Rowers (0x2AD1), and Treadmills (0x2ACD)
    if (this.preferredSport !== 'running' && this.preferredSport !== 'rowing') {
      if (await tryFtmsSession()) {
        return;
      }
    }

    // 3. Standard Cycling Power Service (0x1818) — Assioma, Garmin Rally/Vector, Stages, 4iiii, smart trainers
    try {
      const cps = await server.getPrimaryService(CYCLING_POWER_SERVICE);
      const cpChar = await cps.getCharacteristic(CYCLING_POWER_MEASUREMENT);
      cpChar.addEventListener('characteristicvaluechanged', this.boundHandleCps);
      await cpChar.startNotifications();
      this.notifyChars.push(cpChar);

      this.modelProfile = detectBikeModelProfile(device.name, 'cps');
      const label = device.name || this.modelProfile.displayName;
      this.startCadenceWatchdog();
      this.callbacks.onStatusChange('connected', label, undefined, this.modelProfile, 'idle');
      return;
    } catch {
      // Fall through to Cycling Speed & Cadence or Running Speed & Cadence
    }

    // 4. Standard Cycling Speed & Cadence Service (0x1816) — Wahoo/Garmin/Magene/Coospo cadence pods
    try {
      const csc = await server.getPrimaryService(CYCLING_SPEED_CADENCE_SERVICE);
      const cscChar = await csc.getCharacteristic(CSC_MEASUREMENT);
      cscChar.addEventListener('characteristicvaluechanged', this.boundHandleCsc);
      await cscChar.startNotifications();
      this.notifyChars.push(cscChar);

      this.modelProfile = detectBikeModelProfile(device.name, 'csc');
      const label = device.name || this.modelProfile.displayName;
      if (this.resistance < 12) {
        this.resistance = 16; // Sensible flat-road virtual starting gear for cadence-only spin bikes
      }
      this.startCadenceWatchdog();
      this.callbacks.onStatusChange('connected', label, undefined, this.modelProfile, 'idle');
      return;
    } catch {
      // Fall through to Running Speed & Cadence (0x1814)
    }

    // 5. Standard Running Speed & Cadence Service (0x1814 / 0x2A53) — Stryd, Zwift RunPod, NPE Runn, Garmin Virtual Run
    const rsc = await server.getPrimaryService(RUNNING_SPEED_CADENCE_SERVICE);
    const rscChar = await rsc.getCharacteristic(RSC_MEASUREMENT);
    rscChar.addEventListener('characteristicvaluechanged', this.boundHandleRsc);
    await rscChar.startNotifications();
    this.notifyChars.push(rscChar);

    this.modelProfile = detectBikeModelProfile(device.name, 'rsc');
    const label = device.name || this.modelProfile.displayName;
    this.startCadenceWatchdog();
    this.callbacks.onStatusChange('connected', label, undefined, this.modelProfile, 'idle');
  }

  private enqueueWrite(
    payload: Uint8Array,
    targetChar?: BluetoothRemoteGATTCharacteristic | null,
    options?: { preferWithResponse?: boolean; sessionId?: number }
  ): Promise<void> {
    const expectedSession = options?.sessionId ?? this.gattSessionId;
    const preferWithResponse = options?.preferWithResponse ?? targetChar === undefined;

    this.writeChain = this.writeChain
      .then(async () => {
        if (expectedSession !== this.gattSessionId) return;
        const ch = targetChar ?? this.writeChar;
        if (!ch) return;
        const buf = new Uint8Array(payload);

        // Echelon's 0bf669f2 channel uses WriteWithResponse in QZ (Android & iOS) for reliable
        // delivery of unlock responses and activation frames, falling back to WriteWithoutResponse.
        if (
          preferWithResponse &&
          ch.properties.write &&
          typeof ch.writeValueWithResponse === 'function'
        ) {
          try {
            await ch.writeValueWithResponse(buf);
          } catch {
            if (
              ch.properties.writeWithoutResponse &&
              typeof ch.writeValueWithoutResponse === 'function'
            ) {
              await ch.writeValueWithoutResponse(buf);
            } else {
              throw new Error('GATT write with response failed');
            }
          }
        } else if (
          ch.properties.writeWithoutResponse &&
          typeof ch.writeValueWithoutResponse === 'function'
        ) {
          await ch.writeValueWithoutResponse(buf);
        } else if (ch.properties.write && typeof ch.writeValueWithResponse === 'function') {
          await ch.writeValueWithResponse(buf);
        } else {
          await ch.writeValue(buf);
        }
        await sleep(40);
      })
      .catch(() => {
        // Ignore transient write errors during reconnect transitions
      });
    return this.writeChain;
  }

  private async sendClassicHandshake(sessionId: number): Promise<void> {
    const initA1 = new Uint8Array([0xf0, 0xa1, 0x00, 0x91]);
    const initA3 = new Uint8Array([0xf0, 0xa3, 0x00, 0x93]);
    const frames = [
      initA1,
      initA1,
      initA1,
      initA1,
      initA3,
      initA1,
      ECHELON_ACTIVATION_FRAME,
    ];

    for (const frame of frames) {
      // Abort remaining classic init frames immediately if a locked bike emits 0xF0 0xE0 mid-handshake
      if (sessionId !== this.gattSessionId || this.unlockState !== 'idle') {
        return;
      }
      await this.enqueueWrite(frame, undefined, { preferWithResponse: true, sessionId });
    }
  }

  private handleDirectUnlockChallenge(challenge: Uint8Array): void {
    if (this.unlockState === 'unlocking' || this.unlockState === 'unlocked') {
      return;
    }

    const result = solveEchelonUnlockChallenge(challenge);
    if (!result.response) {
      this.handleDirectUnlockFailed(`invalid challenge (${result.error ?? 'unknown'})`);
      return;
    }

    if (this.unlockState === 'failed') {
      if (this.unlockRetryUsed) {
        return;
      }
      this.unlockRetryUsed = true;
    }

    const sessionId = this.gattSessionId;
    this.clearUnlockTimers();
    this.unlockState = 'unlocking';
    this.unlockActivationSent = false;
    this.unlockAuthAckReceived = false;
    this.unlockExpectedAuthByte = result.response[4];

    if (this.echelonSessionReady) {
      this.callbacks.onStatusChange(
        'connected',
        this.getCurrentDeviceLabel(),
        undefined,
        this.modelProfile,
        'unlocking'
      );
    }

    this.unlockActivationTimer = window.setTimeout(() => {
      this.sendDirectUnlockActivation(sessionId);
    }, 500);
    this.unlockFallbackTimer = window.setTimeout(() => {
      this.handleDirectUnlockFailed('timeout waiting for post-unlock traffic', sessionId);
    }, 2500);

    void this.enqueueWrite(result.response, undefined, { preferWithResponse: true, sessionId });
  }

  private sendDirectUnlockActivation(sessionId: number): void {
    this.unlockActivationTimer = null;
    if (
      sessionId !== this.gattSessionId ||
      this.unlockState !== 'unlocking' ||
      this.unlockActivationSent
    ) {
      return;
    }
    this.unlockActivationSent = true;
    void this.enqueueWrite(ECHELON_ACTIVATION_FRAME, undefined, {
      preferWithResponse: true,
      sessionId,
    }).then(() => {
      if (
        sessionId === this.gattSessionId &&
        this.unlockState === 'unlocking' &&
        this.unlockAuthAckReceived
      ) {
        this.confirmDirectUnlock();
      }
    });
  }

  private confirmDirectUnlock(): void {
    if (this.unlockState === 'unlocked') return;
    this.clearUnlockTimers();
    this.unlockState = 'unlocked';
    this.unlockActivationSent = true;

    if (this.echelonSessionReady) {
      const label = this.getCurrentDeviceLabel();
      this.callbacks.onStatusChange(
        'connected',
        label,
        `${label} unlocked & ready!`,
        this.modelProfile,
        'unlocked'
      );
    }

    if (this.pendingResistanceLevel !== null) {
      const queuedLevel = this.pendingResistanceLevel;
      this.pendingResistanceLevel = null;
      void this.writeEchelonResistanceFrame(queuedLevel);
    }
  }

  private handleDirectUnlockFailed(_reason: string, sessionId?: number): void {
    if (sessionId !== undefined && sessionId !== this.gattSessionId) {
      return;
    }
    if (this.unlockState === 'unlocked') {
      return;
    }
    this.clearUnlockTimers();
    this.unlockState = 'failed';
    this.unlockActivationSent = false;
    this.unlockAuthAckReceived = false;
    this.pendingResistanceLevel = null;

    if (this.echelonSessionReady) {
      const label = this.getCurrentDeviceLabel();
      this.callbacks.onStatusChange(
        'connected',
        label,
        `${label} appears firmware-locked and didn't confirm direct unlock. Try unplugging the bike for 10 seconds and pairing again.`,
        this.modelProfile,
        'failed'
      );
    }
  }

  private clearUnlockTimers(): void {
    if (this.unlockActivationTimer !== null) {
      window.clearTimeout(this.unlockActivationTimer);
      this.unlockActivationTimer = null;
    }
    if (this.unlockFallbackTimer !== null) {
      window.clearTimeout(this.unlockFallbackTimer);
      this.unlockFallbackTimer = null;
    }
  }

  private resetDirectUnlockState(): void {
    this.clearUnlockTimers();
    this.unlockState = 'idle';
    this.unlockActivationSent = false;
    this.unlockAuthAckReceived = false;
    this.unlockExpectedAuthByte = null;
    this.unlockRetryUsed = false;
    this.pendingResistanceLevel = null;
  }

  private startKeepalivePoll(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
    }
    const sessionId = this.gattSessionId;
    this.pollCounter = 1;
    this.pollTimer = window.setInterval(() => {
      if (sessionId !== this.gattSessionId || this.unlockState === 'unlocking') return;
      const frame = new Uint8Array([0xf0, 0xa0, 0x01, this.pollCounter, 0x00]);
      frame[4] = (frame[0] + frame[1] + frame[2] + frame[3]) & 0xff;
      void this.enqueueWrite(frame, undefined, { preferWithResponse: true, sessionId });
      this.pollCounter = (this.pollCounter % 255) + 1;
    }, 2000);
  }

  private startCadenceWatchdog(): void {
    if (this.zeroCadenceWatchdog !== null) {
      window.clearInterval(this.zeroCadenceWatchdog);
    }
    this.zeroCadenceWatchdog = window.setInterval(() => {
      const sport = this.modelProfile?.sport ?? 'cycling';
      const hasActivity =
        this.cadenceRpm > 0 ||
        this.lastSpeedMps > 0 ||
        (sport === 'rowing' && ((this.lastDirectWatts ?? 0) > 0 || this.lastPaceSec500m > 0));
      if (hasActivity && Date.now() - this.lastPedalPacketAt > 4000) {
        this.cadenceRpm = 0;
        this.lastSpeedMps = 0;
        this.lastPaceSec500m = 0;
        if (sport !== 'cycling') {
          this.lastDirectWatts = 0;
        }
        this.callbacks.onReading({
          sport,
          cadenceRpm: 0,
          resistance: this.resistance,
          ...(sport === 'running'
            ? { directSpeedMps: 0, inclinePct: this.lastInclinePct, directWatts: 0 }
            : sport === 'rowing'
              ? { directSpeedMps: 0, paceSecPer500m: 0, directWatts: 0, strokeCount: this.lastStrokeCount }
              : {}),
          ...(this.maxResistance > 32 ? { maxResistance: this.maxResistance } : {}),
        });
      }
    }, 1500);
  }

  private async ensureFtmsControl(): Promise<boolean> {
    if (!this.ftmsControlChar) return false;
    if (!this.ftmsControlGranted) {
      await this.enqueueWrite(new Uint8Array([0x00]), this.ftmsControlChar, {
        preferWithResponse: false,
      });
      this.ftmsControlGranted = true;
    }
    return true;
  }

  private async writeEchelonResistanceFrame(level: number): Promise<void> {
    const echelonLevel = Math.max(1, Math.min(32, level));
    const frame = new Uint8Array([0xf0, 0xb1, 0x01, echelonLevel, 0x00]);
    frame[4] = (frame[0] + frame[1] + frame[2] + frame[3]) & 0xff;
    await this.enqueueWrite(frame, undefined, { preferWithResponse: true });
  }

  public async setResistanceLevel(level: number): Promise<void> {
    const upperBound = this.maxResistance > 32 ? this.maxResistance : 32;
    const clamped = Math.max(1, Math.min(upperBound, Math.round(level)));
    this.resistance = clamped;
    const sport = this.modelProfile?.sport ?? 'cycling';
    this.callbacks.onReading({
      sport,
      cadenceRpm: this.cadenceRpm,
      resistance: this.resistance,
      ...(sport === 'rowing'
        ? {
            directWatts: this.lastDirectWatts,
            paceSecPer500m: this.lastPaceSec500m,
            directSpeedMps: this.lastSpeedMps,
            strokeCount: this.lastStrokeCount,
          }
        : {}),
      ...(this.maxResistance > 32 ? { maxResistance: this.maxResistance } : {}),
    });

    // 1. Motorized Echelon EX-series bikes (EX-3, EX-4s, EX-4s+, EX-5, EX-5s, EX-7s, EX-8s, EX-Pro)
    if (this.writeChar && (this.modelProfile?.hasMotorizedResistance ?? true)) {
      const echelonLevel = Math.max(1, Math.min(32, clamped));
      if (this.unlockState === 'unlocking') {
        this.pendingResistanceLevel = echelonLevel;
        return;
      }
      await this.writeEchelonResistanceFrame(echelonLevel);
      return;
    }

    // 2. Controllable FTMS smart bikes / trainers / magnetic rowers (0x2AD9 OpCode 0x04)
    if (await this.ensureFtmsControl()) {
      await this.enqueueWrite(new Uint8Array([0x04, clamped & 0xff]), this.ftmsControlChar, {
        preferWithResponse: false,
      });
    }
  }

  /** Sets target treadmill belt speed over FTMS Control Point (0x2AD9 OpCode 0x02, uint16 0.01 km/h). */
  public async setTargetSpeedMph(mph: number): Promise<void> {
    const clampedMph = Math.max(0.5, Math.min(16, Math.round(mph * 10) / 10));
    const speedKmh = clampedMph * 1.609344;
    const speedRaw = Math.max(50, Math.min(2600, Math.round(speedKmh * 100)));
    this.lastSpeedMps = speedKmh / 3.6;

    if (await this.ensureFtmsControl()) {
      const payload = new Uint8Array([0x02, speedRaw & 0xff, (speedRaw >> 8) & 0xff]);
      await this.enqueueWrite(payload, this.ftmsControlChar, { preferWithResponse: false });
    }
  }

  /** Sets target treadmill incline over FTMS Control Point (0x2AD9 OpCode 0x03, sint16 0.1%). */
  public async setTargetInclinePct(inclinePct: number): Promise<void> {
    const clampedPct = Math.max(-3, Math.min(20, Math.round(inclinePct * 2) / 2));
    const raw = Math.round(clampedPct * 10);
    const unsigned = raw < 0 ? 0x10000 + raw : raw;
    this.lastInclinePct = clampedPct;

    if (await this.ensureFtmsControl()) {
      const payload = new Uint8Array([0x03, unsigned & 0xff, (unsigned >> 8) & 0xff]);
      await this.enqueueWrite(payload, this.ftmsControlChar, { preferWithResponse: false });
    }
  }

  private parseEchelonNotification(view: DataView): void {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    if (bytes.length === 0) return;

    // 1. Confirm direct unlock once post-auth traffic arrives (or record early ACK prior to 0xF0 0xB0)
    if (this.unlockState === 'unlocking') {
      if (this.unlockActivationSent && isEchelonPostAuthFrame(bytes, this.unlockExpectedAuthByte)) {
        this.confirmDirectUnlock();
      } else if (
        !this.unlockActivationSent &&
        ((bytes.length === ECHELON_UNLOCK_ACK_FRAME.length &&
          bytes.every((val, idx) => val === ECHELON_UNLOCK_ACK_FRAME[idx])) ||
          isEchoedEchelonUnlockAck(bytes, this.unlockExpectedAuthByte))
      ) {
        this.unlockAuthAckReceived = true;
      }
    } else if (
      this.unlockState === 'failed' &&
      isEchelonPostAuthFrame(bytes, this.unlockExpectedAuthByte)
    ) {
      // Recover automatically if genuine post-auth telemetry starts streaming after an idle timeout
      this.confirmDirectUnlock();
    }

    // 2. Locked Echelon firmware challenge: 8 bytes starting with 0xF0 0xE0
    if (bytes.length === 8 && bytes[0] === 0xf0 && bytes[1] === 0xe0) {
      if (isEchoedEchelonUnlockAck(bytes, this.unlockExpectedAuthByte)) {
        return;
      }
      this.handleDirectUnlockChallenge(bytes);
      return;
    }

    // 3. Resistance notification: 5 bytes [0xF0, 0xD2, ..., level, checksum]
    if (bytes.length === 5 && bytes[0] === 0xf0 && bytes[1] === 0xd2) {
      this.resistance = Math.max(1, Math.min(32, bytes[3]));
      this.callbacks.onReading({
        cadenceRpm: this.cadenceRpm,
        resistance: this.resistance,
      });
      return;
    }

    // 4. Telemetry notification: 13 bytes [0xF0, 0xD1, ..., cadence at index 10, ...]
    if (bytes.length === 13 && bytes[0] === 0xf0) {
      this.cadenceRpm = bytes[10];
      this.lastPedalPacketAt = Date.now();
      this.callbacks.onReading({
        cadenceRpm: this.cadenceRpm,
        resistance: this.resistance,
      });
    }
  }

  private parseFtmsNotification(view: DataView): void {
    if (view.byteLength < 4) return;
    const flags = view.getUint16(0, true);
    let offset = 2;

    // Bit 0 = 0 means Instantaneous Speed is present (uint16, 0.01 km/h)
    if ((flags & 0x0001) === 0) {
      offset += 2;
    }
    // Bit 1 = Average Speed present
    if (flags & 0x0002) {
      offset += 2;
    }
    // Bit 2 = Instantaneous Cadence present (uint16, 0.5 rpm resolution)
    if (flags & 0x0004 && offset + 2 <= view.byteLength) {
      this.cadenceRpm = Math.round(view.getUint16(offset, true) * 0.5);
      offset += 2;
    }
    // Bit 3 = Average Cadence
    if (flags & 0x0008) {
      offset += 2;
    }
    // Bit 4 = Total Distance (uint24)
    if (flags & 0x0010) {
      offset += 3;
    }
    // Bit 5 = Resistance Level (sint16; 1-32 on some bikes, 1-100 on IC4/C6/Keiser)
    if (flags & 0x0020 && offset + 2 <= view.byteLength) {
      const rawRes = view.getInt16(offset, true);
      if (rawRes > 32) {
        this.maxResistance = 100;
      }
      this.resistance = Math.max(1, Math.min(this.maxResistance, rawRes));
      offset += 2;
    }
    // Bit 6 = Instantaneous Power (sint16)
    let directWatts: number | undefined;
    if (flags & 0x0040 && offset + 2 <= view.byteLength) {
      directWatts = Math.max(0, view.getInt16(offset, true));
    }

    this.lastPedalPacketAt = Date.now();
    this.callbacks.onReading({
      cadenceRpm: this.cadenceRpm,
      resistance: this.resistance,
      directWatts,
      ...(this.maxResistance > 32 ? { maxResistance: this.maxResistance } : {}),
    });
  }

  private parseCpsNotification(view: DataView): void {
    const parsed = parseCpsMeasurement(view, this.prevCrankSample);
    if (!parsed) return;
    this.prevCrankSample = parsed.nextSample;
    if (parsed.cadenceRpm !== null) {
      this.cadenceRpm = parsed.cadenceRpm;
    }
    if (parsed.watts > 0 || parsed.cadenceRpm !== null) {
      this.lastPedalPacketAt = Date.now();
    }
    this.callbacks.onReading({
      cadenceRpm: this.cadenceRpm,
      resistance: this.resistance,
      directWatts: parsed.watts,
    });
  }

  private parseCscNotification(view: DataView): void {
    const parsed = parseCscMeasurement(view, this.prevCrankSample);
    if (!parsed) return;
    this.prevCrankSample = parsed.nextSample;
    if (parsed.cadenceRpm !== null) {
      this.cadenceRpm = parsed.cadenceRpm;
      this.lastPedalPacketAt = Date.now();
      this.callbacks.onReading({
        sport: 'cycling',
        cadenceRpm: this.cadenceRpm,
        resistance: this.resistance,
      });
    }
  }

  private parseFtmsTreadmillNotification(view: DataView): void {
    const parsed = parseFtmsTreadmillData(view);
    if (!parsed) return;

    if (parsed.speedMps !== undefined) {
      this.lastSpeedMps = parsed.speedMps;
    }
    if (parsed.inclinePct !== undefined) {
      this.lastInclinePct = parsed.inclinePct;
    }
    if (parsed.powerWatts !== undefined) {
      this.lastDirectWatts = parsed.powerWatts;
    }

    this.lastPedalPacketAt = Date.now();
    this.callbacks.onReading({
      sport: 'running',
      cadenceRpm: this.cadenceRpm,
      resistance: this.resistance,
      directSpeedMps: this.lastSpeedMps,
      inclinePct: this.lastInclinePct,
      ...(this.lastDirectWatts !== undefined ? { directWatts: this.lastDirectWatts } : {}),
      ...(parsed.totalDistanceMeters !== undefined
        ? { deviceDistanceMeters: parsed.totalDistanceMeters }
        : {}),
      ...(parsed.heartRateBpm !== undefined ? { machineHeartRateBpm: parsed.heartRateBpm } : {}),
    });
  }

  private parseFtmsRowerNotification(view: DataView): void {
    const parsed = parseFtmsRowerData(view);
    if (!parsed) return;

    if (parsed.strokeRateSpm !== undefined) {
      this.cadenceRpm = parsed.strokeRateSpm;
    }
    if (parsed.strokeCount !== undefined) {
      this.lastStrokeCount = parsed.strokeCount;
    }
    if (parsed.resistanceLevel !== undefined) {
      if (parsed.resistanceLevel > this.maxResistance) {
        this.maxResistance = Math.min(100, Math.max(32, parsed.resistanceLevel));
      }
      this.resistance = Math.max(0, parsed.resistanceLevel);
    }

    // Reconcile pace (/500m) and power (W) using Concept2 erg physics when a rower reports only one
    if (parsed.powerWatts !== undefined) {
      this.lastDirectWatts = parsed.powerWatts;
    }
    if (parsed.paceSecPer500m !== undefined) {
      this.lastPaceSec500m = parsed.paceSecPer500m;
    }

    let watts = this.lastDirectWatts;
    let paceSecPer500m = this.lastPaceSec500m;

    if ((watts === undefined || watts === 0) && paceSecPer500m > 30 && paceSecPer500m < 600) {
      watts = rowingSplitSecPer500mToWatts(paceSecPer500m);
      this.lastDirectWatts = watts;
    } else if ((!paceSecPer500m || paceSecPer500m <= 0) && typeof watts === 'number' && watts > 1) {
      paceSecPer500m = Math.round(rowingWattsToSplitSecPer500m(watts));
      this.lastPaceSec500m = paceSecPer500m;
    }

    if (this.cadenceRpm === 0 && (watts ?? 0) === 0 && paceSecPer500m === 0) {
      this.lastSpeedMps = 0;
    } else if (paceSecPer500m > 30 && paceSecPer500m < 600) {
      this.lastSpeedMps = rowingSplitToSpeedMps(paceSecPer500m);
    } else {
      this.lastSpeedMps = 0;
    }

    this.lastPedalPacketAt = Date.now();
    this.callbacks.onReading({
      sport: 'rowing',
      cadenceRpm: this.cadenceRpm,
      resistance: this.resistance,
      directWatts: watts ?? 0,
      paceSecPer500m,
      directSpeedMps: this.lastSpeedMps,
      strokeCount: this.lastStrokeCount,
      ...(parsed.totalDistanceMeters !== undefined
        ? { deviceDistanceMeters: parsed.totalDistanceMeters }
        : {}),
      ...(parsed.heartRateBpm !== undefined ? { machineHeartRateBpm: parsed.heartRateBpm } : {}),
      ...(this.maxResistance > 32 ? { maxResistance: this.maxResistance } : {}),
    });
  }

  private parseRscNotification(view: DataView): void {
    const parsed = parseRscMeasurement(view);
    if (!parsed) return;

    this.lastSpeedMps = parsed.speedMps;
    this.cadenceRpm = parsed.cadenceSpm;
    this.lastPedalPacketAt = Date.now();
    this.callbacks.onReading({
      sport: 'running',
      cadenceRpm: this.cadenceRpm,
      resistance: this.resistance,
      directSpeedMps: this.lastSpeedMps,
      inclinePct: this.lastInclinePct,
      ...(parsed.totalDistanceMeters !== undefined
        ? { deviceDistanceMeters: parsed.totalDistanceMeters }
        : {}),
    });
  }

  private async handleUnexpectedDisconnect(): Promise<void> {
    this.gattSessionId++;
    this.echelonSessionReady = false;
    this.resetDirectUnlockState();
    this.clearTimers();
    if (this.manualDisconnect || !this.device) {
      this.callbacks.onStatusChange('disconnected', null, undefined, null, 'idle');
      return;
    }

    const label = this.device.name || this.modelProfile?.displayName || 'Fitness Machine';
    this.callbacks.onStatusChange(
      'reconnecting',
      label,
      `Reconnecting to ${label}...`,
      this.modelProfile,
      'idle'
    );

    const delays = [900, 1800, 3000, 4500];
    for (const delay of delays) {
      if (this.manualDisconnect || !this.device) return;
      await sleep(delay);
      try {
        await this.establishGattSession(this.device);
        return;
      } catch {
        // Try next backoff interval
      }
    }

    this.modelProfile = null;
    this.callbacks.onStatusChange(
      'disconnected',
      null,
      `Lost Bluetooth connection to ${label}.`,
      null,
      'idle'
    );
  }

  private clearTimers(): void {
    this.clearUnlockTimers();
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.zeroCadenceWatchdog !== null) {
      window.clearInterval(this.zeroCadenceWatchdog);
      this.zeroCadenceWatchdog = null;
    }
  }

  private cleanupListeners(): void {
    for (const ch of this.notifyChars) {
      ch.removeEventListener('characteristicvaluechanged', this.boundHandleNotify);
      ch.removeEventListener('characteristicvaluechanged', this.boundHandleFtms);
      ch.removeEventListener('characteristicvaluechanged', this.boundHandleFtmsTreadmill);
      ch.removeEventListener('characteristicvaluechanged', this.boundHandleFtmsRower);
      ch.removeEventListener('characteristicvaluechanged', this.boundHandleCps);
      ch.removeEventListener('characteristicvaluechanged', this.boundHandleCsc);
      ch.removeEventListener('characteristicvaluechanged', this.boundHandleRsc);
    }
    this.notifyChars = [];
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.boundHandleDisconnect);
    }
  }

  public disconnect(): void {
    this.connectAttemptId++;
    this.gattSessionId++;
    this.echelonSessionReady = false;
    this.manualDisconnect = true;
    this.resetDirectUnlockState();
    this.clearTimers();
    this.cleanupListeners();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.writeChar = null;
    this.ftmsControlChar = null;
    this.ftmsControlGranted = false;
    this.modelProfile = null;
    this.prevCrankSample = null;
    this.cadenceRpm = 0;
    this.lastSpeedMps = 0;
    this.lastInclinePct = 0;
    this.lastPaceSec500m = 0;
    this.lastDirectWatts = undefined;
    this.lastStrokeCount = 0;
    this.callbacks.onStatusChange('disconnected', null, undefined, null, 'idle');
  }
}

export { EchelonBikeConnection as StationaryBikeConnection };
