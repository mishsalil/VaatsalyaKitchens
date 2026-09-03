package com.vaatsalyakitchens.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        /* Channels must exist before the first notification arrives — Android
           drops a message addressed to a channel that was never created, and it
           settles a channel's behaviour at creation and ignores later edits.
           Registering on every launch is cheap and idempotent. */
        NotificationChannels.register(this);
    }
}
