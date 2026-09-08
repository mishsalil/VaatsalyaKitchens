import { App } from '@capacitor/app';
import { isNativePlatform } from '../push/nativePush';

/**
 * Make Android's back button go back a screen instead of closing the app.
 *
 * WHAT IT DOES BY DEFAULT, and why that is wrong here: Capacitor does not wire
 * the system back button to the web app's history, so pressing it finishes the
 * activity. Tapping "Staff sign in" and then pressing back therefore quit the
 * app entirely rather than returning to the menu — with no address bar and no
 * on-screen back button, that left a customer who tapped it out of curiosity
 * with no way back at all.
 *
 * Exiting is still correct at the top of the stack: on Android, back from the
 * first screen leaves the app, and an app that traps you is worse than one that
 * closes. So it exits only when there is genuinely nothing to go back to.
 *
 * Registered once, at startup. Never throws: a back button that reports an
 * error is worse than one that does nothing.
 */
export function registerNativeBackButton(): void {
  if (!isNativePlatform()) return;

  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  }).catch(() => {
    /* older shell without the plugin — the default behaviour stands */
  });
}
