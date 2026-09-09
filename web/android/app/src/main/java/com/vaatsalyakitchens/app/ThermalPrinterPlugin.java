package com.vaatsalyakitchens.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.util.UUID;

/**
 * Prints to the counter's Bluetooth thermal printer.
 *
 * BLUETOOTH CLASSIC, NOT BLE, AND NOT BY PREFERENCE. The PT-210 reports itself
 * as a DUAL device but advertises exactly one service — the Serial Port Profile
 * UUID below. It exposes no GATT printing service, so RFCOMM is the only way in.
 *
 * The socket is opened per print and closed after. Holding one open is what goes
 * stale when the printer sleeps, and a receipt is small enough that reconnecting
 * costs nothing anyone can perceive.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = {
        // Alias spelled literally: an annotation cannot reference a constant on
        // the class it annotates.
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class ThermalPrinterPlugin extends Plugin {

    private static final String BLUETOOTH = "bluetooth";
    private static final String TAG = "ThermalPrinter";

    /** Serial Port Profile. Every ESC/POS printer speaking Classic uses it. */
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    /** Time to let the Bluetooth stack drain after a write, before the socket
        is closed. Generous on purpose: a receipt takes well under a second to
        transmit, and a truncated bill costs far more than half a second does. */
    private static final long PRINT_SETTLE_MS = 500L;

    /** Android 11 and below granted Bluetooth at install time. */
    private boolean needsRuntimePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
    }

    private boolean hasPermission() {
        return !needsRuntimePermission() || getPermissionState(BLUETOOTH) == PermissionState.GRANTED;
    }

    @PluginMethod
    public void ensurePermission(PluginCall call) {
        if (hasPermission()) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
            return;
        }
        requestPermissionForAlias(BLUETOOTH, call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", hasPermission());
        call.resolve(res);
    }

    /**
     * Bonded devices that offer SPP.
     *
     * Filtered on the service rather than shown wholesale: a counter phone is
     * paired with headsets, a car and a TV, and a picker listing all of them
     * invites someone to choose the wrong one at the worst moment.
     *
     * Device class filter: a set-top box paired with this counter genuinely
     * advertises the SPP UUID, so UUID filtering alone misses it. We prioritize
     * devices with major class IMAGING (which printers report), but fall back
     * to all SPP devices if no Imaging device exists — a printer that reports
     * an unusual class still appears rather than disappearing from the picker.
     */
    @PluginMethod
    public void listPaired(PluginCall call) {
        if (!hasPermission()) {
            call.reject("Allow Bluetooth access to print.");
            return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("This device has no Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth is switched off.");
            return;
        }

        JSArray devices = new JSArray();
        JSArray imagingDevices = new JSArray();
        try {
            for (BluetoothDevice device : adapter.getBondedDevices()) {
                if (!offersSpp(device)) {
                    continue;
                }
                JSObject entry = new JSObject();
                entry.put("name", device.getName() != null ? device.getName() : device.getAddress());
                entry.put("address", device.getAddress());
                devices.put(entry);

                // Check if this is an Imaging device (printers have major class 6).
                // getBluetoothClass() can return null or throw SecurityException on
                // some API levels; treat "class unknown" as "not Imaging" but do
                // not drop the device — it survives via the fallback to all SPP devices.
                if (isImagingDevice(device)) {
                    imagingDevices.put(entry);
                }
            }
        } catch (SecurityException e) {
            call.reject("Allow Bluetooth access to print.");
            return;
        }

        // If any Imaging devices found, return only those. Otherwise return all SPP devices.
        JSArray result = imagingDevices.length() > 0 ? imagingDevices : devices;

        JSObject res = new JSObject();
        res.put("devices", result);
        call.resolve(res);
    }

    private boolean isImagingDevice(BluetoothDevice device) {
        try {
            BluetoothClass btClass = device.getBluetoothClass();
            if (btClass == null) {
                return false;
            }
            return btClass.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING;
        } catch (SecurityException e) {
            // Cannot read class; treat as "not Imaging" but the device survives
            // via fallback to all SPP devices if no pure Imaging device exists.
            return false;
        }
    }

    private boolean offersSpp(BluetoothDevice device) {
        try {
            android.os.ParcelUuid[] uuids = device.getUuids();
            if (uuids == null) {
                // Some devices report no cached UUIDs; let them through rather
                // than hide a printer that would have worked.
                return true;
            }
            for (android.os.ParcelUuid uuid : uuids) {
                if (SPP.equals(uuid.getUuid())) {
                    return true;
                }
            }
            return false;
        } catch (SecurityException e) {
            return false;
        }
    }

    /**
     * Connect, write, close — on a background thread, because socket I/O on the
     * main thread freezes the counter's screen while the printer is reached.
     */
    @PluginMethod
    public void print(PluginCall call) {
        String address = call.getString("address");
        String dataBase64 = call.getString("dataBase64");
        if (address == null || address.isEmpty() || dataBase64 == null) {
            call.reject("No printer chosen.");
            return;
        }
        if (!hasPermission()) {
            call.reject("Allow Bluetooth access to print.");
            return;
        }

        new Thread(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) {
                    call.reject("Bluetooth is switched off.");
                    return;
                }
                BluetoothDevice device = adapter.getRemoteDevice(address);
                socket = device.createRfcommSocketToServiceRecord(SPP);

                // Prophylactic only: a running discovery slows an RFCOMM connect on older
                // phones. From API 31 this call needs BLUETOOTH_SCAN, which this app
                // deliberately never requests — so its failure must not fail the print.
                try {
                    adapter.cancelDiscovery();
                } catch (Exception ignored) {
                    /* discovery was not ours to cancel; connecting anyway */
                }

                socket.connect();
                byte[] payload = Base64.decode(dataBase64, Base64.DEFAULT);
                OutputStream out = socket.getOutputStream();
                out.write(payload);
                out.flush();

                /* BluetoothOutputStream.flush() is a no-op in AOSP, and closing
                   an RFCOMM socket straight after a write can discard bytes the
                   stack has not yet pushed to the printer — producing a half
                   printed bill that we would report as success. Wait for the
                   radio to drain before the finally block closes the socket. */
                Thread.sleep(PRINT_SETTLE_MS);

                JSObject res = new JSObject();
                res.put("ok", true);
                call.resolve(res);
            } catch (SecurityException e) {
                call.reject("Allow Bluetooth access to print.");
            } catch (IllegalArgumentException e) {
                call.reject("That printer address is not valid. Choose the printer again.");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                call.reject("Could not reach the printer. Check it is on and in range.");
            } catch (Exception e) {
                Log.w(TAG, "print failed", e);
                call.reject("Could not reach the printer. Check it is on and in range.");
            } finally {
                if (socket != null) {
                    try {
                        socket.close();
                    } catch (Exception ignored) {
                        /* already gone */
                    }
                }
            }
        }).start();
    }
}
