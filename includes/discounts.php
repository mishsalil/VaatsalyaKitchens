<?php
/* Discount codes. One number from the admin — the share of sales the kitchen
   will give away — becomes three codes; this file is the only place that
   decides what a code is worth. Both order routes and the admin route call
   in here; nothing else touches discount_codes.

   The 24 % ceiling applies twice: no single code exceeds it, and at the
   counter a code plus the manual discount may not exceed it either. */

require_once __DIR__ . '/helpers.php';

const DISCOUNT_CEILING_PCT = 24.0;

class DiscountError extends RuntimeException {}

/** The three codes for budget B (percent) and average order A (rupees). */
function discount_plan(float $budgetPct, float $avgOrder): array
{
    $b = (int)round(min(max($budgetPct, 0.0), DISCOUNT_CEILING_PCT));
    if ($b <= 0) {
        return [];
    }
    $snap = fn(float $rupees) => (float)(round($rupees / 50) * 50);
    return [
        ['code' => 'WELCOME',  'kind' => 'first', 'pct' => (float)min((int)round(1.5 * $b), 24), 'max_amount' => 100.0, 'min_order' => 0.0,             'first_order_only' => true],
        ['code' => "VK$b",     'kind' => 'flat',  'pct' => (float)$b,                             'max_amount' => 150.0, 'min_order' => $snap($avgOrder),  'first_order_only' => false],
        ['code' => 'FEAST',    'kind' => 'big',   'pct' => (float)min($b + 5, 24),                'max_amount' => 300.0, 'min_order' => $snap(2 * $avgOrder), 'first_order_only' => false],
    ];
}

/** Average pre-tax subtotal of delivered orders in the last 30 days; ₹400 until there are ten. */
function discount_average_order(PDO $pdo): float
{
    $row = $pdo->query(
        "SELECT COUNT(*) AS n, AVG(subtotal) AS a FROM orders
          WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL 30 DAY"
    )->fetch();
    return (int)$row['n'] >= 10 ? round((float)$row['a'], 2) : 400.0;
}

function discount_row(array $r): array
{
    return [
        'id'               => (int)$r['id'],
        'code'             => $r['code'],
        'kind'             => $r['kind'],
        'pct'              => (float)$r['pct'],
        'max_amount'       => (float)$r['max_amount'],
        'min_order'        => (float)$r['min_order'],
        'first_order_only' => (int)$r['first_order_only'] === 1,
        'active'           => (int)$r['active'] === 1,
        'created_at'       => $r['created_at'],
    ];
}

/** Active codes in the order first / flat / big. */
function discount_active(PDO $pdo): array
{
    $rows = $pdo->query(
        "SELECT * FROM discount_codes WHERE active = 1 ORDER BY FIELD(kind, 'first', 'flat', 'big'), id"
    )->fetchAll();
    return array_map('discount_row', $rows);
}

/**
 * Apply the plan for a budget: every active row not in the plan is switched
 * off, then each planned code is written onto an existing row (keeps its id
 * and any usage history) or inserted. The first-order and big codes match by
 * KIND — the most recent row of that kind keeps whatever name marketing gave
 * it — while the flat code matches by TEXT, because VK<n> is the budget and a
 * new budget is a new code. Returns the active rows.
 */
function discount_regenerate(PDO $pdo, float $budgetPct): array
{
    $plan = discount_plan($budgetPct, discount_average_order($pdo));

    $pdo->beginTransaction();
    try {
        $pdo->exec('UPDATE discount_codes SET active = 0');
        $byKind = $pdo->prepare('SELECT id FROM discount_codes WHERE kind = ? ORDER BY active DESC, id DESC LIMIT 1');
        $byCode = $pdo->prepare('SELECT id FROM discount_codes WHERE code = ?');
        $upd = $pdo->prepare(
            'UPDATE discount_codes SET pct = ?, max_amount = ?, min_order = ?, first_order_only = ?, active = 1 WHERE id = ?'
        );
        $ins = $pdo->prepare(
            'INSERT INTO discount_codes (code, kind, pct, max_amount, min_order, first_order_only, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
        );
        foreach ($plan as $p) {
            $find = $p['kind'] === 'flat' ? $byCode : $byKind;
            $find->execute([$p['kind'] === 'flat' ? $p['code'] : $p['kind']]);
            $id = $find->fetchColumn();
            if ($id !== false) {
                $upd->execute([$p['pct'], $p['max_amount'], $p['min_order'], $p['first_order_only'] ? 1 : 0, (int)$id]);
            } else {
                $ins->execute([$p['code'], $p['kind'], $p['pct'], $p['max_amount'], $p['min_order'], $p['first_order_only'] ? 1 : 0]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return discount_active($pdo);
}

/**
 * What a code is worth for this cart. Throws DiscountError with the exact
 * sentence the customer sees. The phone is needed only for first-order codes.
 * $excludeOrderId is the order being edited. An order keeps the code it was
 * placed with: if that order's stored discount_code is the one requested, the
 * code is honoured even if it has since been switched off, and the first-order
 * check is skipped (the order already passed it). Any other code is checked
 * as for a new order, except that the order's own row does not count against
 * a first-order code.
 *
 * The rupee cap is approximate (within ±₹0.40): the order stores a 2-dp
 * percentage, so the amount returned is what that percentage yields on this
 * subtotal, which is exactly what compute_order_total() will bill.
 */
function discount_check(PDO $pdo, string $code, float $subtotal, ?string $phone, ?int $excludeOrderId = null): array
{
    $code = strtoupper(trim($code));
    $ownCode = false;
    if ($excludeOrderId !== null) {
        $own = $pdo->prepare('SELECT discount_code FROM orders WHERE id = ?');
        $own->execute([$excludeOrderId]);
        $ownCode = (string)$own->fetchColumn() === $code && $code !== '';
    }
    $stmt = $pdo->prepare('SELECT * FROM discount_codes WHERE code = ?' . ($ownCode ? '' : ' AND active = 1'));
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new DiscountError("That code isn't valid.");
    }
    $row = discount_row($row);
    $subtotal = round(max(0.0, $subtotal), 2);

    if ($subtotal < $row['min_order']) {
        $more = (int)ceil($row['min_order'] - $subtotal);
        throw new DiscountError("Add ₹$more more to use {$row['code']}.");
    }
    if ($row['first_order_only'] && !$ownCode) {
        $phone = $phone === null ? null : normalize_phone($phone);
        if ($phone === null || $phone === '') {
            throw new DiscountError("Enter your phone number to use {$row['code']}.");
        }
        $sql = "SELECT COUNT(*) FROM orders WHERE phone = ? AND status <> 'cancelled'";
        $args = [$phone];
        if ($excludeOrderId !== null) {
            $sql .= ' AND id <> ?';
            $args[] = $excludeOrderId;
        }
        $prev = $pdo->prepare($sql);
        $prev->execute($args);
        if ((int)$prev->fetchColumn() > 0) {
            throw new DiscountError("{$row['code']} is for your first order only.");
        }
    }
    $amount = min(round($subtotal * $row['pct'] / 100.0, 2), $row['max_amount']);
    $pct = $subtotal > 0 ? round($amount / $subtotal * 100.0, 2) : 0.0;
    $amount = round($subtotal * $pct / 100.0, 2);
    return [
        'code'       => $row['code'],
        'pct'        => $pct,
        'amount'     => $amount,
        'max_amount' => $row['max_amount'],
        'min_order'  => $row['min_order'],
    ];
}

/** The counter ceiling: code plus manual discount, in one place. */
function discount_combined_ok(float $codePct, float $manualPct): bool
{
    return round($codePct + $manualPct, 2) <= DISCOUNT_CEILING_PCT;
}
