<?php
/* GET  /api/discounts        — the active codes, for the "offers" chips.
   POST /api/discounts/check  {code, subtotal, phone} — what a code is worth
                               for this cart, or the reason it is not.
   Public. Rate-limited per IP so a script cannot enumerate codes. */
require_once __DIR__ . '/../../includes/discounts.php';
require_once __DIR__ . '/../../includes/settings.php';

function route($method, $action, $parts): void
{
    if ($action === 'index' && $method === 'GET') {
        $codes = array_map(fn($r) => [
            'code'             => $r['code'],
            'pct'              => $r['pct'],
            'max_amount'       => $r['max_amount'],
            'min_order'        => $r['min_order'],
            'first_order_only' => $r['first_order_only'],
        ], discount_active(db()));
        Response::json(['codes' => $codes]);
    }

    if ($action === 'check' && $method === 'POST') {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        if (too_many_attempts('code:' . $ip, 30, 15)) {
            Response::error('Too many tries. Please wait a few minutes.', 429);
        }
        $code     = (string)($_POST['code'] ?? '');
        $subtotal = (float)($_POST['subtotal'] ?? 0);
        $phone    = normalize_phone((string)($_POST['phone'] ?? ''));
        try {
            $r = discount_check(db(), $code, $subtotal, $phone);
        } catch (DiscountError $e) {
            // Only a refusal counts as a try: a customer re-checking a valid
            // code as their cart changes must not be locked out.
            record_attempt('code:' . $ip);
            Response::error($e->getMessage(), 422);
        }
        Response::json(['code' => $r['code'], 'pct' => $r['pct'], 'amount' => $r['amount']]);
    }

    Response::error('Not found', 404);
}
