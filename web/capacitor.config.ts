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
/**
 * Dev-server mode, opt-in via CAP_SERVER_URL at `cap sync` time. Example:
 *   CAP_SERVER_URL=http://10.0.2.2:5173 npx cap sync android
 *
 * WHY THIS EXISTS RATHER THAN allowMixedContent
 * The packaged app is served from https://localhost, so a call to a cleartext
 * http API is mixed content and the WebView blocks it — a policy of the WebView
 * itself, which network_security_config does not affect. The lazy fix is
 * allowMixedContent: true, but that weakens the SHIPPED app to solve a problem
 * that only exists in development.
 *
 * Loading the page from the Vite dev server instead makes page and API share a
 * scheme and an origin, so nothing is mixed and nothing is relaxed. It also
 * gives live reload, and API calls go through Vite's existing /api proxy, so no
 * VITE_API_ORIGIN is needed for this path either.
 *
 * 10.0.2.2 is how the Android emulator reaches its host's loopback; a physical
 * device wants the machine's LAN address, or `adb reverse`.
 */
const devServerUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.vaatsalyakitchens.app',
  appName: 'Vaatsalya Kitchens',
  webDir: 'dist',

  ...(devServerUrl
    ? { server: { url: devServerUrl, cleartext: true } }
    : {}),

  android: {
    /* Kept on the default https scheme, and mixed content stays blocked. It is
       what the CORS allowlist and the Play asset-links flow both assume, and
       switching either would silently break every API call until both matched. */
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
