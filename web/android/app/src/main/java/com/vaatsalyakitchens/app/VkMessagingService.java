package com.vaatsalyakitchens.app;

import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Capacitor's messaging service, plus the urgent-order alarm.
 *
 * It extends rather than replaces the plugin's service and always calls super,
 * so token registration and the JavaScript push events keep working exactly as
 * before. The only addition is: when a message is marked urgent, ring.
 *
 * WHY URGENT MESSAGES CARRY NO notification BLOCK. Firebase displays a
 * `notification` message itself when the app is in the background, and when it
 * does that, onMessageReceived is never called — so the app gets no chance to
 * play anything. Urgent messages are therefore sent data-only (see
 * includes/fcm.php) and this service does both jobs: it starts the alarm, and
 * the alarm's own foreground notification is what the counter sees.
 *
 * The trade that comes with it: a data-only message needs this service to run.
 * If the phone has force-stopped the app, nothing is shown at all, where a
 * notification message would still have appeared. That is why counter devices
 * must be excluded from battery optimisation — it is an operational step, not
 * something the app can grant itself.
 */
public class VkMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // Capacitor first: the JS layer still sees every message.
        super.onMessageReceived(remoteMessage);

        if (!"1".equals(remoteMessage.getData().get("vk_urgent"))) {
            return;
        }

        String title = remoteMessage.getData().get("title");
        String body = remoteMessage.getData().get("body");

        Intent ring = new Intent(this, OrderAlarmService.class)
            .setAction(OrderAlarmService.ACTION_START)
            .putExtra(OrderAlarmService.EXTRA_TITLE, title != null ? title : "New order")
            .putExtra(OrderAlarmService.EXTRA_BODY, body != null ? body : "Open the app to see it.");

        /* A high-priority FCM message grants a short window in which a
           background app may start a foreground service; that is exactly the
           window we are in here. */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(ring);
        } else {
            startService(ring);
        }
    }
}
