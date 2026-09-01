<?php
/* Order audit trail (migration_007).

   Orders are GST invoices and can now be edited and cancelled by staff as well
   as customers, so every change records who made it. `detail` is a small JSON
   blob written for a human reading the history in the admin drawer — it is
   never parsed back into the order.

   Logging must never break the operation it describes: an order that was
   successfully edited should not 500 because its history row failed to write. */
require_once __DIR__ . '/db.php';

function log_order_event(
    int $orderId,
    string $actorType,
    ?int $actorId,
    string $actorLabel,
    string $action,
    array $detail = []
): void {
    try {
        db()->prepare(
            'INSERT INTO order_events (order_id, actor_type, actor_id, actor_label, action, detail)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([
            $orderId,
            $actorType,
            $actorId,
            mb_substr($actorLabel, 0, 120),
            $action,
            $detail ? json_encode($detail, JSON_UNESCAPED_UNICODE) : null,
        ]);
    } catch (Throwable $e) {
        error_log('order_events: could not log ' . $action . ' on #' . $orderId . ' — ' . $e->getMessage());
    }
}

/** History for one order, oldest first. */
function order_events(int $orderId): array
{
    try {
        $stmt = db()->prepare(
            'SELECT actor_type, actor_label, action, detail, created_at
               FROM order_events WHERE order_id = ? ORDER BY id'
        );
        $stmt->execute([$orderId]);
        $rows = $stmt->fetchAll();
    } catch (Throwable $e) {
        return [];
    }
    foreach ($rows as &$r) {
        $r['detail'] = $r['detail'] ? json_decode($r['detail'], true) : null;
    }
    return $rows;
}
