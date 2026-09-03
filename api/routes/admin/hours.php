<?php
/* GET  /api/admin/hours                    — kitchen windows + every category's.
   POST /api/admin/hours/kitchen            — replace the kitchen schedule.
   POST /api/admin/hours/category/{id}      — replace one category's windows.

   Both writes are full REPLACEMENTS of the affected rows rather than diffs: a
   weekly schedule is small, and replacing it wholesale means the saved state is
   always exactly what the editor showed — no orphan window can survive a delete
   that the client and server disagreed about.

   Caps follow where the editing lives: the kitchen schedule sits in Settings,
   category windows sit with the Menu. */
require_once __DIR__ . '/../../../includes/hours.php';

/** Validate + normalise posted windows. Returns [rows, error]. */
function hours_parse_windows($raw): array
{
    if (!is_array($raw)) {
        return [null, 'Invalid hours.'];
    }
    if (count($raw) > 70) {
        return [null, 'Too many windows.'];
    }
    $rows = [];
    foreach ($raw as $w) {
        $day = (int)($w['weekday'] ?? -1);
        if ($day < 0 || $day > 6) {
            return [null, 'Invalid day.'];
        }
        $o = trim((string)($w['opens_at'] ?? ''));
        $c = trim((string)($w['closes_at'] ?? ''));
        // Accept HH:MM from an <input type="time">, store HH:MM:SS.
        foreach ([&$o, &$c] as &$t) {
            if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/', $t)) {
                return [null, 'Times must look like 18:00.'];
            }
            if (strlen($t) === 5) {
                $t .= ':00';
            }
        }
        unset($t);
        // Equal times would be a zero-length window that the overnight rule
        // would then read as "open for 24 hours" — reject it rather than
        // silently mean the opposite of what was typed.
        if ($o === $c) {
            return [null, 'Opening and closing times cannot be the same.'];
        }
        $rows[] = ['weekday' => $day, 'opens_at' => $o, 'closes_at' => $c];
    }
    return [$rows, null];
}

function route($method, $action, $parts): void
{
    $admin = require_admin_api();

    if ($action === 'index' && $method === 'GET') {
        if (!admin_can($admin, 'settings') && !admin_can($admin, 'menu')) {
            json_error('You do not have permission to do that.', 403);
        }
        $kitchen = db()->query(
            'SELECT weekday, opens_at, closes_at FROM kitchen_hours ORDER BY weekday, opens_at'
        )->fetchAll();
        $byCat = [];
        foreach (db()->query(
            'SELECT category_id, weekday, opens_at, closes_at FROM category_hours ORDER BY category_id, weekday, opens_at'
        ) as $r) {
            $byCat[(int)$r['category_id']][] = [
                'weekday' => (int)$r['weekday'], 'opens_at' => $r['opens_at'], 'closes_at' => $r['closes_at'],
            ];
        }
        foreach ($kitchen as &$k) {
            $k['weekday'] = (int)$k['weekday'];
        }
        unset($k);
        Response::json(['kitchen' => $kitchen, 'categories' => (object)$byCat]);
    }

    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
    }

    if ($action === 'kitchen') {
        require_admin_cap('settings');
        [$rows, $err] = hours_parse_windows($_POST['windows'] ?? []);
        if ($err !== null) {
            Response::error($err);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->exec('DELETE FROM kitchen_hours');
            $ins = $pdo->prepare('INSERT INTO kitchen_hours (weekday, opens_at, closes_at) VALUES (?, ?, ?)');
            foreach ($rows as $r) {
                $ins->execute([$r['weekday'], $r['opens_at'], $r['closes_at']]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            error_log('hours/kitchen failed: ' . $e->getMessage());
            Response::error('Could not save the hours. Please try again.', 500);
        }
        Response::json(['ok' => true, 'windows' => count($rows)]);
    }

    if ($action === 'category') {
        require_admin_cap('menu');
        $categoryId = (int)($parts[3] ?? 0);
        $stmt = db()->prepare('SELECT id FROM menu_categories WHERE id = ?');
        $stmt->execute([$categoryId]);
        if (!$stmt->fetch()) {
            Response::error('Category not found.', 404);
        }
        [$rows, $err] = hours_parse_windows($_POST['windows'] ?? []);
        if ($err !== null) {
            Response::error($err);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM category_hours WHERE category_id = ?')->execute([$categoryId]);
            $ins = $pdo->prepare('INSERT INTO category_hours (category_id, weekday, opens_at, closes_at) VALUES (?, ?, ?, ?)');
            foreach ($rows as $r) {
                $ins->execute([$categoryId, $r['weekday'], $r['opens_at'], $r['closes_at']]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            error_log('hours/category failed: ' . $e->getMessage());
            Response::error('Could not save the hours. Please try again.', 500);
        }
        // No rows means "follows the kitchen" — that is a valid, meaningful save.
        Response::json(['ok' => true, 'windows' => count($rows)]);
    }

    Response::error('Method not allowed', 405);
}
