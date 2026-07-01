import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.legend01.ludogame',
  appName: 'Ludo Game',
  webDir: 'out',
  server: {
    url: 'https://YOUR-LIVE-URL.com',
    cleartext: false,
  },
};

export default config;
