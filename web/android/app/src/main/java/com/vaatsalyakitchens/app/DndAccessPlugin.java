package com.vaatsalyakitchens.app;

import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges Do Not Disturb access to the web layer.
 *
 * WHY A NATIVE PLUGIN IS UNAVOIDABLE HERE
 * The urgent channel asks for setBypassDnd(true), but Android ignores that
 * until the app holds notification-policy access — and that is not a runtime
 * permission. There is no dialog to request it: the user must switch it on in
 * a system settings screen, and only an Activity can open that screen. So the
 * web layer can neither read the state nor ask for it; both cross this bridge.
 *
 * Everything else about push already works without it. This is the difference
 * between an alert that is loud and one that also survives Do Not Disturb.
 */
@CapacitorPlugin(name = "DndAccess")
public class DndAccessPlugin extends Plugin {

    /**
     * Whether the urgent alert can actually get through Do Not Disturb.
     *
     * `granted` reports the real behaviour — the channel's own bypass flag —
     * because that is what decides whether a cancellation is heard on a
     * silenced phone. `policyAccess` is the coarser system permission, reported
     * separately for diagnosis: an emulator image was seen returning true from
     * it while no package actually held the access and the channel could bypass
     * nothing, so the UI must not key off it.
     */
    @PluginMethod
    public void check(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", NotificationChannels.urgentChannelBypassesDnd(getContext()));
        result.put("policyAccess", NotificationChannels.hasDndAccess(getContext()));
        call.resolve(result);
    }

    /**
     * Open the system screen where the grant is made.
     *
     * It lands on a list of apps rather than a yes/no prompt, so the UI that
     * calls this has to say what to look for — otherwise staff arrive at an
     * unfamiliar settings page with no idea what they were sent to do.
     *
     * FLAG_ACTIVITY_NEW_TASK because this is started from a plugin context, not
     * from the Activity's own task.
     */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            // Some heavily customised builds do not expose this screen at all.
            call.reject("Could not open Do Not Disturb settings on this device", e);
        }
    }
}
