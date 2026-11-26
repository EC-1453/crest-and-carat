import type { CapacitorConfig } from '@capacitor/cli';

const config = {
  appId: 'vip.evercrest.carat',
  appName: 'CREST & CARAT',
  webDir: 'dist',
  backgroundColor: '#F1E7D8',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
  },
} satisfies CapacitorConfig;

export default config;
