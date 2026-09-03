package com.vaatsalyakitchens.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        /* Plugins must be registered BEFORE super.onCreate(), which is where
           the bridge is built and the web layer starts loading. Registering
           afterwards leaves the plugin invisible to JavaScript. */
        registerPlugin(DndAccessPlugin.class);

        super.onCreate(savedInstanceState);
        /* Channels must exist before the first notification arrives — Android
           drops a message addressed to a channel that was never created, and it
           settles a channel's behaviour at creation and ignores later edits.
           Registering on every launch is cheap and idempotent. */
        NotificationChannels.register(this);
    }
}
