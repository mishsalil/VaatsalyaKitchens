<?php
/* Opening hours — the kitchen's schedule, and per-category availability
   (migration_010).

   The server is the authority. The storefront greys out closed sections and
   nudges the date picker, but every rule here is re-checked on order create,
   because a client can be stale, cached, or simply lying.

   TWO IDEAS DO THE WORK:

   1. A window may cross midnight. When closes_at <= opens_at the window runs
      into the following day (22:00-02:00 is a real dinner service). So a moment
      is inside a window if it matches the window on ITS OWN weekday, or the
      overnight tail of YESTERDAY's window.

   2. A category window is an intersection, never a grant. A category with no
      rows follows the kitchen. A category WITH rows is available only where its
      own window and the kitchen's overlap — configuring Tandoor for 06:00-23:00
      cannot make it orderable at 06:00 if the kitchen opens at 08:00. */
require_once __DIR__ . '/db.php';

/** All kitchen windows, grouped by weekday (0=Sun .. 6=Sat). */
function kitchen_windows(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $out = array_fill(0, 7, []);
    try {
        foreach (db()->query('SELECT weekday, opens_at, closes_at FROM kitchen_hours ORDER BY weekday, opens_at') as $r) {
            $out[(int)$r['weekday']][] = ['opens' => $r['opens_at'], 'closes' => $r['closes_at']];
        }
    } catch (Throwable $e) {
        return $cache = array_fill(0, 7, []);
    }
    return $cache = $out;
}

/** Windows for one category, grouped by weekday. Empty = follows the kitchen. */
function category_windows(int $categoryId): array
{
    static $cache = [];
    if (isset($cache[$categoryId])) {
        return $cache[$categoryId];
    }
    $out = array_fill(0, 7, []);
    try {
        $stmt = db()->prepare('SELECT weekday, opens_at, closes_at FROM category_hours WHERE category_id = ? ORDER BY weekday, opens_at');
        $stmt->execute([$categoryId]);
        foreach ($stmt->fetchAll() as $r) {
            $out[(int)$r['weekday']][] = ['opens' => $r['opens_at'], 'closes' => $r['closes_at']];
        }
    } catch (Throwable $e) {
        return $cache[$categoryId] = array_fill(0, 7, []);
    }
    return $cache[$categoryId] = $out;
}

/** Seconds since midnight for a H:i:s string. */
function hours_secs(string $t): int
{
    [$h, $m, $s] = array_pad(array_map('intval', explode(':', $t)), 3, 0);
    return $h * 3600 + $m * 60 + $s;
}

/**
 * Is $when inside any window in $byWeekday?
 * Checks today's windows, then yesterday's overnight tails.
 */
function hours_within(array $byWeekday, DateTimeInterface $when): bool
{
    $day  = (int)$when->format('w');
    $secs = hours_secs($when->format('H:i:s'));

    foreach ($byWeekday[$day] ?? [] as $w) {
        $o = hours_secs($w['opens']);
        $c = hours_secs($w['closes']);
        if ($c > $o) {
            if ($secs >= $o && $secs <= $c) return true;
        } else {
            // Crosses midnight — the part of it that falls on this day.
            if ($secs >= $o) return true;
        }
    }
    // The tail of a window that opened yesterday and runs past midnight.
    $prev = ($day + 6) % 7;
    foreach ($byWeekday[$prev] ?? [] as $w) {
        $o = hours_secs($w['opens']);
        $c = hours_secs($w['closes']);
        if ($c <= $o && $secs <= $c) return true;
    }
    return false;
}

/** Is the kitchen open at this moment? */
function kitchen_is_open(DateTimeInterface $when): bool
{
    return hours_within(kitchen_windows(), $when);
}

/** Is this category orderable at this moment? Kitchen hours always apply. */
function category_is_open(int $categoryId, DateTimeInterface $when): bool
{
    if (!kitchen_is_open($when)) {
        return false;
    }
    $own = category_windows($categoryId);
    $hasAny = false;
    foreach ($own as $day) {
        if ($day) { $hasAny = true; break; }
    }
    return $hasAny ? hours_within($own, $when) : true;
}

/**
 * The next moment the kitchen opens, at or after $from. Scans minute by minute
 * over the next 14 days — cheap, and immune to the edge cases that closed-form
 * arithmetic gets wrong (split shifts, overnight tails, a day with no windows).
 * Returns null if no window exists at all, i.e. the schedule is empty.
 */
function kitchen_next_open(DateTimeInterface $from): ?DateTimeImmutable
{
    $t = DateTimeImmutable::createFromInterface($from)->setTime(
        (int)$from->format('H'), (int)$from->format('i'), 0
    );
    for ($i = 0; $i < 14 * 24 * 60; $i++) {
        if (kitchen_is_open($t)) {
            return $t;
        }
        $t = $t->modify('+1 minute');
    }
    return null;
}

/** Category ids that are closed at this moment (for greying out the menu). */
function closed_category_ids(DateTimeInterface $when): array
{
    $out = [];
    try {
        foreach (db()->query('SELECT id FROM menu_categories')->fetchAll(PDO::FETCH_COLUMN) as $id) {
            if (!category_is_open((int)$id, $when)) {
                $out[] = (int)$id;
            }
        }
    } catch (Throwable $e) {
        return [];
    }
    return $out;
}

/** Human summary of a day's windows, e.g. "11:00 AM – 3:00 PM, 6:00 PM – 11:00 PM". */
function hours_describe_day(array $windows): string
{
    if (!$windows) {
        return 'Closed';
    }
    $parts = [];
    foreach ($windows as $w) {
        $parts[] = date('g:i A', strtotime($w['opens'])) . ' – ' . date('g:i A', strtotime($w['closes']));
    }
    return implode(', ', $parts);
}
