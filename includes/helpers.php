<?php
/* Small shared utilities: JSON responses, input handling, phone normalization. */

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $status = 400): never
{
    json_response(['ok' => false, 'error' => $message], $status);
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    return is_array($data) ? $data : [];
}

/** Normalize an Indian phone number to digits with country code, or null if invalid. */
function normalize_phone(string $raw): ?string
{
    $digits = preg_replace('/\D+/', '', $raw);
    if (strlen($digits) === 10) {
        $digits = '91' . $digits;
    } elseif (strlen($digits) === 11 && str_starts_with($digits, '0')) {
        $digits = '91' . substr($digits, 1);
    }
    if (strlen($digits) === 12 && str_starts_with($digits, '91')) {
        return $digits;
    }
    return null;
}

/** Format 91XXXXXXXXXX as +91 XXXXX XXXXX for display. */
function display_phone(string $phone): string
{
    if (strlen($phone) === 12 && str_starts_with($phone, '91')) {
        return '+91 ' . substr($phone, 2, 5) . ' ' . substr($phone, 7);
    }
    return $phone;
}

function e(?string $s): string
{
    return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8');
}

function rupees(float $n): string
{
    return '₹' . number_format($n, ($n == floor($n)) ? 0 : 2);
}

/** Rate limiting backed by the login_attempts table. */
function too_many_attempts(string $identifier, int $max = 5, int $windowMinutes = 15): bool
{
    $stmt = db()->prepare(
        'SELECT COUNT(*) AS c FROM login_attempts
          WHERE identifier = ? AND attempted_at > (NOW() - INTERVAL ' . (int)$windowMinutes . ' MINUTE)'
    );
    $stmt->execute([$identifier]);
    return (int)$stmt->fetch()['c'] >= $max;
}

function record_attempt(string $identifier): void
{
    db()->prepare('INSERT INTO login_attempts (identifier) VALUES (?)')->execute([$identifier]);
    // opportunistic cleanup of old rows
    db()->exec('DELETE FROM login_attempts WHERE attempted_at < (NOW() - INTERVAL 1 DAY)');
}

function clear_attempts(string $identifier): void
{
    db()->prepare('DELETE FROM login_attempts WHERE identifier = ?')->execute([$identifier]);
}

/** Human labels for order statuses, shared by customer pages, admin, and push texts. */
function status_label(string $status): string
{
    return match ($status) {
        'new'              => 'Received',
        'confirmed'        => 'Confirmed',
        'preparing'        => 'Being prepared',
        'out_for_delivery' => 'Out for delivery',
        'delivered'        => 'Delivered',
        'cancelled'        => 'Cancelled',
        default            => $status,
    };
}
