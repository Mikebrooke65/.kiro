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
    public static final String NOTIFICATION_CHANNEL_ID = "messages";

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
            channel.enableLights(true);

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}
