import { Capacitor } from '@capacitor/core';
import type {
  BleCharacteristic,
  BleClientInterface,
  BleDevice,
  BleService,
  RequestBleDeviceOptions,
} from '@capacitor-community/bluetooth-le';

const SIG_SERVICE_ALIASES: Record<string, string> = {
  fitness_machine: '00001826-0000-1000-8000-00805f9b34fb',
  cycling_power: '00001818-0000-1000-8000-00805f9b34fb',
  cycling_speed_and_cadence: '00001816-0000-1000-8000-00805f9b34fb',
  running_speed_and_cadence: '00001814-0000-1000-8000-00805f9b34fb',
  heart_rate: '0000180d-0000-1000-8000-00805f9b34fb',
  battery_service: '0000180f-0000-1000-8000-00805f9b34fb',
  device_information: '0000180a-0000-1000-8000-00805f9b34fb',
};

/**
 * Returns true when running inside a native Capacitor shell (iOS App Store / TestFlight or Android),
 * and false in regular browsers, PWAs, Bluefy, and Android TWA.
 */
export function isNativeCapacitorPlatform(): boolean {
  try {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Returns true when Bluetooth sensor pairing is supported via either native Capacitor CoreBluetooth
 * or standard Web Bluetooth (Chrome/Edge on Android/desktop, or Bluefy on iOS).
 */
export function isBleTransportSupported(): boolean {
  if (isNativeCapacitorPlatform()) return true;
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Normalizes 16-bit numbers, 4/8-char hex strings, named Bluetooth SIG service aliases,
 * and mixed-case 128-bit UUIDs into canonical lowercase 128-bit UUID strings required by
 * `@capacitor-community/bluetooth-le` on iOS CoreBluetooth.
 */
export function normalizeBleUuid(uuid: BluetoothServiceUUID | BluetoothCharacteristicUUID): string {
  if (typeof uuid === 'number') {
    const hex = (uuid & 0xffff).toString(16).padStart(4, '0');
    return `0000${hex}-0000-1000-8000-00805f9b34fb`;
  }
  const trimmed = uuid.trim().toLowerCase();
  if (trimmed in SIG_SERVICE_ALIASES) {
    return SIG_SERVICE_ALIASES[trimmed];
  }
  if (/^[0-9a-f]{4}$/.test(trimmed)) {
    return `0000${trimmed}-0000-1000-8000-00805f9b34fb`;
  }
  if (/^[0-9a-f]{8}$/.test(trimmed)) {
    return `${trimmed}-0000-1000-8000-00805f9b34fb`;
  }
  return trimmed;
}

function toDataView(buf: BufferSource): DataView {
  if (buf instanceof DataView) {
    return buf;
  }
  if (ArrayBuffer.isView(buf)) {
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  return new DataView(buf);
}

type EventListenerFn = (ev: Event) => void;

class CapacitorGattCharacteristicAdapter {
  public readonly uuid: string;
  public readonly properties: BluetoothCharacteristicProperties;
  public value: DataView | null = null;
  private readonly listeners = new Map<string, Set<EventListenerFn>>();
  private notifying = false;

  private readonly bleClient: BleClientInterface;
  private readonly deviceId: string;
  private readonly serviceUuid: string;
  private readonly onNotifyStarted: (ch: CapacitorGattCharacteristicAdapter) => void;

  constructor(
    bleClient: BleClientInterface,
    deviceId: string,
    serviceUuid: string,
    characteristic: BleCharacteristic,
    onNotifyStarted: (ch: CapacitorGattCharacteristicAdapter) => void
  ) {
    this.bleClient = bleClient;
    this.deviceId = deviceId;
    this.serviceUuid = serviceUuid;
    this.onNotifyStarted = onNotifyStarted;
    this.uuid = normalizeBleUuid(characteristic.uuid);
    const p = characteristic.properties;
    this.properties = {
      broadcast: Boolean(p.broadcast),
      read: Boolean(p.read),
      writeWithoutResponse: Boolean(p.writeWithoutResponse),
      write: Boolean(p.write),
      notify: Boolean(p.notify),
      indicate: Boolean(p.indicate),
      authenticatedSignedWrites: Boolean(p.authenticatedSignedWrites),
      reliableWrite: Boolean(p.reliableWrite),
      writableAuxiliaries: Boolean(p.writableAuxiliaries),
    };
  }

  public addEventListener(type: string, listener: EventListenerFn): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  public removeEventListener(type: string, listener: EventListenerFn): void {
    this.listeners.get(type)?.delete(listener);
  }

  public async startNotifications(): Promise<this> {
    await this.bleClient.startNotifications(
      this.deviceId,
      this.serviceUuid,
      this.uuid,
      (value: DataView) => {
        this.value = value;
        const ev = { target: this } as unknown as Event;
        this.listeners.get('characteristicvaluechanged')?.forEach((fn) => fn(ev));
      }
    );
    this.notifying = true;
    this.onNotifyStarted(this);
    return this;
  }

  public async stopNotifications(): Promise<this> {
    if (!this.notifying) return this;
    this.notifying = false;
    try {
      await this.bleClient.stopNotifications(this.deviceId, this.serviceUuid, this.uuid);
    } catch {
      // Ignore errors when stopping notifications on an already-closed peripheral
    }
    return this;
  }

  public async writeValueWithResponse(buf: BufferSource): Promise<void> {
    await this.bleClient.write(this.deviceId, this.serviceUuid, this.uuid, toDataView(buf));
  }

  public async writeValueWithoutResponse(buf: BufferSource): Promise<void> {
    await this.bleClient.writeWithoutResponse(
      this.deviceId,
      this.serviceUuid,
      this.uuid,
      toDataView(buf)
    );
  }

  public async writeValue(buf: BufferSource): Promise<void> {
    if (this.properties.write) {
      await this.writeValueWithResponse(buf);
    } else {
      await this.writeValueWithoutResponse(buf);
    }
  }
}

class CapacitorGattServiceAdapter {
  public readonly uuid: string;
  private readonly bleClient: BleClientInterface;
  private readonly deviceId: string;
  private readonly service: BleService;
  private readonly charCache = new Map<string, CapacitorGattCharacteristicAdapter>();
  private readonly onNotifyStarted: (ch: CapacitorGattCharacteristicAdapter) => void;

  constructor(
    bleClient: BleClientInterface,
    deviceId: string,
    service: BleService,
    onNotifyStarted: (ch: CapacitorGattCharacteristicAdapter) => void
  ) {
    this.bleClient = bleClient;
    this.deviceId = deviceId;
    this.service = service;
    this.uuid = normalizeBleUuid(service.uuid);
    this.onNotifyStarted = onNotifyStarted;
  }

  public async getCharacteristic(
    characteristicUuid: BluetoothCharacteristicUUID
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    const normalized = normalizeBleUuid(characteristicUuid);
    const cached = this.charCache.get(normalized);
    if (cached) {
      return cached as unknown as BluetoothRemoteGATTCharacteristic;
    }
    const found = this.service.characteristics.find(
      (c) => normalizeBleUuid(c.uuid) === normalized
    );
    if (!found) {
      throw new Error(`Characteristic ${normalized} not found in service ${this.uuid}.`);
    }
    const adapter = new CapacitorGattCharacteristicAdapter(
      this.bleClient,
      this.deviceId,
      this.uuid,
      found,
      this.onNotifyStarted
    );
    this.charCache.set(normalized, adapter);
    return adapter as unknown as BluetoothRemoteGATTCharacteristic;
  }
}

/**
 * Wraps a native Capacitor `BleDevice` behind the standard Web Bluetooth `BluetoothDevice`
 * interface so Echelon, FTMS, Cycling Power, Cadence, and Heart Rate protocol drivers run
 * identically on native iOS CoreBluetooth and browser Web Bluetooth.
 */
export function createCapacitorBluetoothDeviceAdapter(
  bleClient: BleClientInterface,
  bleDevice: BleDevice
): BluetoothDevice {
  const deviceListeners = new Map<string, Set<EventListenerFn>>();
  const activeNotifiers = new Set<CapacitorGattCharacteristicAdapter>();
  let discoveredServices = new Map<string, BleService>();
  let isConnected = false;

  const emitDisconnect = () => {
    isConnected = false;
    activeNotifiers.clear();
    const ev = { target: deviceAdapter } as unknown as Event;
    deviceListeners.get('gattserverdisconnected')?.forEach((fn) => fn(ev));
  };

  const gattServer = {
    get connected(): boolean {
      return isConnected;
    },
    async connect(): Promise<BluetoothRemoteGATTServer> {
      await bleClient.connect(
        bleDevice.deviceId,
        () => {
          emitDisconnect();
        },
        { skipDescriptorDiscovery: true }
      );
      isConnected = true;
      const services = await bleClient.getServices(bleDevice.deviceId);
      discoveredServices = new Map(services.map((svc) => [normalizeBleUuid(svc.uuid), svc]));
      return gattServer as unknown as BluetoothRemoteGATTServer;
    },
    disconnect(): void {
      const wasConnected = isConnected;
      isConnected = false;
      const notifiers = Array.from(activeNotifiers);
      activeNotifiers.clear();
      void (async () => {
        for (const ch of notifiers) {
          await ch.stopNotifications();
        }
        if (wasConnected) {
          try {
            await bleClient.disconnect(bleDevice.deviceId);
          } catch {
            // Ignore disconnect errors when already closed
          }
        }
      })();
    },
    async getPrimaryService(
      serviceUuid: BluetoothServiceUUID
    ): Promise<BluetoothRemoteGATTService> {
      const normalized = normalizeBleUuid(serviceUuid);
      const svc = discoveredServices.get(normalized);
      if (!svc) {
        throw new Error(`Service ${normalized} not found on device ${bleDevice.name || bleDevice.deviceId}.`);
      }
      const adapter = new CapacitorGattServiceAdapter(
        bleClient,
        bleDevice.deviceId,
        svc,
        (ch) => activeNotifiers.add(ch)
      );
      return adapter as unknown as BluetoothRemoteGATTService;
    },
  };

  const deviceAdapter = {
    id: bleDevice.deviceId,
    name: bleDevice.name ?? undefined,
    gatt: gattServer,
    addEventListener(type: string, listener: EventListenerFn): void {
      if (!deviceListeners.has(type)) {
        deviceListeners.set(type, new Set());
      }
      deviceListeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListenerFn): void {
      deviceListeners.get(type)?.delete(listener);
    },
  };

  return deviceAdapter as unknown as BluetoothDevice;
}

let cachedNativeBleClient: Promise<BleClientInterface> | null = null;

async function getInitializedNativeBleClient(): Promise<BleClientInterface> {
  if (!cachedNativeBleClient) {
    cachedNativeBleClient = (async () => {
      const { BleClient } = await import('@capacitor-community/bluetooth-le');
      await BleClient.initialize({ androidNeverForLocation: true });
      return BleClient;
    })().catch((err) => {
      cachedNativeBleClient = null;
      throw err;
    });
  }
  return cachedNativeBleClient;
}

/**
 * Builds `@capacitor-community/bluetooth-le` request options from standard Web Bluetooth
 * `RequestDeviceOptions` (extracting unique normalized 128-bit service UUIDs and using iOS's
 * scrollable `list` picker).
 */
export function buildNativeBleRequestOptions(
  options: RequestDeviceOptions
): RequestBleDeviceOptions {
  const optionalServices = (options.optionalServices ?? []).map(normalizeBleUuid);

  if ('acceptAllDevices' in options && options.acceptAllDevices) {
    return {
      ...(optionalServices.length > 0 ? { optionalServices } : {}),
      displayMode: 'list',
    };
  }

  const serviceSet = new Set<string>();
  if ('filters' in options && Array.isArray(options.filters)) {
    for (const filter of options.filters) {
      if (filter.services) {
        for (const svc of filter.services) {
          serviceSet.add(normalizeBleUuid(svc));
        }
      }
    }
  }

  const services = Array.from(serviceSet);
  return {
    ...(services.length > 0 ? { services } : {}),
    ...(optionalServices.length > 0 ? { optionalServices } : {}),
    displayMode: 'list',
  };
}

/**
 * Requests a Bluetooth device using standard Web Bluetooth in browsers (zero overhead,
 * unchanged behavior) or native CoreBluetooth via `@capacitor-community/bluetooth-le` inside
 * a Capacitor iOS/Android app.
 */
export async function requestBleDevice(options: RequestDeviceOptions): Promise<BluetoothDevice> {
  if (!isNativeCapacitorPlatform()) {
    return navigator.bluetooth.requestDevice(options);
  }

  const bleClient = await getInitializedNativeBleClient();
  const enabled = await bleClient.isEnabled();
  if (!enabled) {
    throw new Error(
      'Bluetooth is turned off on your device. Enable Bluetooth in Settings or Control Center and try again.'
    );
  }

  const nativeOptions = buildNativeBleRequestOptions(options);
  try {
    const bleDevice = await bleClient.requestDevice(nativeOptions);
    return createCapacitorBluetoothDeviceAdapter(bleClient, bleDevice);
  } catch (err) {
    // Normalize iOS picker cancellation to match Web Bluetooth's NotFoundError convention
    if (err instanceof Error && /cancel|no device/i.test(err.message)) {
      const cancelErr = new Error(err.message);
      cancelErr.name = 'NotFoundError';
      throw cancelErr;
    }
    throw err;
  }
}
