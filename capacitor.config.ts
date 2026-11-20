import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'studio.jbfit.app',
  appName: 'Just Believe Fitness',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0b0e14',
    allowsLinkPreview: false,
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Scanning for bikes & HR sensors...',
        cancel: 'Cancel',
        availableDevices: 'Nearby Bluetooth Sensors',
        noDeviceFound: 'No bike or sensor found. Pedal to wake your bike and try again.',
      },
    },
  },
};

export default config;
