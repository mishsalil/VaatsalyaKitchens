<?php
/* Tax-exclusive GST helper, mirrored by web/src/apps/shared/lib/gst.ts so the
   client-side cart/checkout preview matches the snapshot stored on order create.

   Menu prices are pre-tax. The breakdown is:
     subtotal   = SUM(price * qty)
     gst        = round(subtotal * rate/100, 2)
     cgst       = round(gst/2, 2)          (half, rounded)
     sgst       = gst - cgst               (remainder → cgst + sgst == gst exactly)
     exact      = round(subtotal + cgst + sgst, 2)
     total      = ceil(exact)              (final amount rounded UP to the next rupee)
     round_off  = total - exact            (the paise adjustment, so the bill reconciles)

   `total` (a whole rupee) is what the customer pays and is stored as
   total_estimate. A 0 (or negative) rate yields no tax; the ceiling still
   applies to the subtotal. Used for legacy orders written before this column. */
function compute_gst(float $subtotal, float $rate): array
{
    $rate = max(0.0, $rate);
    $subtotal = round($subtotal, 2);
    $gst = round($subtotal * $rate / 100.0, 2);
    $cgst = round($gst / 2.0, 2);
    $sgst = round($gst - $cgst, 2);
    $exact = round($subtotal + $cgst + $sgst, 2);
    // ceil, with a tiny epsilon so a float-drifted whole number (e.g. 735.0000001)
    // doesn't roll up to 736. A genuine .50 still rounds up.
    $total = (int) ceil($exact - 0.0001);
    $roundOff = round($total - $exact, 2);
    return [
        'subtotal'  => $subtotal,
        'gst'       => $gst,
        'cgst'      => $cgst,
        'sgst'      => $sgst,
        'round_off' => $roundOff,
        'total'     => (float)$total,
        'rate'      => $rate,
    ];
}