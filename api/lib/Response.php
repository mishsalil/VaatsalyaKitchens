<?php
/* JSON response helper for the customer REST API. Mirrors the ERP's
   api/lib/Response.php. Envelope: {error} on failure, {success, ...} or a
   raw object on success. The SPA client throws on `data.error` for non-2xx. */

class Response
{
    public static function json(array $data, int $code = 200): void
    {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error(string $message, int $code = 400): void
    {
        self::json(['error' => $message], $code);
    }

    public static function success(string $message, array $data = []): void
    {
        self::json(array_merge(['success' => $message], $data));
    }
}