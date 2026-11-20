/** Detects iPhone/iPad (including iPadOS, which reports itself as a Mac with touch). */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

export const IOS_BLUETOOTH_MESSAGE =
  "Apple doesn't allow Web Bluetooth in Safari or Chrome on iPhone/iPad, so bike pairing won't work there. " +
  'Workaround: open jbfit.studio in the free Bluefy browser (App Store), which adds Web Bluetooth on iOS. ' +
  'Or use Chrome on Android or desktop.';

export const GENERIC_BLUETOOTH_MESSAGE =
  'Bluetooth pairing requires Chrome or Edge on Android or desktop (Safari and Firefox are not supported).';

/** User-facing explanation for why Web Bluetooth is unavailable in this browser. */
export function getBluetoothUnsupportedMessage(): string {
  return isIosDevice() ? IOS_BLUETOOTH_MESSAGE : GENERIC_BLUETOOTH_MESSAGE;
}
