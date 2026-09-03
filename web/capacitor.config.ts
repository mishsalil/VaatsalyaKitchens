import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor lives beside the web app because it ships the web app: `webDir`
 * points at the same dist/ that Vite builds for the browser. One codebase, two
 * shells — there is no separate native UI to keep in step.
 *
 * The Android WebView serves that bundle from https://localhost, which is why
 * the API needs an absolute origin (VITE_API_ORIGIN, see shared/lib/baseUrl.ts)
 * and why https://localhost is on the API's CORS allowlist.
 */
const config: CapacitorConfig = {
  appId: 'com.vaatsalyakitchens.app',
  appName: 'Vaatsalya Kitchens',
  webDir: 'dist',

  android: {
    /* Kept on the default https scheme. It is what the CORS allowlist and the
       Play asset-links flow both assume, and switching it later would silently
       break every API call until both were changed to match. */
    allowMixedContent: false,
  },

  plugins: {
    PushNotifications: {
      /* Android delivers the notification itself when the app is backgrounded;
         this covers the foreground case so a counter device that is awake and
         open still alerts rather than swallowing the message. */
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
