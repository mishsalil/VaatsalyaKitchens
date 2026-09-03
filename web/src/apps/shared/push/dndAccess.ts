import { registerPlugin } from '@capacitor/core';
import { isNativePlatform } from './nativePush';

/**
 * Do Not Disturb access, bridged from DndAccessPlugin.java.
 *
 * The urgent notification channel asks to bypass Do Not Disturb, but Android
 * ignores that request until the app is granted notification-policy access —
 * which has no runtime dialog. Someone has to switch it on in a system settings
 * screen, once per device. That is a fine thing to ask of a counter phone and a
 * pointless thing to ask of a customer, so only the staff UI offers it.
 *
 * Without the grant the alert is still loud: the channel plays an alarm-usage
 * sound at alarm volume, which survives the ringer being down. The grant adds
 * the one case that cannot otherwise be covered — the phone being in Do Not
 * Disturb.
 */
interface DndAccessPlugin {
  /** `granted` is the urgent channel's own bypass flag — the behaviour that
   *  actually decides whether the alert is heard. `policyAccess` is the coarser
   *  system permission and is diagnostic only: an emulator was seen reporting
   *  it true while nothing could bypass anything. */
  check(): Promise<{ granted: boolean; policyAccess: boolean }>;
  openSettings(): Promise<void>;
}

const DndAccess = registerPlugin<DndAccessPlugin>('DndAccess');

/** True when the grant is in place, or when the question does not apply
 *  (the browser, where there is no Do Not Disturb to bypass). */
export async function hasDndAccess(): Promise<boolean> {
  if (!isNativePlatform()) return true;
  try {
    const { granted } = await DndAccess.check();
    return granted;
  } catch {
    // An older shell without the plugin: treat as granted so the UI stays
    // quiet rather than nagging about something it cannot fix.
    return true;
  }
}

/** Open the system screen where the grant is made. Resolves once it is opened,
 *  not once anything is granted — the result must be re-checked on return. */
export async function openDndSettings(): Promise<void> {
  if (!isNativePlatform()) return;
  await DndAccess.openSettings();
}
