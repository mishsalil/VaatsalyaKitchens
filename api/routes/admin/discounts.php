<?php
/* Admin → Discounts. The budget number lives here (not on Settings) so the
   codes it produces are on the same screen as the number. */
require_once __DIR__ . '/../../../includes/discounts.php';
require_once __DIR__ . '/../../../includes/settings.php';

/* $budgetPct and $autoPause let a caller that just wrote one of those settings
   pass it straight through instead of reading it back: set_setting() does not
   bust all_settings()'s static cache, so a setting() read in the same request
   would still see the pre-write value. Both are passed on to discount_paused(). */
function discounts_payload(PDO $pdo, ?float $budgetPct = null, ?bool $autoPause = null): array
{
    $rows = $pdo->query('SELECT * FROM discount_codes ORDER BY active DESC, FIELD(kind, \'first\', \'comeback\', \'everyday\', \'flat\', \'big\'), id')->fetchAll();
    $usage = $pdo->prepare(
        "SELECT COUNT(*) AS uses, COALESCE(SUM(code_amount), 0) AS given FROM orders WHERE discount_code = ? AND status <> 'cancelled'"
    );
    $codes = [];
    foreach ($rows as $r) {
        $row = discount_row($r);
        $usage->execute([$row['code']]);
        $u = $usage->fetch();
        $row['uses']  = (int)$u['uses'];
        $row['given'] = (float)$u['given'];
        $codes[] = $row;
    }
    return [
        'budget_pct'    => $budgetPct ?? (float)setting('discount_budget_pct', '0'),
        'average_order' => discount_average_order($pdo),
        'auto_pause'    => $autoPause ?? (setting('discount_auto_pause', '0') === '1'),
        'paused'        => discount_paused($pdo, $budgetPct, $autoPause),
        'month'         => discount_month_stats($pdo),
        'codes'         => $codes,
    ];
}

function route($method, $action, $parts): void
{
    require_admin_cap('discounts');
    $pdo = db();

    if ($action === 'index' && $method === 'GET') {
        Response::json(discounts_payload($pdo));
    }
    if ($action === 'budget' && $method === 'POST') {
        $pct = min(DISCOUNT_BUDGET_MAX, max(0.0, (float)($_POST['pct'] ?? 0)));
        set_setting('discount_budget_pct', (string)$pct);
        discount_regenerate($pdo, $pct);
        Response::json(discounts_payload($pdo, $pct));
    }
    if ($action === 'auto_pause' && $method === 'POST') {
        $on = !empty($_POST['on']);
        set_setting('discount_auto_pause', $on ? '1' : '0');
        Response::json(discounts_payload($pdo, null, $on));
    }
    if ($action === 'regenerate' && $method === 'POST') {
        $pct = (float)setting('discount_budget_pct', '0');
        discount_regenerate($pdo, $pct);
        Response::json(discounts_payload($pdo, $pct));
    }
    if ($action === 'rename' && $method === 'POST') {
        $id = (int)($parts[3] ?? 0);
        $code = strtoupper(trim((string)($_POST['code'] ?? '')));
        if (!preg_match('/^[A-Z0-9]{3,12}$/', $code)) {
            Response::error('A code is 3–12 letters or digits.', 422);
        }
        $dup = $pdo->prepare('SELECT COUNT(*) FROM discount_codes WHERE code = ? AND id <> ?');
        $dup->execute([$code, $id]);
        if ((int)$dup->fetchColumn() > 0) {
            Response::error('That code is already in use.', 422);
        }
        try {
            $pdo->prepare('UPDATE discount_codes SET code = ? WHERE id = ?')->execute([$code, $id]);
        } catch (PDOException $e) {
            // Two admins renaming at once: the UNIQUE key is the real check.
            if ($e->getCode() === '23000') {
                Response::error('That code is already in use.', 422);
            }
            throw $e;
        }
        Response::json(discounts_payload($pdo));
    }
    if ($action === 'active' && $method === 'POST') {
        $id = (int)($parts[3] ?? 0);
        $pdo->prepare('UPDATE discount_codes SET active = ? WHERE id = ?')->execute([!empty($_POST['active']) ? 1 : 0, $id]);
        Response::json(discounts_payload($pdo));
    }
    Response::error('Not found', 404);
}
