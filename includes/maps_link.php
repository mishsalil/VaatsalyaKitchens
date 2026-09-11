<?php
/* Expanding a maps.app.goo.gl short link into the full URL whose coordinates
   the client can parse. The short form is what WhatsApp actually sends, and
   it hides the pair behind a redirect.

   No API key, no body fetched: a HEAD-style hop that reads only Location. The
   host allowlist and hop cap are the whole security story — this is an
   admin-triggered server-side request, and the only thing it must never do is
   follow a link off Google. */

const MAPS_LINK_MAX_HOPS = 5;

function maps_link_host_allowed(string $url): bool
{
    $p = parse_url($url);
    if (!$p || ($p['scheme'] ?? '') !== 'https' || empty($p['host'])) {
        return false;
    }
    $host = strtolower($p['host']);
    foreach (['google.com', 'google.co.in', 'goo.gl', 'maps.app.goo.gl'] as $ok) {
        if ($host === $ok || str_ends_with($host, '.' . $ok)) {
            return true;
        }
    }
    return false;
}

/** One redirect hop over curl: the Location header, or null when there is none. */
function maps_link_resolve_once(string $url): ?string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_NOBODY         => true,
        CURLOPT_HEADER         => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_USERAGENT      => 'VaatsalyaKitchens/1.0 (+https://vaatsalyakitchens.in)',
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
    if (!is_string($raw) || !preg_match('/^Location:\s*(\S+)/im', $raw, $m)) {
        return null;
    }
    return $m[1];
}

/**
 * Follow a short link to its final Google Maps URL. Null when the input is not
 * a Google URL, a hop leaves Google, or the chain does not settle in
 * MAPS_LINK_MAX_HOPS. $resolveOnce is injectable so the verification script
 * never touches the network.
 */
function expand_map_link(string $url, ?callable $resolveOnce = null): ?string
{
    $resolveOnce ??= 'maps_link_resolve_once';
    $current = trim($url);
    for ($hop = 0; $hop <= MAPS_LINK_MAX_HOPS; $hop++) {
        if (!maps_link_host_allowed($current)) {
            return null;
        }
        $next = $resolveOnce($current);
        if ($next === null) {
            return $current;
        }
        if ($hop === MAPS_LINK_MAX_HOPS) {
            return null;
        }
        $current = $next;
    }
    return null;
}
