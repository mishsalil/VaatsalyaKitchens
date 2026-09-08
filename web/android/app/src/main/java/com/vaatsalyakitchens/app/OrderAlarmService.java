package com.vaatsalyakitchens.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Rings a counter phone for a new or cancelled order, loudly, whatever the
 * ringer is set to.
 *
 * WHY THE APP PLAYS THE SOUND ITSELF. Leaving it to the notification does not
 * work: measured on a Galaxy S24 (Android 16), with the phone on vibrate
 * NotificationManager substitutes a buzz and never plays the channel's sound,
 * even though that channel asks for an alarm-usage tone. A channel's usage
 * picks which volume slider applies; it does not exempt the notification from
 * the ringer. Alarm clocks are audible on a silenced phone because they play
 * audio on the alarm stream directly, which is what this does.
 *
 * STAFF ONLY. It is started from an urgent push, and urgent pushes are only
 * ever sent to staff devices (push_send_to_admins). A customer's phone will
 * never be woken like this.
 *
 * It stops when someone acknowledges it, when the app is opened, or on its own
 * after MAX_RING_MS. A siren nobody can silence is worse than one that is
 * missed, and a foreground service that rings forever is also how an app gets
 * killed by the system.
 */
public class OrderAlarmService extends Service {

    private static final String TAG = "OrderAlarm";
    public static final String ACTION_START = "com.vaatsalyakitchens.app.ALARM_START";
    public static final String ACTION_STOP = "com.vaatsalyakitchens.app.ALARM_STOP";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";

    /** A minute of ringing is long enough to fetch someone, short enough not to
        become a nuisance if the counter is unattended. */
    private static final long MAX_RING_MS = 60_000L;

    private static final int NOTIFICATION_ID = 4711;

    private MediaPlayer player;
    private PowerManager.WakeLock wakeLock;
    private final Handler stopper = new Handler(Looper.getMainLooper());

    /** The alarm volume as we found it, so raising it can be undone. */
    private int previousAlarmVolume = -1;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent != null && intent.getStringExtra(EXTRA_TITLE) != null
            ? intent.getStringExtra(EXTRA_TITLE)
            : "New order";
        String body = intent != null && intent.getStringExtra(EXTRA_BODY) != null
            ? intent.getStringExtra(EXTRA_BODY)
            : "Open Vaatsalya Kitchens to see it.";

        startForeground(NOTIFICATION_ID, buildNotification(title, body));

        // Already ringing: refresh the notification, do not stack a second
        // player on top of the first.
        if (player != null && player.isPlaying()) {
            return START_NOT_STICKY;
        }

        wakeScreen();
        raiseAlarmVolume();
        startRinging();

        stopper.removeCallbacksAndMessages(null);
        stopper.postDelayed(this::stopSelf, MAX_RING_MS);

        return START_NOT_STICKY;
    }

    /** Plays our own tone on the ALARM stream, looping. */
    private void startRinging() {
        try {
            player = MediaPlayer.create(
                this,
                R.raw.order_alert,
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
                AudioManager.AUDIO_SESSION_ID_GENERATE
            );
            if (player == null) {
                Log.e(TAG, "could not create the player; the alert will be silent");
                return;
            }
            player.setLooping(true);
            player.setVolume(1f, 1f);
            player.start();
        } catch (Exception e) {
            // Never let a sound failure take the notification down with it —
            // a silent alert still beats no alert.
            Log.e(TAG, "could not start the alert tone", e);
        }
    }

    /**
     * Puts the alarm stream at full volume, remembering what it was.
     *
     * Deliberately intrusive, and deliberately reversible: a counter phone that
     * misses an order costs a customer their dinner, so an urgent alert is
     * allowed to be loud — but it puts the slider back the moment it stops, so
     * it does not quietly reconfigure someone's phone.
     */
    private void raiseAlarmVolume() {
        try {
            AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) {
                return;
            }
            int max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            previousAlarmVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM);
            if (previousAlarmVolume < max) {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, max, 0);
            }
        } catch (Exception e) {
            // Some devices refuse this; ringing at the current volume is fine.
            Log.w(TAG, "could not raise the alarm volume", e);
        }
    }

    private void restoreAlarmVolume() {
        if (previousAlarmVolume < 0) {
            return;
        }
        try {
            AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audio != null) {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, previousAlarmVolume, 0);
            }
        } catch (Exception e) {
            Log.w(TAG, "could not restore the alarm volume", e);
        }
        previousAlarmVolume = -1;
    }

    /** Lights the screen, so the alert is seen as well as heard. */
    private void wakeScreen() {
        try {
            PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (power == null) {
                return;
            }
            wakeLock = power.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "vk:order-alarm"
            );
            wakeLock.acquire(MAX_RING_MS);
        } catch (Exception e) {
            Log.w(TAG, "could not wake the screen", e);
        }
    }

    private Notification buildNotification(String title, String body) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stop = new Intent(this, OrderAlarmService.class).setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(
            this, 1, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, NotificationChannels.URGENT)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(openPending)
            /* Takes over the screen where the app is allowed to; on Android 14+
               an app without full-screen-intent permission degrades to a
               heads-up banner, which with the tone still ringing is enough. */
            .setFullScreenIntent(openPending, true)
            .addAction(0, "Stop alert", stopPending)
            /* The tone is ours to play, so silence the notification's own —
               otherwise the system layers a second sound over it. */
            .setSilent(true)
            .build();
    }

    /** Stops a ringing alert from anywhere in the app. */
    public static void stop(Context context) {
        try {
            context.startService(new Intent(context, OrderAlarmService.class).setAction(ACTION_STOP));
        } catch (Exception e) {
            Log.w(TAG, "could not stop the alert", e);
        }
    }

    @Override
    public void onDestroy() {
        stopper.removeCallbacksAndMessages(null);
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
                /* already stopped */
            }
            player.release();
            player = null;
        }
        restoreAlarmVolume();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
