import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.clubfootball.app',
  appName: 'WCR Football',
  webDir: 'dist',
  server: {
    // Avoids mixed-content issues with Supabase's HTTPS endpoints
    androidScheme: 'https',
  },
};

export default config;
