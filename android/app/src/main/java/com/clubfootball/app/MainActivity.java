package com.clubfootball.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Must match the value used in AndroidManifest.xml's
    // com.google.firebase.messaging.default_notification_channel_id meta-data,
    // and is the channel FCM will post to for any message that doesn't specify
    // its own android.notification.channel_id.
    //
    // NOTE: bumped from "messages" to "messages_v2" (2026-08-19). Android
    // notification channels are immutable once created — the app can never
    // change an existing channel's settings via code again, even in a later
    // release. The "messages" channel from the previous fix only called
    // enableVibration(true) without an explicit vibration pattern, relying on
    // Android's implicit default — which turned out to be unreliable on this
    // device (ColorOS 12.1, Oppo A17/CPH2477): sound worked once the channel
    // itself existed, but vibration never fired despite the per-channel
    // toggle being on in Settings. Renaming the channel ID forces Android to
    // create a brand-new channel that picks up the explicit pattern below,
    // rather than being stuck with the old channel's incomplete definition.
    public static final String NOTIFICATION_CHANNEL_ID = "messages_v2";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    // Without this, Firebase falls back to its own auto-created "Miscellaneous"
    // channel at IMPORTANCE_LOW, which delivers notifications silently — no
    // sound, no vibration, no heads-up banner. Creating our own channel here
    // with IMPORTANCE_HIGH before any message can arrive is what makes the
    // banner/sound/vibration actually happen. Must run before FCM posts its
    // first notification, so this happens in onCreate rather than lazily.
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("New team messages");
            channel.enableVibration(true);
            // Explicit pattern (ms): wait 0, buzz 250, pause 250, buzz 250 —
            // don't rely on the implicit "default pattern" Android is
            // supposed to supply when none is set. That implicit default is
            // exactly what didn't produce any vibration on this device.
            channel.setVibrationPattern(new long[]{0, 250, 250, 250});
            channel.enableLights(true);

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}
