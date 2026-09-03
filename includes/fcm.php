<?php
/* Firebase Cloud Messaging (HTTP v1) — the Android app's delivery transport.
 *
 * Web Push cannot reach an installed app: it depends on a browser holding a
 * push connection on the site's behalf. Android routes everything through
 * Google Play services instead, so the app registers for an FCM token
 * (migration_012) and messages are posted to Google addressed to that token.
 *
 * Silently does nothing until a service account is configured, exactly as
 * push.php does without VAPID keys — the rest of the app must work before
 * push is set up.
 *
 * WHY HTTP v1 AND NOT THE LEGACY API
 * The legacy server-key endpoint is retired. v1 authenticates with a short-lived
 * OAuth2 token minted from a service account, which is why this file signs a
 * JWT rather than sending a fixed key. It is also the only version that carries
 * android.notification.channel_id — and the channel is the entire point here,
 * since it decides whether a cancellation arrives at alarm volume or as a
 * silent line in the shade.
 */

require_once __DIR__ . '/db.php';

const FCM_SCOPE     = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_URI = 'https://oauth2.googleapis.com/token';

/** Channel ids, matching NotificationChannels.java in the Android project.
 *  A message naming a channel the app never created is dropped by Android. */
const FCM_CHANNEL_URGENT  = 'vk_urgent';
const FCM_CHANNEL_DEFAULT = 'vk_default';

/** Reads the service-account JSON, or null. Never logs its contents. */
function fcm_service_account(): ?array
{
    static $cached = false;
    static $account = null;
    if ($cached) {
        return $account;
    }
    $cached = true;

    $path = config()['fcm']['service_account'] ?? '';
    if (!is_string($path) || $path === '' || !is_readable($path)) {
        return null;
    }
    $data = json_decode((string)file_get_contents($path), true);
    if (!is_array($data) || empty($data['client_email']) || empty($data['private_key']) || empty($data['project_id'])) {
        error_log('fcm: service account at ' . $path . ' is missing required fields');
        return null;
    }
    $account = $data;
    return $account;
}

function fcm_configured(): bool
{
    return fcm_service_account() !== null;
}

/**
 * Mint an OAuth2 access token by signing a JWT with the service account key.
 *
 * Cached for the life of the request only. A cross-request cache would mean
 * writing a live bearer token to disk to save one round trip on a kitchen-sized
 * volume of notifications — not a trade worth making.
 */
function fcm_access_token(): ?string
{
    static $token = null;
    if ($token !== null) {
        return $token;
    }

    $account = fcm_service_account();
    if (!$account) {
        return null;
    }

    $now = time();
    $header = ['alg' => 'RS256', 'typ' => 'JWT'];
    $claims = [
        'iss'   => $account['client_email'],
        'scope' => FCM_SCOPE,
        'aud'   => $account['token_uri'] ?? FCM_TOKEN_URI,
        'iat'   => $now,
        // Google rejects anything over an hour. Google's clock is the one that
        // matters, so leave a minute of slack for drift on this machine.
        'exp'   => $now + 3540,
    ];

    $unsigned = fcm_base64url(json_encode($header)) . '.' . fcm_base64url(json_encode($claims));
    $signature = '';
    if (!openssl_sign($unsigned, $signature, $account['private_key'], OPENSSL_ALGO_SHA256)) {
        error_log('fcm: could not sign the assertion (bad private key?)');
        return null;
    }
    $assertion = $unsigned . '.' . fcm_base64url($signature);

    [$status, $body] = fcm_http_post(
        $account['token_uri'] ?? FCM_TOKEN_URI,
        http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $assertion,
        ]),
        ['Content-Type: application/x-www-form-urlencoded']
    );

    $json = json_decode((string)$body, true);
    if ($status !== 200 || empty($json['access_token'])) {
        // The response can echo the assertion; log only the status and error code.
        error_log('fcm: token exchange failed, HTTP ' . $status . ' ' . ($json['error'] ?? 'unknown'));
        return null;
    }

    $token = (string)$json['access_token'];
    return $token;
}

/**
 * Send to a set of fcm_tokens rows. Returns [sent, failed].
 *
 * Tokens Google reports as dead are DELETED, mirroring how push_send() prunes
 * gone endpoints. A device that reinstalls the app gets a new token and the old
 * row would otherwise linger forever, costing a failed request every send.
 */
function fcm_send(array $tokenRows, string $title, string $body, string $url = '', bool $urgent = false): array
{
    if (!$tokenRows || !fcm_configured()) {
        return [0, 0];
    }
    $access = fcm_access_token();
    if ($access === null) {
        return [0, count($tokenRows)];
    }

    $account = fcm_service_account();
    $endpoint = 'https://fcm.googleapis.com/v1/projects/' . rawurlencode($account['project_id']) . '/messages:send';
    $headers = ['Authorization: Bearer ' . $access, 'Content-Type: application/json'];

    $sent = 0;
    $failed = 0;
    $dead = [];

    foreach ($tokenRows as $row) {
        $token = (string)($row['token'] ?? '');
        if ($token === '') {
            continue;
        }

        $message = [
            'message' => [
                'token'        => $token,
                'notification' => ['title' => $title, 'body' => $body],
                'android'      => [
                    // "high" is what lets the message wake a dozing device;
                    // normal priority is batched and may arrive much later.
                    'priority'     => $urgent ? 'high' : 'normal',
                    'notification' => [
                        'channel_id' => $urgent ? FCM_CHANNEL_URGENT : FCM_CHANNEL_DEFAULT,
                    ],
                ],
                // Same shape the service worker already reads, so the server
                // describes a notification once for both transports.
                'data' => ['url' => $url !== '' ? $url : '/'],
            ],
        ];

        [$status, $response] = fcm_http_post($endpoint, json_encode($message), $headers);

        if ($status >= 200 && $status < 300) {
            $sent++;
            continue;
        }

        $failed++;
        $err = json_decode((string)$response, true);
        $reason = $err['error']['details'][0]['errorCode'] ?? ($err['error']['status'] ?? '');

        /* UNREGISTERED: the app was uninstalled or the token rotated.
           INVALID_ARGUMENT on a 400 means the token is malformed.
           Both are permanent — retrying them forever is how a send loop slows
           to a crawl as dead devices accumulate. */
        if ($status === 404 || $reason === 'UNREGISTERED' || ($status === 400 && $reason === 'INVALID_ARGUMENT')) {
            $dead[] = $token;
        } else {
            error_log('fcm: send failed, HTTP ' . $status . ' ' . ($reason ?: 'unknown'));
        }
    }

    if ($dead) {
        $in = implode(',', array_fill(0, count($dead), '?'));
        db()->prepare("DELETE FROM fcm_tokens WHERE token IN ($in)")->execute($dead);
    }

    return [$sent, $failed];
}

/** POST helper. Returns [status, body]; never throws. */
function fcm_http_post(string $url, string $payload, array $headers): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);
    $body = curl_exec($ch);
    if ($body === false) {
        $msg = curl_error($ch);
        curl_close($ch);
        error_log('fcm: transport error — ' . $msg);
        return [0, ''];
    }
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$status, (string)$body];
}

function fcm_base64url(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}
