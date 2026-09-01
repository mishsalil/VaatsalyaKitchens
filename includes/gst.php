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

/* Counter billing — compute_gst plus the three adjustments a rep can make at the
   till (migration_006). Mirrored by web/src/apps/shared/lib/gst.ts.

     discount_amount = round(subtotal * pct/100, 2)
     taxable         = subtotal - discount_amount   (GST is charged on this,
                                                     never the pre-discount sum)
     delivery        = added AFTER tax (not taxed here)
     total           = ceil(taxable + cgst + sgst + delivery)

   Complimentary zeroes every billable line — cgst, sgst, delivery and total —
   while keeping `subtotal` and `discount_amount` as the notional value of what
   was given away, so comps stay reportable.

   Customer checkout keeps calling compute_gst() directly: discounts and delivery
   charges are counter-only, so that path is deliberately unchanged. */
function compute_order_total(
    float $subtotal,
    float $rate,
    float $discountPct = 0.0,
    float $deliveryCharge = 0.0,
    bool $isComplimentary = false
): array {
    $subtotal = round(max(0.0, $subtotal), 2);
    $discountPct = min(100.0, max(0.0, $discountPct));
    $deliveryCharge = round(max(0.0, $deliveryCharge), 2);
    $discountAmount = round($subtotal * $discountPct / 100.0, 2);
    $taxable = round($subtotal - $discountAmount, 2);

    if ($isComplimentary) {
        return [
            'subtotal'        => $subtotal,
            'discount_pct'    => $discountPct,
            'discount_amount' => $discountAmount,
            'cgst'            => 0.0,
            'sgst'            => 0.0,
            'delivery_charge' => 0.0,
            'round_off'       => 0.0,
            'total'           => 0.0,
            'rate'            => max(0.0, $rate),
            'complimentary'   => true,
        ];
    }

    $gst = compute_gst($taxable, $rate);
    $exact = round($taxable + $gst['cgst'] + $gst['sgst'] + $deliveryCharge, 2);
    $total = (int) ceil($exact - 0.0001);

    return [
        'subtotal'        => $subtotal,
        'discount_pct'    => $discountPct,
        'discount_amount' => $discountAmount,
        'cgst'            => $gst['cgst'],
        'sgst'            => $gst['sgst'],
        'delivery_charge' => $deliveryCharge,
        'round_off'       => round($total - $exact, 2),
        'total'           => (float)$total,
        'rate'            => $gst['rate'],
        'complimentary'   => false,
    ];
}