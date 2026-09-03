<?php
/* Bearer tokens for API authentication (migration_011).

   Issued at login, sent as `Authorization: Bearer <selector>.<validator>`, and
   resolved on every request. Replaces the session cookie, which a Capacitor
   WebView never sends because it serves the app from https://localhost and the
   cookie is SameSite=Lax.

   Selector/validator, matching customer_tokens: the selector is the indexed
   lookup key, and only a sha256 of the validator is stored, compared with
   hash_equals. A stolen database yields nothing replayable and lookup timing
   leaks nothing about which validators exist. */

require_once __DIR__ . '/db.php';

const AUTH_TOKEN_DAYS = 30;

/** Read the bearer token from the request, or null.
 *
 *  Apache running PHP as CGI/FastCGI drops the Authorization header before it
 *  reaches $_SERVER unless it is explicitly passed through, so fall back to
 *  apache_request_headers(). Without this the app authenticates fine under the
 *  PHP built-in server used in development and fails in production only. */
function auth_bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';

    if ($header === '' && function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                $header = $value;
                break;
            }
        }
    }

    if (!preg_match('/^Bearer\s+(\S+)$/i', trim($header), $m)) {
        return null;
    }
    return $m[1];
}

/** Issue a token for a subject. Returns "selector.validator" — the only moment
 *  the validator exists in plaintext, so the caller must return it to the client
 *  and never log it. */
function auth_token_issue(string $subjectType, int $subjectId, ?string $deviceLabel = null): string
{
    if ($subjectType !== 'customer' && $subjectType !== 'admin') {
        throw new InvalidArgumentException('Unknown auth subject type: ' . $subjectType);
    }

    $selector  = bin2hex(random_bytes(12));      // 24 chars, matches the column
    $validator = bin2hex(random_bytes(32));

    db()->prepare(
        'INSERT INTO auth_tokens (subject_type, subject_id, selector, validator_hash, device_label, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([
        $subjectType,
        $subjectId,
        $selector,
        hash('sha256', $validator),
        $deviceLabel !== null ? mb_substr($deviceLabel, 0, 80) : null,
        (new DateTime('+' . AUTH_TOKEN_DAYS . ' days'))->format('Y-m-d H:i:s'),
    ]);

    return $selector . '.' . $validator;
}

/** Resolve a token to ['subject_type' => ..., 'subject_id' => ...], or null.
 *
 *  Does NOT load the subject row — the caller does that, and is responsible for
 *  failing closed when the customer or admin no longer exists. Records
 *  last_used_at so a dormant device is visible when revoking. */
function auth_token_resolve(?string $token): ?array
{
    if (!is_string($token) || !str_contains($token, '.')) {
        return null;
    }
    [$selector, $validator] = explode('.', $token, 2);

    $stmt = db()->prepare('SELECT * FROM auth_tokens WHERE selector = ? AND expires_at > NOW()');
    $stmt->execute([$selector]);
    $row = $stmt->fetch();

    if (!$row || !hash_equals($row['validator_hash'], hash('sha256', $validator))) {
        return null;
    }

    db()->prepare('UPDATE auth_tokens SET last_used_at = NOW() WHERE id = ?')->execute([(int)$row['id']]);

    return [
        'subject_type' => $row['subject_type'],
        'subject_id'   => (int)$row['subject_id'],
    ];
}

/** Revoke one token — the logout path. Silently ignores an unknown token, since
 *  logging out with an already-dead token is a success from the caller's view. */
function auth_token_revoke(?string $token): void
{
    if (!is_string($token) || !str_contains($token, '.')) {
        return;
    }
    [$selector] = explode('.', $token, 2);
    db()->prepare('DELETE FROM auth_tokens WHERE selector = ?')->execute([$selector]);
}

/** Revoke every token for a subject — "sign out everywhere", and what to call
 *  when a staff member leaves or a counter phone is lost. */
function auth_token_revoke_all(string $subjectType, int $subjectId): void
{
    db()->prepare('DELETE FROM auth_tokens WHERE subject_type = ? AND subject_id = ?')
        ->execute([$subjectType, $subjectId]);
}

/** Delete expired rows, and rows whose subject no longer exists.
 *
 *  auth_tokens has no foreign key (subject_type is polymorphic), so nothing
 *  cascades. Orphans cannot authenticate — resolution fails closed when the
 *  subject row is missing — but they should not accumulate either. */
function auth_tokens_purge(): int
{
    $sql = 'DELETE FROM auth_tokens
             WHERE expires_at <= NOW()
                OR (subject_type = \'customer\' AND subject_id NOT IN (SELECT id FROM customers))
                OR (subject_type = \'admin\'    AND subject_id NOT IN (SELECT id FROM admin_users))';
    $stmt = db()->prepare($sql);
    $stmt->execute();
    return $stmt->rowCount();
}
