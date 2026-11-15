export const ECHELON_ADV_SERVICE = '0bf669f0-45f2-11e7-9598-0800200c9a66';
export const ECHELON_COMM_SERVICE = '0bf669f1-45f2-11e7-9598-0800200c9a66';
export const ECHELON_WRITE_CHAR = '0bf669f2-45f2-11e7-9598-0800200c9a66';
export const ECHELON_NOTIFY_1_CHAR = '0bf669f3-45f2-11e7-9598-0800200c9a66';
export const ECHELON_NOTIFY_2_CHAR = '0bf669f4-45f2-11e7-9598-0800200c9a66';

const FTMS_SERVICE = 0x1826;
const FTMS_INDOOR_BIKE_DATA = 0x2ad2;
const CYCLING_POWER_SERVICE = 0x1818;
const CYCLING_POWER_MEASUREMENT = 0x2a63;

export interface EchelonRawReading {
  cadenceRpm: number;
  resistance: number;
  directWatts?: number;
}

export type BikeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface EchelonBleCallbacks {
  onReading: (reading: EchelonRawReading) => void;
  onStatusChange: (status: BikeConnectionStatus, deviceName: string | null, message?: string) => void;
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
 * Computes the challenge-response frame for post-update Echelon bike firmware (0xF0 0xE0 frames),
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
  private notifyChars: BluetoothRemoteGATTCharacteristic[] = [];
  private pollTimer: number | null = null;
  private pollCounter = 1;
  private writeChain: Promise<void> = Promise.resolve();
  private manualDisconnect = false;
  private unlockInProgress = false;
  private unlockSucceeded = false;
  private cadenceRpm = 0;
  private resistance = 1;
  private lastPedalPacketAt = 0;
  private zeroCadenceWatchdog: number | null = null;
  private readonly callbacks: EchelonBleCallbacks;

  private readonly boundHandleDisconnect: () => void;
  private readonly boundHandleNotify: (ev: Event) => void;
  private readonly boundHandleFtms: (ev: Event) => void;
  private readonly boundHandleCps: (ev: Event) => void;

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
  }

  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public async requestAndConnect(): Promise<void> {
    if (!EchelonBikeConnection.isSupported()) {
      throw new Error(
        'Web Bluetooth is not available in this browser. Open Just Believe Fitness in Chrome on your Android phone/tablet or desktop.'
      );
    }

    this.manualDisconnect = false;
    this.callbacks.onStatusChange('connecting', null);

    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'ECH' },
        { services: [ECHELON_ADV_SERVICE] },
        { services: [ECHELON_COMM_SERVICE] },
        { services: [FTMS_SERVICE] },
        { services: [CYCLING_POWER_SERVICE] },
      ],
      optionalServices: [
        ECHELON_ADV_SERVICE,
        ECHELON_COMM_SERVICE,
        FTMS_SERVICE,
        CYCLING_POWER_SERVICE,
      ],
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
    this.notifyChars = [];

    const server = await device.gatt.connect();
    const label = device.name || 'Echelon EX-3';

    // 1. Try native Echelon proprietary GATT channel first (EX-3 / EX-5 / Connect Sport)
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

      // Brief listen window for post-update 0xF0 0xE0 challenge before classic handshake
      await sleep(260);
      if (!this.unlockInProgress && !this.unlockSucceeded) {
        await this.sendClassicHandshake();
      }

      this.startKeepalivePoll();
      this.startCadenceWatchdog();
      this.callbacks.onStatusChange('connected', label);
      return;
    } catch {
      // Fall through to standard FTMS / Cycling Power if paired with a standard BLE trainer
    }

    // 2. Fallback: Standard FTMS Indoor Bike (0x1826)
    try {
      const ftms = await server.getPrimaryService(FTMS_SERVICE);
      const bikeData = await ftms.getCharacteristic(FTMS_INDOOR_BIKE_DATA);
      bikeData.addEventListener('characteristicvaluechanged', this.boundHandleFtms);
      await bikeData.startNotifications();
      this.notifyChars.push(bikeData);
      this.startCadenceWatchdog();
      this.callbacks.onStatusChange('connected', label);
      return;
    } catch {
      // Fall through to Cycling Power
    }

    // 3. Fallback: Standard Cycling Power Service (0x1818)
    const cps = await server.getPrimaryService(CYCLING_POWER_SERVICE);
    const cpChar = await cps.getCharacteristic(CYCLING_POWER_MEASUREMENT);
    cpChar.addEventListener('characteristicvaluechanged', this.boundHandleCps);
    await cpChar.startNotifications();
    this.notifyChars.push(cpChar);
    this.startCadenceWatchdog();
    this.callbacks.onStatusChange('connected', label);
  }

  private enqueueWrite(payload: Uint8Array): Promise<void> {
    this.writeChain = this.writeChain
      .then(async () => {
        const ch = this.writeChar;
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
        });
      }
    }, 1500);
  }

  public async setResistanceLevel(level: number): Promise<void> {
    const clamped = Math.max(1, Math.min(32, Math.round(level)));
    this.resistance = clamped;
    this.callbacks.onReading({
      cadenceRpm: this.cadenceRpm,
      resistance: this.resistance,
    });

    if (this.writeChar) {
      const frame = new Uint8Array([0xf0, 0xb1, 0x01, clamped, 0x00]);
      frame[4] = (frame[0] + frame[1] + frame[2] + frame[3]) & 0xff;
      await this.enqueueWrite(frame);
    }
  }

  private parseEchelonNotification(view: DataView): void {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    if (bytes.length === 0) return;

    // Post-update Echelon firmware challenge: 8 bytes starting with 0xF0 0xE0
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
    // Bit 5 = Resistance Level (sint16)
    if (flags & 0x0020 && offset + 2 <= view.byteLength) {
      this.resistance = Math.max(1, Math.min(32, view.getInt16(offset, true)));
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
    });
  }

  private parseCpsNotification(view: DataView): void {
    if (view.byteLength < 4) return;
    const watts = Math.max(0, view.getInt16(2, true));
    this.lastPedalPacketAt = Date.now();
    this.callbacks.onReading({
      cadenceRpm: this.cadenceRpm,
      resistance: this.resistance,
      directWatts: watts,
    });
  }

  private async handleUnexpectedDisconnect(): Promise<void> {
    this.clearTimers();
    if (this.manualDisconnect || !this.device) {
      this.callbacks.onStatusChange('disconnected', null);
      return;
    }

    const label = this.device.name || 'Echelon EX-3';
    this.callbacks.onStatusChange('reconnecting', label, 'Reconnecting to Echelon EX-3...');

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

    this.callbacks.onStatusChange('disconnected', null, 'Lost Bluetooth connection to Echelon EX-3.');
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
    this.cadenceRpm = 0;
    this.callbacks.onStatusChange('disconnected', null);
  }
}
