const HEART_RATE_SERVICE = 0x180d;
const HEART_RATE_MEASUREMENT = 0x2a37;

export type HrConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface GarminHrCallbacks {
  onHeartRate: (bpm: number) => void;
  onStatusChange: (status: HrConnectionStatus, deviceName: string | null, message?: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Parses standard Bluetooth SIG Heart Rate Measurement (0x2A37) characteristic payload.
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
  private readonly callbacks: GarminHrCallbacks;

  private readonly boundHandleDisconnect: () => void;
  private readonly boundHandleValue: (ev: Event) => void;

  constructor(callbacks: GarminHrCallbacks) {
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
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public async requestAndConnect(): Promise<void> {
    if (!GarminHeartRateConnection.isSupported()) {
      throw new Error(
        'Web Bluetooth is not available in this browser. Open Just Believe Fitness in Chrome on your Android phone/tablet or desktop.'
      );
    }

    this.manualDisconnect = false;
    this.callbacks.onStatusChange('connecting', null);

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [HEART_RATE_SERVICE] }],
      optionalServices: [HEART_RATE_SERVICE, 'battery_service'],
    });

    if (this.device) {
      this.cleanupListeners();
    }

    this.device = device;
    device.addEventListener('gattserverdisconnected', this.boundHandleDisconnect);
    await this.establishSession(device);
  }

  private async establishSession(device: BluetoothDevice): Promise<void> {
    if (!device.gatt) {
      throw new Error('Selected heart rate device does not expose GATT.');
    }

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(HEART_RATE_SERVICE);
    const char = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
    char.addEventListener('characteristicvaluechanged', this.boundHandleValue);
    await char.startNotifications();
    this.hrChar = char;

    this.callbacks.onStatusChange('connected', device.name || 'Garmin HR');
  }

  private async handleUnexpectedDisconnect(): Promise<void> {
    if (this.manualDisconnect || !this.device) {
      this.callbacks.onStatusChange('disconnected', null);
      return;
    }

    const name = this.device.name || 'Garmin HR';
    this.callbacks.onStatusChange('reconnecting', name, 'Reconnecting to Garmin HR...');

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

    this.callbacks.onStatusChange('disconnected', null, 'Garmin heart rate broadcast disconnected.');
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
    this.manualDisconnect = true;
    this.cleanupListeners();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.callbacks.onStatusChange('disconnected', null);
  }
}
