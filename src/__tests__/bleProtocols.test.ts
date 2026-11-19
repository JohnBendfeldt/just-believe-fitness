import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CYCLING_POWER_MEASUREMENT,
  CYCLING_POWER_SERVICE,
  CYCLING_SPEED_CADENCE_SERVICE,
  CSC_MEASUREMENT,
  ECHELON_COMM_SERVICE,
  ECHELON_NOTIFY_1_CHAR,
  ECHELON_WRITE_CHAR,
  EchelonBikeConnection,
  FTMS_CONTROL_POINT,
  FTMS_INDOOR_BIKE_DATA,
  FTMS_SERVICE,
  StationaryBikeConnection,
  computeEchelonUnlockResponse,
  detectBikeModelProfile,
  parseCpsMeasurement,
  parseCscMeasurement,
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

  it('auto-detects all Echelon bike models (motorized EX vs manual-knob Sport/EX-15/Prime/GT+) and major third-party FTMS/Power/Cadence brands', () => {
    expect(StationaryBikeConnection).toBe(EchelonBikeConnection);

    // Manual-knob compact Echelon bikes -> sport-compact curve & hasMotorizedResistance: false
    const sport = detectBikeModelProfile('ECH-SPORT-1920', 'echelon');
    expect(sport.family).toBe('echelon-sport-knob');
    expect(sport.hasMotorizedResistance).toBe(false);
    expect(sport.recommendedCurve).toBe('sport-compact');

    const sportS = detectBikeModelProfile('ECH-SPORT-S-04', 'echelon');
    expect(sportS.family).toBe('echelon-sport-knob');
    expect(sportS.hasBuiltInScreen).toBe(true);

    expect(detectBikeModelProfile('ECH-EX15-088', 'echelon').shortLabel).toBe('EX-15');
    expect(detectBikeModelProfile('ECH-PRIME-12', 'echelon').shortLabel).toBe('Prime');
    expect(detectBikeModelProfile('ECH-GT-55', 'echelon').shortLabel).toBe('GT+');
    expect(detectBikeModelProfile('ECH-EX1-03', 'echelon').family).toBe('echelon-sport-knob');

    // Motorized Echelon EX-series -> ex3-vector curve & hasMotorizedResistance: true
    const ex5s = detectBikeModelProfile('ECH-EX5S-101', 'echelon');
    expect(ex5s.family).toBe('echelon-ex-motorized');
    expect(ex5s.hasMotorizedResistance).toBe(true);
    expect(ex5s.hasBuiltInScreen).toBe(true);
    expect(detectBikeModelProfile('ECH-EX4S-22', 'echelon').shortLabel).toBe('EX-4s');
    expect(detectBikeModelProfile('ECH-EX7S-01', 'echelon').shortLabel).toBe('EX-7s');
    expect(detectBikeModelProfile('ECH-EX8S-09', 'echelon').shortLabel).toBe('EX-8s');

    // Third-party FTMS, Power Meter, and Cadence bikes
    expect(detectBikeModelProfile('IC Bike', 'ftms', false).displayName).toBe('Schwinn IC4');
    expect(detectBikeModelProfile('Bowflex C6', 'ftms', false).shortLabel).toBe('C6');
    expect(detectBikeModelProfile('YESOUL-S3', 'ftms', false).shortLabel).toBe('Yesoul');
    expect(detectBikeModelProfile('MERACH-S26', 'ftms', true).hasMotorizedResistance).toBe(true);
    expect(detectBikeModelProfile('KICKR CORE 4412', 'ftms', true).shortLabel).toBe('KICKR');
    expect(detectBikeModelProfile('Assioma DUO', 'cps').family).toBe('power-meter-bike');
    expect(detectBikeModelProfile('Wahoo CADENCE', 'csc').family).toBe('cadence-bike');
  });

  it('suppresses motorized 0xB1 resistance writes on manual-knob Echelon Connect Sport while still reading live knob resistance', async () => {
    const writeChar = new MockGattCharacteristic();
    const notifyChar = new MockGattCharacteristic();

    const mockSport = {
      name: 'ECH-SPORT-774',
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
                  throw new Error('Not present');
                }),
              };
            }
            throw new Error('Unexpected service');
          }),
        })),
      },
    };

    const requestSpy = vi.fn(async (_opts?: RequestDeviceOptions) => mockSport);
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: requestSpy },
    });

    const conn = new StationaryBikeConnection({
      onReading: () => {},
      onStatusChange: () => {},
    });

    await conn.requestAndConnect({ acceptAllDevices: true });
    expect((requestSpy.mock.calls[0]?.[0] as { acceptAllDevices?: boolean })?.acceptAllDevices).toBe(
      true
    );
    expect(conn.getModelProfile()?.family).toBe('echelon-sport-knob');
    expect(conn.getModelProfile()?.hasMotorizedResistance).toBe(false);

    await conn.setResistanceLevel(20);
    const b1Sent = writeChar.writtenPayloads.find((p) => p[0] === 0xf0 && p[1] === 0xb1);
    expect(b1Sent).toBeUndefined();

    conn.disconnect();
  });

  it('supports FTMS 0-100 resistance scale + 0x2AD9 control point, CPS crank-revolution cadence (with 16-bit wraparound), and CSC cadence pods', async () => {
    // 1. Direct unit check of CPS 0x2A63 crank cadence with 16-bit counter wraparound
    const cpsBuf1 = new DataView(new ArrayBuffer(8));
    cpsBuf1.setUint16(0, 0x0020, true); // Crank Revolution Data Present
    cpsBuf1.setInt16(2, 185, true); // 185W
    cpsBuf1.setUint16(4, 65535, true); // revs near uint16 max
    cpsBuf1.setUint16(6, 65000, true); // time1024 near uint16 max
    const s1 = parseCpsMeasurement(cpsBuf1, null);
    expect(s1?.watts).toBe(185);
    expect(s1?.cadenceRpm).toBeNull();

    const cpsBuf2 = new DataView(new ArrayBuffer(8));
    cpsBuf2.setUint16(0, 0x0020, true);
    cpsBuf2.setInt16(2, 192, true);
    cpsBuf2.setUint16(4, 1, true); // +2 crank revolutions across 65536 rollover
    cpsBuf2.setUint16(6, (65000 + 1365) & 0xffff, true); // ~1.333s -> ~90 RPM
    const s2 = parseCpsMeasurement(cpsBuf2, s1!.nextSample);
    expect(s2?.watts).toBe(192);
    expect(s2?.cadenceRpm).toBe(90);

    // 2. Direct unit check of CSC 0x2A5B cadence pod
    const csc1 = parseCscMeasurement(
      new DataView(new Uint8Array([0x02, 10, 0, 0, 4]).buffer),
      null
    );
    const csc2 = parseCscMeasurement(
      new DataView(new Uint8Array([0x02, 12, 0, 0, 8]).buffer), // +2 revs in 1024 ticks (1.0s) = 120 RPM
      csc1!.nextSample
    );
    expect(csc2?.cadenceRpm).toBe(120);

    // 3. Controllable FTMS bike (0x2AD2 + 0x2AD9) + 100-level resistance
    const ftmsDataChar = new MockGattCharacteristic();
    const ftmsCtrlChar = new MockGattCharacteristic();
    let mode: 'ftms' | 'cps' | 'csc' = 'ftms';
    const cpsChar = new MockGattCharacteristic();
    const cscChar = new MockGattCharacteristic();

    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: vi.fn(async () => ({
          name: mode === 'ftms' ? 'IC Bike' : mode === 'cps' ? 'Assioma UNO' : 'Magene S3+',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          gatt: {
            connected: true,
            disconnect: vi.fn(),
            connect: vi.fn(async () => ({
              getPrimaryService: vi.fn(async (uuid: BluetoothServiceUUID) => {
                if (mode === 'ftms' && uuid === FTMS_SERVICE) {
                  return {
                    getCharacteristic: vi.fn(async (cUuid: BluetoothCharacteristicUUID) => {
                      if (cUuid === FTMS_INDOOR_BIKE_DATA) return ftmsDataChar;
                      if (cUuid === FTMS_CONTROL_POINT) return ftmsCtrlChar;
                      throw new Error('Unknown FTMS char');
                    }),
                  };
                }
                if (mode === 'cps' && uuid === CYCLING_POWER_SERVICE) {
                  return {
                    getCharacteristic: vi.fn(async (cUuid: BluetoothCharacteristicUUID) => {
                      if (cUuid === CYCLING_POWER_MEASUREMENT) return cpsChar;
                      throw new Error('Unknown CPS char');
                    }),
                  };
                }
                if (mode === 'csc' && uuid === CYCLING_SPEED_CADENCE_SERVICE) {
                  return {
                    getCharacteristic: vi.fn(async (cUuid: BluetoothCharacteristicUUID) => {
                      if (cUuid === CSC_MEASUREMENT) return cscChar;
                      throw new Error('Unknown CSC char');
                    }),
                  };
                }
                throw new Error('Service not on this device');
              }),
            })),
          },
        })),
      },
    });

    const readings: EchelonRawReading[] = [];
    const conn = new StationaryBikeConnection({
      onReading: (r) => readings.push(r),
      onStatusChange: () => {},
    });

    await conn.requestAndConnect();
    expect(conn.getModelProfile()?.displayName).toBe('Schwinn IC4');
    expect(conn.getModelProfile()?.hasMotorizedResistance).toBe(true);

    // Emit Schwinn IC4 0-100 resistance (level 68, 86 rpm, 175W)
    const ic4Buf = new ArrayBuffer(8);
    const ic4Dv = new DataView(ic4Buf);
    ic4Dv.setUint16(0, 0x0065, true);
    ic4Dv.setUint16(2, 172, true); // 86 rpm
    ic4Dv.setInt16(4, 68, true); // 68/100 resistance
    ic4Dv.setInt16(6, 175, true);
    ftmsDataChar.emitNotification(new Uint8Array(ic4Buf));
    expect(readings.at(-1)).toEqual({
      cadenceRpm: 86,
      resistance: 68,
      directWatts: 175,
      maxResistance: 100,
    });

    // Write target resistance to FTMS Control Point (0x00 Request Control, then 0x04 Set Resistance)
    await conn.setResistanceLevel(72);
    expect(ftmsCtrlChar.writtenPayloads[0]).toEqual(new Uint8Array([0x00]));
    expect(ftmsCtrlChar.writtenPayloads[1]).toEqual(new Uint8Array([0x04, 72]));
    conn.disconnect();

    // Test CSC Cadence-only spin bike fallback (0x1816)
    mode = 'csc';
    await conn.requestAndConnect();
    expect(conn.getModelProfile()?.family).toBe('cadence-bike');
    cscChar.emitNotification(new Uint8Array([0x02, 1, 0, 0, 4]));
    cscChar.emitNotification(new Uint8Array([0x02, 3, 0, 0, 8])); // +2 revs in 1.0s => 120 RPM
    expect(readings.at(-1)?.cadenceRpm).toBe(120);
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

  it('resets scanning state to disconnected when the Bluetooth picker is closed without picking a bike or HR sensor, allowing immediate re-scan', async () => {
    const cancelErr = Object.assign(new Error('User cancelled the requestDevice() chooser.'), {
      name: 'NotFoundError',
    });

    const mockDevice = {
      name: 'ECH-SPORT-11',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      gatt: {
        connected: true,
        disconnect: vi.fn(),
        connect: vi.fn(async () => ({
          getPrimaryService: vi.fn(async (uuid: BluetoothServiceUUID) => {
            if (uuid === ECHELON_COMM_SERVICE) {
              return {
                getCharacteristic: vi.fn(async () => new MockGattCharacteristic()),
              };
            }
            throw new Error('Not Echelon');
          }),
        })),
      },
    };

    const requestDeviceSpy = vi
      .fn()
      .mockRejectedValueOnce(cancelErr)
      .mockResolvedValueOnce(mockDevice)
      .mockRejectedValueOnce(cancelErr);

    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: { requestDevice: requestDeviceSpy },
    });

    const bikeStatuses: string[] = [];
    const bikeConn = new EchelonBikeConnection({
      onReading: () => {},
      onStatusChange: (status) => bikeStatuses.push(status),
    });

    // 1st attempt: user closes picker without choosing -> transitions connecting -> disconnected
    await expect(bikeConn.requestAndConnect()).rejects.toThrow(/cancelled/);
    expect(bikeStatuses).toEqual(['connecting', 'disconnected']);

    // 2nd attempt: user clicks Pair Bike again -> picker opens cleanly and connects!
    await bikeConn.requestAndConnect();
    expect(bikeStatuses.at(-1)).toBe('connected');
    expect(requestDeviceSpy).toHaveBeenCalledTimes(2);
    bikeConn.disconnect();

    // Same guarantee on Heart Rate sensor picker dismissal
    const hrStatuses: string[] = [];
    const hrConn = new GarminHeartRateConnection({
      onHeartRate: () => {},
      onStatusChange: (status) => hrStatuses.push(status),
    });
    await expect(hrConn.requestAndConnect()).rejects.toThrow(/cancelled/);
    expect(hrStatuses).toEqual(['connecting', 'disconnected']);
  });
});
