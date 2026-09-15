<?php
/* Discount codes. One number from the admin — the share of sales the kitchen
   is willing to give away this month — sizes five codes, one per kind of
   customer (first order, lapsed, everyday, flat, big basket). The budget is
   NOT the code percentage: a code may say 50 % while the rupee cap, derived
   from the budget and the average order, is what limits it. This file is the
   only place that decides what a code is worth. Both order routes and the
   admin route call in here; nothing else touches discount_codes.

   Month statistics (given / sales) say whether the kitchen is inside its
   target; with the auto-pause setting on, going over it pauses every code
   except the first-order one until the month turns.

   The 24 % ceiling is the counter rule: a code alone is always allowed, but
   the manual discount stacked on top may not take the pair past 24 %. */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/settings.php';

const DISCOUNT_CEILING_PCT = 24.0;
const DISCOUNT_BUDGET_MAX  = 50.0;
const DISCOUNT_KINDS = ['first', 'comeback', 'everyday', 'flat', 'big'];

class DiscountError extends RuntimeException {}

/**
 * The five codes for budget B (percent, clamped to 0–50) and average order A
 * (rupees). C = round(B % of A to ₹10) is the everyday cap; the others are
 * multiples of it. Floors snap to ₹50. Budget 0, or one too small for a
 * ₹10 cap → no codes: a plan of ₹0 codes is not a plan.
 */
function discount_plan(float $budgetPct, float $avgOrder): array
{
    $b = min(max($budgetPct, 0.0), DISCOUNT_BUDGET_MAX);
    $c = $b > 0 ? (float)(round($b / 100 * $avgOrder / 10) * 10) : 0.0;
    if ($c <= 0) {
        return [];
    }
    $snap = fn(float $rupees) => (float)(round($rupees / 50) * 50);
    $row = fn(string $code, string $kind, float $pct, float $cap, float $min, bool $first = false, int $lapsed = 0) =>
        compact('code', 'kind', 'pct') + ['max_amount' => $cap, 'min_order' => $min, 'first_order_only' => $first, 'lapsed_days' => $lapsed];
    return [
        $row('WELCOME',  'first',    50.0, 1.5 * $c, 0.0, true),
        $row('COMEBACK', 'comeback', 30.0, 1.5 * $c, 0.0, false, 45),
        $row('VK10',     'everyday', 10.0, $c,       0.0),
        $row('VK20',     'flat',     20.0, 1.5 * $c, $snap($avgOrder)),
        $row('FEAST',    'big',      30.0, 3 * $c,   $snap(2 * $avgOrder)),
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
        'lapsed_days'      => (int)$r['lapsed_days'],
        'active'           => (int)$r['active'] === 1,
        'created_at'       => $r['created_at'],
    ];
}

/** This calendar month, cancelled orders excluded: sales, rupees given to codes, and given as a percentage of sales. */
function discount_month_stats(PDO $pdo): array
{
    $r = $pdo->query(
        "SELECT COALESCE(SUM(subtotal),0) AS sales, COALESCE(SUM(code_amount),0) AS given FROM orders
          WHERE status <> 'cancelled' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')"
    )->fetch();
    $sales = (float)$r['sales'];
    $given = (float)$r['given'];
    return ['sales' => $sales, 'given' => $given, 'pct' => $sales > 0 ? round($given / $sales * 100, 2) : 0.0];
}

/**
 * Auto-pause on AND this month's given/sales is over the budget. Computed at
 * read time; nothing is written. Both inputs default to the settings; a
 * caller that has just written a setting passes the new value explicitly
 * (all_settings() caches for the request).
 */
function discount_paused(PDO $pdo, ?float $budgetPct = null, ?bool $autoPause = null): bool
{
    $autoPause ??= setting('discount_auto_pause', '0') === '1';
    if (!$autoPause) {
        return false;
    }
    $budgetPct ??= (float)setting('discount_budget_pct', '0');
    return $budgetPct > 0 && discount_month_stats($pdo)['pct'] > $budgetPct;
}

/** Active codes in kind order, each flagged 'paused' (never the first-order code). */
function discount_active(PDO $pdo, ?float $budgetPct = null, ?bool $autoPause = null): array
{
    $rows = $pdo->query(
        "SELECT * FROM discount_codes WHERE active = 1 ORDER BY FIELD(kind, 'first', 'comeback', 'everyday', 'flat', 'big'), id"
    )->fetchAll();
    $paused = discount_paused($pdo, $budgetPct, $autoPause);
    return array_map(function (array $r) use ($paused) {
        $row = discount_row($r);
        $row['paused'] = $paused && $row['kind'] !== 'first';
        return $row;
    }, $rows);
}

/**
 * Apply the plan for a budget: every active row not in the plan is switched
 * off, then each planned code is written onto an existing row (keeps its id
 * and any usage history) or inserted. Every code matches by KIND — the most
 * recent row of that kind keeps whatever name marketing gave it. With no row
 * of the kind, a row already carrying the planned TEXT is taken over instead
 * of inserted (the old plan named its flat code VK<budget>, so a legacy VK10
 * or VK20 may sit there under another kind, and code is unique). Returns the
 * active rows.
 */
function discount_regenerate(PDO $pdo, float $budgetPct): array
{
    $plan = discount_plan($budgetPct, discount_average_order($pdo));

    $pdo->beginTransaction();
    try {
        $pdo->exec('UPDATE discount_codes SET active = 0');
        $byKind = $pdo->prepare('SELECT id FROM discount_codes WHERE kind = ? ORDER BY active DESC, id DESC LIMIT 1');
        $byText = $pdo->prepare('SELECT id FROM discount_codes WHERE code = ?');
        $upd = $pdo->prepare(
            'UPDATE discount_codes SET kind = ?, pct = ?, max_amount = ?, min_order = ?, first_order_only = ?, lapsed_days = ?, active = 1 WHERE id = ?'
        );
        $ins = $pdo->prepare(
            'INSERT INTO discount_codes (code, kind, pct, max_amount, min_order, first_order_only, lapsed_days, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
        );
        foreach ($plan as $p) {
            $byKind->execute([$p['kind']]);
            $id = $byKind->fetchColumn();
            if ($id === false) {
                $byText->execute([$p['code']]);
                $id = $byText->fetchColumn();
            }
            if ($id !== false) {
                $upd->execute([$p['kind'], $p['pct'], $p['max_amount'], $p['min_order'], $p['first_order_only'] ? 1 : 0, $p['lapsed_days'], (int)$id]);
            } else {
                $ins->execute([$p['code'], $p['kind'], $p['pct'], $p['max_amount'], $p['min_order'], $p['first_order_only'] ? 1 : 0, $p['lapsed_days']]);
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
 * sentence the customer sees, in this order: unknown, below the floor, phone
 * missing (first-order and comeback codes), first-order code on a phone with
 * a prior order, comeback code on a phone with none / with one too recent,
 * and last the pause — so the customer hears the real reason first.
 * $excludeOrderId is the order being edited. An order keeps the code it was
 * placed with: if that order's stored discount_code is the one requested, the
 * code is honoured even if it has since been switched off or paused, and the
 * phone-based checks are skipped (the order already passed them). Any other
 * code is checked as for a new order, except that the order's own row does
 * not count as a prior order.
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
    if (($row['first_order_only'] || $row['lapsed_days'] > 0) && !$ownCode) {
        $phone = $phone === null ? null : normalize_phone($phone);
        if ($phone === null || $phone === '') {
            throw new DiscountError("Enter your phone number to use {$row['code']}.");
        }
        // The lapsed comparison stays inside SQL: PHP and MySQL do not share
        // a clock on the production host, so created_at is only ever measured
        // against NOW() from the same connection.
        $sql = "SELECT COUNT(*) AS n, COALESCE(MAX(created_at) > NOW() - INTERVAL ? DAY, 0) AS recent
                  FROM orders WHERE phone = ? AND status <> 'cancelled'";
        $args = [$row['lapsed_days'], $phone];
        if ($excludeOrderId !== null) {
            $sql .= ' AND id <> ?';
            $args[] = $excludeOrderId;
        }
        $prev = $pdo->prepare($sql);
        $prev->execute($args);
        $r = $prev->fetch();
        if ($row['first_order_only'] && (int)$r['n'] > 0) {
            throw new DiscountError("{$row['code']} is for your first order only.");
        }
        if ($row['lapsed_days'] > 0) {
            if ((int)$r['n'] === 0) {
                throw new DiscountError("{$row['code']} is for returning customers — try WELCOME on your first order.");
            }
            if ((int)$r['recent']) {
                throw new DiscountError("{$row['code']} is for customers we haven't seen in a while.");
            }
        }
    }
    if (!$ownCode && $row['kind'] !== 'first' && discount_paused($pdo)) {
        throw new DiscountError("{$row['code']} is taking a break this month.");
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

/** The counter ceiling: a code alone is always allowed; a manual discount on top may not take the pair past 24 %. */
function discount_combined_ok(float $codePct, float $manualPct): bool
{
    return $manualPct <= 0 || round($codePct + $manualPct, 2) <= DISCOUNT_CEILING_PCT;
}
