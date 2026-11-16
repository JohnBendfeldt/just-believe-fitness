import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ECHELON_COMM_SERVICE,
  ECHELON_NOTIFY_1_CHAR,
  ECHELON_WRITE_CHAR,
  EchelonBikeConnection,
  computeEchelonUnlockResponse,
  type EchelonRawReading,
} from '../services/ble/echelonBle';
import {
  BleHeartRateConnection,
  GarminHeartRateConnection,
  parseBleHeartRate,
} from '../services/ble/garminHrBle';

type ListenerFn = (ev: Event) => void;

class MockGattCharacteristic {
  public value: DataView | null = null;
  public properties = { writeWithoutResponse: true };
  public writtenPayloads: Uint8Array[] = [];
  private listeners = new Map<string, Set<ListenerFn>>();

  public addEventListener(type: string, fn: ListenerFn): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  public removeEventListener(type: string, fn: ListenerFn): void {
    this.listeners.get(type)?.delete(fn);
  }

  public startNotifications = vi.fn(async () => this);

  public writeValueWithoutResponse = vi.fn(async (buf: BufferSource) => {
    const view =
      buf instanceof Uint8Array
        ? new Uint8Array(buf)
        : new Uint8Array(buf as ArrayBuffer);
    this.writtenPayloads.push(view);
  });

  public writeValue = vi.fn(async (buf: BufferSource) => {
    await this.writeValueWithoutResponse(buf);
  });

  public emitNotification(bytes: Uint8Array): void {
    this.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ev = { target: this } as unknown as Event;
    this.listeners.get('characteristicvaluechanged')?.forEach((fn) => fn(ev));
  }
}

describe('Echelon EX-3 & Standard FTMS/CPS Web Bluetooth Protocols', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
  });

  it('validates and rejects malformed 0xF0 0xE0 unlock challenges and computes valid BCD responses', () => {
    expect(computeEchelonUnlockResponse(new Uint8Array([0xf0, 0xd1, 0, 0]))).toBeNull();
    expect(
      computeEchelonUnlockResponse(new Uint8Array([0xf0, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))
    ).toBeNull(); // c === 0 guard

    const challenge = new Uint8Array([0xf0, 0xe0, 0x12, 0x04, 0x03, 0x05, 0x29, 0x00]);
    const resp = computeEchelonUnlockResponse(challenge);
    expect(resp).not.toBeNull();
    expect(resp?.length).toBe(8);
    expect(resp?.[0]).toBe(0xf0);
    expect(resp?.[1]).toBe(0xe0);
    // Checksum byte 7 equals sum of bytes 0..6 & 0xff
    const expectedSum = resp!.slice(0, 7).reduce((a, b) => (a + b) & 0xff, 0);
    expect(resp?.[7]).toBe(expectedSum);
  });

  it('connects to Echelon EX-3 GATT service, performs handshake, parses D1/D2 frames, and writes B1 resistance', async () => {
    const writeChar = new MockGattCharacteristic();
    const notifyChar = new MockGattCharacteristic();

    const mockDevice = {
      name: 'ECH-EX3-42',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      gatt: {
        connected: true,
        disconnect: vi.fn(),
        connect: vi.fn(async () => ({
          getPrimaryService: vi.fn(async (uuid: BluetoothServiceUUID) => {
            if (uuid === ECHELON_COMM_SERVICE) {
              return {
                getCharacteristic: vi.fn(async (cUuid: BluetoothCharacteristicUUID) => {
                  if (cUuid === ECHELON_WRITE_CHAR) return writeChar;
                  if (cUuid === ECHELON_NOTIFY_1_CHAR) return notifyChar;
                  throw new Error('Characteristic not present');
                }),
              };
            }
            throw new Error('Unexpected service');
          }),
        })),
      },
    };

    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: vi.fn(async () => mockDevice),
      },
    });

    const readings: EchelonRawReading[] = [];
    const statuses: Array<{ status: string; name: string | null }> = [];
    const conn = new EchelonBikeConnection({
      onReading: (r) => readings.push(r),
      onStatusChange: (status, name) => statuses.push({ status, name }),
    });

    expect(EchelonBikeConnection.isSupported()).toBe(true);
    await conn.requestAndConnect();

    expect(statuses.map((s) => s.status)).toEqual(['connecting', 'connected']);
    expect(statuses[1].name).toBe('ECH-EX3-42');
    expect(writeChar.writtenPayloads.length).toBeGreaterThanOrEqual(6);

    // Emit 0xF0 0xD2 resistance notification (level 24)
    notifyChar.emitNotification(new Uint8Array([0xf0, 0xd2, 0x01, 24, 0xde]));
    // Emit 0xF0 0xD1 13-byte cadence notification (92 rpm at index 10)
    notifyChar.emitNotification(
      new Uint8Array([0xf0, 0xd1, 0, 0, 0, 0, 0, 0, 0, 0, 92, 0, 0])
    );

    expect(readings.at(-1)).toEqual({ cadenceRpm: 92, resistance: 24 });

    // Programmatic resistance change (clamps to 32 max and writes 0xF0 0xB1)
    await conn.setResistanceLevel(35);
    expect(readings.at(-1)?.resistance).toBe(32);
    const b1Frame = writeChar.writtenPayloads.find((p) => p[0] === 0xf0 && p[1] === 0xb1);
    expect(b1Frame).toBeDefined();
    expect(b1Frame?.[3]).toBe(32);

    conn.disconnect();
    expect(statuses.at(-1)?.status).toBe('disconnected');
  });

  it('falls back cleanly to standard FTMS Indoor Bike (0x1826) and parses cadence, resistance & direct watts', async () => {
    const ftmsChar = new MockGattCharacteristic();
    const mockDevice = {
      name: 'FTMS-Trainer',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      gatt: {
        connected: true,
        disconnect: vi.fn(),
        connect: vi.fn(async () => ({
          getPrimaryService: vi.fn(async (uuid: BluetoothServiceUUID) => {
            if (uuid === 0x1826) {
              return {
                getCharacteristic: vi.fn(async () => ftmsChar),
              };
            }
            throw new Error('Not Echelon proprietary');
          }),
        })),
      },
    };

    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: vi.fn(async () => mockDevice) },
    });

    const readings: EchelonRawReading[] = [];
    const conn = new EchelonBikeConnection({
      onReading: (r) => readings.push(r),
      onStatusChange: () => {},
    });

    await conn.requestAndConnect();

    // Flags: bit 0=1 (omit speed), bit 2=1 (cadence 0.5 rpm), bit 5=1 (resistance), bit 6=1 (watts) => 0x0065
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    dv.setUint16(0, 0x0065, true);
    dv.setUint16(2, 180, true); // 180 * 0.5 = 90 rpm
    dv.setInt16(4, 21, true); // resistance 21
    dv.setInt16(6, 168, true); // 168 watts

    ftmsChar.emitNotification(new Uint8Array(buf));
    expect(readings.at(-1)).toEqual({
      cadenceRpm: 90,
      resistance: 21,
      directWatts: 168,
    });

    conn.disconnect();
  });
});

describe('Universal BLE Heart Rate Monitor Support (Any Brand)', () => {
  afterEach(() => {
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
  });

  it('parses 8-bit and 16-bit 0x2A37 BPM payloads and ignores empty buffers', () => {
    expect(parseBleHeartRate(new DataView(new ArrayBuffer(1)))).toBe(0);
    expect(parseBleHeartRate(new DataView(new Uint8Array([0x00, 152]).buffer))).toBe(152);
    expect(parseBleHeartRate(new DataView(new Uint8Array([0x01, 198, 0x00]).buffer))).toBe(198);
    expect(BleHeartRateConnection).toBe(GarminHeartRateConnection);
  });

  it('pairs with any brand BLE HR strap/watch via standard filters OR Scan All BLE fallback', async () => {
    const hrChar = new MockGattCharacteristic();
    const requestDeviceSpy = vi.fn(async (_options?: RequestDeviceOptions) => ({
      name: 'Polar H10 99A1',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      gatt: {
        connected: true,
        disconnect: vi.fn(),
        connect: vi.fn(async () => ({
          getPrimaryService: vi.fn(async () => ({
            getCharacteristic: vi.fn(async () => hrChar),
          })),
        })),
      },
    }));

    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: requestDeviceSpy },
    });

    const bpms: number[] = [];
    const statuses: Array<{ status: string; name: string | null }> = [];
    const hrConn = new GarminHeartRateConnection({
      onHeartRate: (bpm) => bpms.push(bpm),
      onStatusChange: (status, name) => statuses.push({ status, name }),
    });

    // 1. Standard universal filter scan (includes 0x180d + Polar, Wahoo, WHOOP, COROS, Garmin, etc.)
    await hrConn.requestAndConnect({ acceptAllDevices: false });
    const firstCallArg = requestDeviceSpy.mock.calls[0]?.[0] as
      | { filters?: Array<{ services?: number[]; namePrefix?: string }> }
      | undefined;
    expect(firstCallArg?.filters?.[0]).toEqual({ services: [0x180d] });
    expect(firstCallArg?.filters?.some((f) => f.namePrefix === 'Polar')).toBe(true);
    expect(firstCallArg?.filters?.some((f) => f.namePrefix === 'TICKR')).toBe(true);
    expect(firstCallArg?.filters?.some((f) => f.namePrefix === 'WHOOP')).toBe(true);
    expect(statuses.at(-1)).toEqual({ status: 'connected', name: 'Polar H10 99A1' });

    // Valid BPM vs noise spike (>250 ignored)
    hrChar.emitNotification(new Uint8Array([0x00, 148]));
    hrChar.emitNotification(new Uint8Array([0x01, 0x05, 0x01])); // 261 bpm -> filtered out
    expect(bpms).toEqual([148]);

    // 2. Scan All BLE mode (acceptAllDevices: true) for smartwatches hiding 0x180D in adverts
    await hrConn.requestAndConnect({ acceptAllDevices: true });
    const secondCallArg = requestDeviceSpy.mock.calls[1]?.[0] as
      | { acceptAllDevices?: boolean }
      | undefined;
    expect(secondCallArg?.acceptAllDevices).toBe(true);

    hrConn.disconnect();
  });

  it('gives a clear Broadcast Heart Rate hint if a selected smartwatch does not expose 0x180D', async () => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: vi.fn(async () => ({
          name: 'SmartWatch X',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          gatt: {
            connected: true,
            disconnect: vi.fn(),
            connect: vi.fn(async () => ({
              getPrimaryService: vi.fn(async () => {
                throw new Error('Service not found');
              }),
            })),
          },
        })),
      },
    });

    const hrConn = new GarminHeartRateConnection({
      onHeartRate: () => {},
      onStatusChange: () => {},
    });

    await expect(hrConn.requestAndConnect({ acceptAllDevices: true })).rejects.toThrow(
      /HR Broadcast/i
    );
  });
});
