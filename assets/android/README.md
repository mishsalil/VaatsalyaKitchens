# Android icon sources

Build inputs for the native Android app. Not served to the web — the PWA's own
icons live in `web/public/icons/`.

Both are generated from the master logo (`web/public/branding/logo.png`, which is
gitignored as an upload), scaled from the artwork's opaque bounding box rather
than its padded 1600px canvas.

| File | Use |
| --- | --- |
| `android-foreground-432.png` | Adaptive-icon foreground layer. Transparent; artwork sits inside the 66% safe zone so circle, squircle and teardrop masks never clip it. Pair with a solid `#f7f2e7` background layer. |
| `play-store-512.png` | Play Console store listing icon. 512x512, 32-bit, no transparency — Play rejects alpha. |

To regenerate at other sizes, scale from the same bounding box: x 57, y 55,
w 1484, h 1489.
