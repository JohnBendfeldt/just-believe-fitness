import { getBluetoothUnsupportedMessage } from '../../utils/browserSupport';
import { isBleTransportSupported, requestBleDevice } from './bleTransport';
const HEART_RATE_SERVICE = 0x180d;
const HEART_RATE_MEASUREMENT = 0x2a37;

const COMMON_HR_NAME_PREFIXES = [
  'Garmin',
  'HRM',
  'Polar',
  'TICKR',
  'Wahoo',
  'WHOOP',
  'COROS',
  'Coospo',
  'HW',
  'Magene',
  'Scosche',
  'Rhythm',
  'Suunto',
  'Fitcent',
  'POWR',
];

export type HrConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface BleHrCallbacks {
  onHeartRate: (bpm: number) => void;
  onStatusChange: (status: HrConnectionStatus, deviceName: string | null, message?: string) => void;
}

export type GarminHrCallbacks = BleHrCallbacks;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Parses standard Bluetooth SIG Heart Rate Measurement (0x2A37) characteristic payload.
 * Works universally across Garmin, Polar, Wahoo TICKR, WHOOP, COROS, Coospo, Suunto, etc.
 * Bit 0 of flags indicates uint8 (0) vs uint16 little-endian (1) BPM format.
 */
export function parseBleHeartRate(view: DataView): number {
  if (view.byteLength < 2) return 0;
  const flags = view.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;
  if (is16Bit && view.byteLength >= 3) {
    return view.getUint16(1, true);
  }
  return view.getUint8(1);
}

export class GarminHeartRateConnection {
  private device: BluetoothDevice | null = null;
  private hrChar: BluetoothRemoteGATTCharacteristic | null = null;
  private manualDisconnect = false;
  private connectAttemptId = 0;
  private readonly callbacks: BleHrCallbacks;

  private readonly boundHandleDisconnect: () => void;
  private readonly boundHandleValue: (ev: Event) => void;

  constructor(callbacks: BleHrCallbacks) {
    this.callbacks = callbacks;
    this.boundHandleDisconnect = () => {
      void this.handleUnexpectedDisconnect();
    };
    this.boundHandleValue = (ev: Event) => {
      const ch = ev.target as BluetoothRemoteGATTCharacteristic | null;
      if (ch?.value) {
        const bpm = parseBleHeartRate(ch.value);
        if (bpm > 25 && bpm < 250) {
          this.callbacks.onHeartRate(bpm);
        }
      }
    };
  }

  public static isSupported(): boolean {
    return isBleTransportSupported();
  }

  public async requestAndConnect(options?: { acceptAllDevices?: boolean }): Promise<void> {
    if (!GarminHeartRateConnection.isSupported()) {
      throw new Error(getBluetoothUnsupportedMessage());
    }

    const attemptId = ++this.connectAttemptId;
    this.manualDisconnect = false;
    this.callbacks.onStatusChange('connecting', null);

    const optionalServices: BluetoothServiceUUID[] = [
      HEART_RATE_SERVICE,
      'battery_service',
      'device_information',
    ];

    try {
      const device = options?.acceptAllDevices
        ? await requestBleDevice({
            acceptAllDevices: true,
            optionalServices,
          })
        : await requestBleDevice({
            filters: [
              { services: [HEART_RATE_SERVICE] },
              ...COMMON_HR_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
            ],
            optionalServices,
          });

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
      await this.establishSession(device);
    } catch (err) {
      if (attemptId === this.connectAttemptId) {
        this.cleanupListeners();
        if (this.device?.gatt?.connected) {
          this.device.gatt.disconnect();
        }
        this.device = null;
        this.callbacks.onStatusChange('disconnected', null);
      }
      throw err;
    }
  }

  private async establishSession(device: BluetoothDevice): Promise<void> {
    if (!device.gatt) {
      throw new Error('Selected heart rate device does not expose GATT.');
    }

    const server = await device.gatt.connect();
    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(HEART_RATE_SERVICE);
    } catch {
      throw new Error(
        `"${device.name || 'Selected device'}" does not expose Bluetooth Heart Rate (0x180D). Make sure HR Broadcast is active on your watch or strap.`
      );
    }

    const char = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
    char.addEventListener('characteristicvaluechanged', this.boundHandleValue);
    await char.startNotifications();
    this.hrChar = char;

    this.callbacks.onStatusChange('connected', device.name || 'BLE Heart Rate');
  }

  private async handleUnexpectedDisconnect(): Promise<void> {
    if (this.manualDisconnect || !this.device) {
      this.callbacks.onStatusChange('disconnected', null);
      return;
    }

    const name = this.device.name || 'BLE Heart Rate';
    this.callbacks.onStatusChange('reconnecting', name, `Reconnecting to ${name}...`);

    for (const delay of [800, 1600, 2800, 4500]) {
      if (this.manualDisconnect || !this.device) return;
      await sleep(delay);
      try {
        await this.establishSession(this.device);
        return;
      } catch {
        // Continue retry loop
      }
    }

    this.callbacks.onStatusChange('disconnected', null, `${name} disconnected.`);
  }

  private cleanupListeners(): void {
    if (this.hrChar) {
      this.hrChar.removeEventListener('characteristicvaluechanged', this.boundHandleValue);
      this.hrChar = null;
    }
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.boundHandleDisconnect);
    }
  }

  public disconnect(): void {
    this.connectAttemptId++;
    this.manualDisconnect = true;
    this.cleanupListeners();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.callbacks.onStatusChange('disconnected', null);
  }
}

export { GarminHeartRateConnection as BleHeartRateConnection };
