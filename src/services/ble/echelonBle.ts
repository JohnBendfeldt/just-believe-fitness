import type { BikeFamilyId } from '../../types/fitness';

export const ECHELON_ADV_SERVICE = '0bf669f0-45f2-11e7-9598-0800200c9a66';
export const ECHELON_COMM_SERVICE = '0bf669f1-45f2-11e7-9598-0800200c9a66';
export const ECHELON_WRITE_CHAR = '0bf669f2-45f2-11e7-9598-0800200c9a66';
export const ECHELON_NOTIFY_1_CHAR = '0bf669f3-45f2-11e7-9598-0800200c9a66';
export const ECHELON_NOTIFY_2_CHAR = '0bf669f4-45f2-11e7-9598-0800200c9a66';

export const FTMS_SERVICE = 0x1826;
export const FTMS_INDOOR_BIKE_DATA = 0x2ad2;
export const FTMS_CONTROL_POINT = 0x2ad9;
export const CYCLING_POWER_SERVICE = 0x1818;
export const CYCLING_POWER_MEASUREMENT = 0x2a63;
export const CYCLING_SPEED_CADENCE_SERVICE = 0x1816;
export const CSC_MEASUREMENT = 0x2a5b;

const COMMON_BIKE_NAME_PREFIXES = [
  'ECH',
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
  'PM5',
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

export type BikeProtocolKind = 'echelon' | 'ftms' | 'cps' | 'csc';

export interface BikeModelProfile {
  family: BikeFamilyId;
  protocol: BikeProtocolKind;
  shortLabel: string;
  displayName: string;
  hasMotorizedResistance: boolean;
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
}

export type BikeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface EchelonBleCallbacks {
  onReading: (reading: EchelonRawReading) => void;
  onStatusChange: (
    status: BikeConnectionStatus,
    deviceName: string | null,
    message?: string,
    modelProfile?: BikeModelProfile | null
  ) => void;
}

/**
 * Identifies the stationary bike brand/model family and resistance capabilities
 * from its Bluetooth name and connected GATT protocol.
 */
export function detectBikeModelProfile(
  deviceName: string | null | undefined,
  protocol: BikeProtocolKind = 'echelon',
  hasFtmsControl = false
): BikeModelProfile {
  const raw = (deviceName ?? '').trim();
  const upper = raw.toUpperCase();

  if (protocol === 'echelon' || upper.startsWith('ECH')) {
    if (upper.includes('SPORT-S') || upper.includes('SPORTS')) {
      return {
        family: 'echelon-sport-knob',
        protocol: 'echelon',
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
        shortLabel: 'EX-1',
        displayName: 'Echelon EX-1',
        hasMotorizedResistance: false,
        recommendedCurve: 'sport-compact',
      };
    }
    if (upper.includes('EX8') || upper.includes('EX-8')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
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
        shortLabel: 'EX-5',
        displayName: 'Echelon EX-5',
        hasMotorizedResistance: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    if (upper.includes('EX4') || upper.includes('EX-4')) {
      return {
        family: 'echelon-ex-motorized',
        protocol: 'echelon',
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
        shortLabel: 'EX-3',
        displayName: 'Echelon EX-3',
        hasMotorizedResistance: true,
        recommendedCurve: 'ex3-vector',
      };
    }
    return {
      family: 'echelon-ex-motorized',
      protocol: 'echelon',
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
      shortLabel,
      displayName: raw || 'Bluetooth Power Meter',
      hasMotorizedResistance: false,
      recommendedCurve: 'ex3-vector',
    };
  }

  return {
    family: 'cadence-bike',
    protocol: 'csc',
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
 * Computes the challenge-response frame for 2023-2024 Echelon bike firmware (0xF0 0xE0 frames),
 * based on the protocol documented by Christian Emerson (@christianbemerson).
 */
export function computeEchelonUnlockResponse(challenge: Uint8Array): Uint8Array | null {
  if (challenge.length !== 8 || challenge[0] !== 0xf0 || challenge[1] !== 0xe0) {
    return null;
  }
  const a = parseLeadingDecimalDigitsFromHex([challenge[4], challenge[2]]);
  const b = parseLeadingDecimalDigitsFromHex([challenge[3], challenge[5]]);
  const c = parseLeadingDecimalDigitsFromHex([challenge[6]]);
  if (a === null || b === null || c === null || c === 0) {
    return null;
  }
  const authVal = (a * b) % c;
  if (authVal < 0 || authVal > 99) {
    return null;
  }
  const packedBcd = ((Math.floor(authVal / 10) & 0x0f) << 4) | (authVal % 10);
  const frame = new Uint8Array([0xf0, 0xe0, 0x00, 0x00, packedBcd, 0x00, 0x00, 0x00]);
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum = (sum + frame[i]) & 0xff;
  }
  frame[7] = sum;
  return frame;
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
  private unlockInProgress = false;
  private unlockSucceeded = false;
  private cadenceRpm = 0;
  private resistance = 1;
  private maxResistance = 32;
  private prevCrankSample: CrankSample | null = null;
  private lastPedalPacketAt = 0;
  private zeroCadenceWatchdog: number | null = null;
  private readonly callbacks: EchelonBleCallbacks;

  private readonly boundHandleDisconnect: () => void;
  private readonly boundHandleNotify: (ev: Event) => void;
  private readonly boundHandleFtms: (ev: Event) => void;
  private readonly boundHandleCps: (ev: Event) => void;
  private readonly boundHandleCsc: (ev: Event) => void;

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
  }

  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public getModelProfile(): BikeModelProfile | null {
    return this.modelProfile;
  }

  public async requestAndConnect(options?: { acceptAllDevices?: boolean }): Promise<void> {
    if (!EchelonBikeConnection.isSupported()) {
      throw new Error(
        'Web Bluetooth is not available in this browser. Open Just Believe Fitness in Chrome on your Android phone/tablet or desktop.'
      );
    }

    this.manualDisconnect = false;
    this.callbacks.onStatusChange('connecting', null, undefined, null);

    const optionalServices: BluetoothServiceUUID[] = [
      ECHELON_ADV_SERVICE,
      ECHELON_COMM_SERVICE,
      FTMS_SERVICE,
      CYCLING_POWER_SERVICE,
      CYCLING_SPEED_CADENCE_SERVICE,
      'device_information',
      'battery_service',
    ];

    const device = options?.acceptAllDevices
      ? await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices,
        })
      : await navigator.bluetooth.requestDevice({
          filters: [
            { services: [ECHELON_ADV_SERVICE] },
            { services: [ECHELON_COMM_SERVICE] },
            { services: [FTMS_SERVICE] },
            { services: [CYCLING_POWER_SERVICE] },
            { services: [CYCLING_SPEED_CADENCE_SERVICE] },
            ...COMMON_BIKE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
          ],
          optionalServices,
        });

    if (this.device) {
      this.cleanupListeners();
    }

    this.device = device;
    device.addEventListener('gattserverdisconnected', this.boundHandleDisconnect);
    await this.establishGattSession(device);
  }

  private async establishGattSession(device: BluetoothDevice): Promise<void> {
    if (!device.gatt) {
      throw new Error('Selected Bluetooth device does not expose a GATT server.');
    }

    this.clearTimers();
    this.unlockInProgress = false;
    this.unlockSucceeded = false;
    this.writeChar = null;
    this.ftmsControlChar = null;
    this.ftmsControlGranted = false;
    this.prevCrankSample = null;
    this.maxResistance = 32;
    this.notifyChars = [];

    const server = await device.gatt.connect();

    // 1. Try native Echelon GATT channel first (Connect Sport, EX-15, Prime, GT+, EX-1/3/4s/5/5s/7s/8s)
    try {
      const echelonService = await server.getPrimaryService(ECHELON_COMM_SERVICE);
      this.writeChar = await echelonService.getCharacteristic(ECHELON_WRITE_CHAR);

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

      this.modelProfile = detectBikeModelProfile(device.name, 'echelon');
      const label = device.name || this.modelProfile.displayName;

      // Brief listen window for 2023-2024 0xF0 0xE0 challenge before classic handshake
      await sleep(260);
      if (!this.unlockInProgress && !this.unlockSucceeded) {
        await this.sendClassicHandshake();
      }

      this.startKeepalivePoll();
      this.startCadenceWatchdog();
      this.callbacks.onStatusChange('connected', label, undefined, this.modelProfile);
      return;
    } catch {
      // Fall through to standard FTMS / Cycling Power / CSC if paired with a non-Echelon bike
    }

    // 2. Standard FTMS Indoor Bike (0x1826) — Schwinn IC4, Bowflex C6, Yesoul, Merach, Domyos, Keiser, Wahoo, etc.
    try {
      const ftms = await server.getPrimaryService(FTMS_SERVICE);
      const bikeData = await ftms.getCharacteristic(FTMS_INDOOR_BIKE_DATA);
      bikeData.addEventListener('characteristicvaluechanged', this.boundHandleFtms);
      await bikeData.startNotifications();
      this.notifyChars.push(bikeData);

      let hasFtmsControl = false;
      try {
        const ctrl = await ftms.getCharacteristic(FTMS_CONTROL_POINT);
        if (ctrl && ctrl !== bikeData) {
          this.ftmsControlChar = ctrl;
          hasFtmsControl = true;
        }
      } catch {
        // Manual-knob FTMS bikes (e.g. Schwinn IC4 / Bowflex C6) do not expose a motorized control point
      }

      this.modelProfile = detectBikeModelProfile(device.name, 'ftms', hasFtmsControl);
      const label = device.name || this.modelProfile.displayName;
      this.startCadenceWatchdog();
      this.callbacks.onStatusChange('connected', label, undefined, this.modelProfile);
      return;
    } catch {
      // Fall through to Cycling Power
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
      this.callbacks.onStatusChange('connected', label, undefined, this.modelProfile);
      return;
    } catch {
      // Fall through to Cycling Speed & Cadence
    }

    // 4. Standard Cycling Speed & Cadence Service (0x1816) — Wahoo/Garmin/Magene/Coospo cadence pods on any spin bike
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
    this.callbacks.onStatusChange('connected', label, undefined, this.modelProfile);
  }

  private enqueueWrite(
    payload: Uint8Array,
    targetChar?: BluetoothRemoteGATTCharacteristic | null
  ): Promise<void> {
    this.writeChain = this.writeChain
      .then(async () => {
        const ch = targetChar ?? this.writeChar;
        if (!ch) return;
        const buf = new Uint8Array(payload);
        if (ch.properties.writeWithoutResponse) {
          await ch.writeValueWithoutResponse(buf);
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

  private async sendClassicHandshake(): Promise<void> {
    const initA1 = new Uint8Array([0xf0, 0xa1, 0x00, 0x91]);
    const initA3 = new Uint8Array([0xf0, 0xa3, 0x00, 0x93]);
    const activateB0 = new Uint8Array([0xf0, 0xb0, 0x01, 0x01, 0xa2]);

    await this.enqueueWrite(initA1);
    await this.enqueueWrite(initA1);
    await this.enqueueWrite(initA1);
    await this.enqueueWrite(initA1);
    await this.enqueueWrite(initA3);
    await this.enqueueWrite(initA1);
    if (!this.unlockInProgress && !this.unlockSucceeded) {
      await this.enqueueWrite(activateB0);
    }
  }

  private startKeepalivePoll(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
    }
    this.pollCounter = 1;
    this.pollTimer = window.setInterval(() => {
      if (this.unlockInProgress) return;
      const frame = new Uint8Array([0xf0, 0xa0, 0x01, this.pollCounter, 0x00]);
      frame[4] = (frame[0] + frame[1] + frame[2] + frame[3]) & 0xff;
      void this.enqueueWrite(frame);
      this.pollCounter = (this.pollCounter % 255) + 1;
    }, 2000);
  }

  private startCadenceWatchdog(): void {
    if (this.zeroCadenceWatchdog !== null) {
      window.clearInterval(this.zeroCadenceWatchdog);
    }
    this.zeroCadenceWatchdog = window.setInterval(() => {
      if (this.cadenceRpm > 0 && Date.now() - this.lastPedalPacketAt > 4000) {
        this.cadenceRpm = 0;
        this.callbacks.onReading({
          cadenceRpm: 0,
          resistance: this.resistance,
          ...(this.maxResistance > 32 ? { maxResistance: this.maxResistance } : {}),
        });
      }
    }, 1500);
  }

  public async setResistanceLevel(level: number): Promise<void> {
    const upperBound = this.maxResistance > 32 ? this.maxResistance : 32;
    const clamped = Math.max(1, Math.min(upperBound, Math.round(level)));
    this.resistance = clamped;
    this.callbacks.onReading({
      cadenceRpm: this.cadenceRpm,
      resistance: this.resistance,
      ...(this.maxResistance > 32 ? { maxResistance: this.maxResistance } : {}),
    });

    // 1. Motorized Echelon EX-series bikes (EX-3, EX-4s, EX-5, EX-5s, EX-7s, EX-8s)
    if (this.writeChar && (this.modelProfile?.hasMotorizedResistance ?? true)) {
      const echelonLevel = Math.max(1, Math.min(32, clamped));
      const frame = new Uint8Array([0xf0, 0xb1, 0x01, echelonLevel, 0x00]);
      frame[4] = (frame[0] + frame[1] + frame[2] + frame[3]) & 0xff;
      await this.enqueueWrite(frame);
      return;
    }

    // 2. Controllable FTMS smart bikes / trainers (0x2AD9 Request Control + Set Target Resistance)
    if (this.ftmsControlChar) {
      if (!this.ftmsControlGranted) {
        await this.enqueueWrite(new Uint8Array([0x00]), this.ftmsControlChar);
        this.ftmsControlGranted = true;
      }
      await this.enqueueWrite(new Uint8Array([0x04, clamped & 0xff]), this.ftmsControlChar);
    }
  }

  private parseEchelonNotification(view: DataView): void {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    if (bytes.length === 0) return;

    // 2023-2024 Echelon firmware challenge: 8 bytes starting with 0xF0 0xE0
    if (bytes.length === 8 && bytes[0] === 0xf0 && bytes[1] === 0xe0) {
      const response = computeEchelonUnlockResponse(bytes);
      if (response && !this.unlockInProgress && !this.unlockSucceeded) {
        this.unlockInProgress = true;
        void this.enqueueWrite(response).then(async () => {
          await sleep(500);
          await this.enqueueWrite(new Uint8Array([0xf0, 0xb0, 0x01, 0x01, 0xa2]));
          this.unlockInProgress = false;
          this.unlockSucceeded = true;
        });
      }
      return;
    }

    // Resistance notification: 5 bytes [0xF0, 0xD2, ..., level, checksum]
    if (bytes.length === 5 && bytes[0] === 0xf0 && bytes[1] === 0xd2) {
      this.resistance = Math.max(1, Math.min(32, bytes[3]));
      this.callbacks.onReading({
        cadenceRpm: this.cadenceRpm,
        resistance: this.resistance,
      });
      return;
    }

    // Telemetry notification: 13 bytes [0xF0, 0xD1, ..., cadence at index 10, ...]
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
        cadenceRpm: this.cadenceRpm,
        resistance: this.resistance,
      });
    }
  }

  private async handleUnexpectedDisconnect(): Promise<void> {
    this.clearTimers();
    if (this.manualDisconnect || !this.device) {
      this.callbacks.onStatusChange('disconnected', null, undefined, null);
      return;
    }

    const label = this.device.name || this.modelProfile?.displayName || 'Stationary Bike';
    this.callbacks.onStatusChange(
      'reconnecting',
      label,
      `Reconnecting to ${label}...`,
      this.modelProfile
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
      null
    );
  }

  private clearTimers(): void {
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
      ch.removeEventListener('characteristicvaluechanged', this.boundHandleCps);
      ch.removeEventListener('characteristicvaluechanged', this.boundHandleCsc);
    }
    this.notifyChars = [];
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.boundHandleDisconnect);
    }
  }

  public disconnect(): void {
    this.manualDisconnect = true;
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
    this.callbacks.onStatusChange('disconnected', null, undefined, null);
  }
}

export { EchelonBikeConnection as StationaryBikeConnection };
