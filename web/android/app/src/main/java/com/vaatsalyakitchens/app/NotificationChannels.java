package com.vaatsalyakitchens.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

/**
 * Notification channels for the app.
 *
 * WHY THIS CLASS IS THE REASON THE APP IS NATIVE AT ALL
 * Web push cannot ring through a silenced phone: the notification belongs to
 * the browser, and no web API can override the ringer or Do Not Disturb. A
 * counter phone that goes face-down on silent therefore misses cancellations.
 * An installed app owns its own channels and can ask for more.
 *
 * TWO CHANNELS, because Android settles a channel's behaviour when it is first
 * created and ignores later changes to importance or sound. Mixing routine
 * order updates and urgent cancellations into one channel would force staff to
 * choose between being woken for everything or nothing. Separating them lets
 * someone silence "order updates" and keep "urgent" loud.
 *
 * WHAT bypassDnd ACTUALLY DOES: setting it is a request, not a grant. It takes
 * effect only once the user gives this app Do Not Disturb access in system
 * settings (ACCESS_NOTIFICATION_POLICY, granted through a settings screen, not
 * a runtime dialog). Without that grant Android silently ignores the flag, and
 * the channel behaves like any other. That one-time grant is a setup step for
 * a counter device, and openDndAccessSettings() is how the app takes the user
 * there. USAGE_ALARM is the belt to that braces: an alarm-usage sound plays at
 * alarm volume and survives the ringer being down, independently of DND.
 */
public final class NotificationChannels {

    /** Cancellations and anything a counter device must not miss. */
    public static final String URGENT = "vk_urgent";
    /** Routine order updates. */
    public static final String DEFAULT = "vk_default";

    private NotificationChannels() {}

    public static void register(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return; // channels did not exist before Oreo
        }

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel urgent = new NotificationChannel(
            URGENT,
            "Urgent kitchen alerts",
            NotificationManager.IMPORTANCE_HIGH   // heads-up + sound
        );
        urgent.setDescription("Order cancellations and anything the counter must not miss.");
        urgent.enableVibration(true);
        urgent.setVibrationPattern(new long[] { 0, 400, 200, 400, 200, 400 });
        urgent.enableLights(true);
        urgent.setShowBadge(true);
        // Honoured only with Do Not Disturb access granted; harmless otherwise.
        urgent.setBypassDnd(true);
        urgent.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        // Alarm usage: plays at alarm volume, so a phone with the ringer down
        // still sounds. This is the part that works without any special grant.
        Uri alarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (alarm == null) {
            alarm = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }
        urgent.setSound(alarm, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());

        NotificationChannel normal = new NotificationChannel(
            DEFAULT,
            "Order updates",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        normal.setDescription("Confirmations and status changes for your orders.");
        normal.setShowBadge(true);

        manager.createNotificationChannel(urgent);
        manager.createNotificationChannel(normal);
    }

    /** Whether the app holds notification-policy access.
     *
     *  NOT a reliable signal on its own: an emulator image was observed
     *  returning true from this while the system listed no package as having
     *  the access and the channel could not in fact bypass anything. Kept for
     *  diagnosis; urgentChannelBypassesDnd() is what the UI should trust. */
    public static boolean hasDndAccess(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        return manager != null && manager.isNotificationPolicyAccessGranted();
    }

    /** Whether the urgent channel can ACTUALLY bypass Do Not Disturb.
     *
     *  This is the ground truth, and the only thing that decides whether a
     *  cancellation is heard on a silenced phone. Android settles a channel's
     *  bypass flag when the channel is created and honours setBypassDnd(true)
     *  only if the access was already held, so the answer here can differ from
     *  hasDndAccess() in both directions. */
    public static boolean urgentChannelBypassesDnd(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;   // no channels, and no per-channel DND override to win
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return false;
        }
        NotificationChannel channel = manager.getNotificationChannel(URGENT);
        return channel != null && channel.canBypassDnd();
    }
}
