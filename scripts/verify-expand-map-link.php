<?php
/* The short-link expander, with a stub resolver so this never touches the
   network. What matters: only Google hosts are followed, the hop cap holds,
   and a chain that ends anywhere else is refused. */
chdir(__DIR__ . '/..');
require 'includes/maps_link.php';

$pass = 0; $fail = 0;
function check(string $what, $expected, $actual): void {
    global $pass, $fail;
    if ($expected === $actual) { $pass++; echo "  ok   $what\n"; }
    else { $fail++; printf("  FAIL %s\n         expected %s\n         got      %s\n", $what, var_export($expected, true), var_export($actual, true)); }
}
/** A resolver over a fixed redirect table. */
function table(array $hops): callable {
    return fn(string $url): ?string => $hops[$url] ?? null;
}

echo "follows a short link to its full form\n";
$r = table(['https://maps.app.goo.gl/AbC' => 'https://www.google.com/maps/place/X/@27.5,80.6,17z']);
check('one hop', 'https://www.google.com/maps/place/X/@27.5,80.6,17z', expand_map_link('https://maps.app.goo.gl/AbC', $r));

$r = table([
    'https://maps.app.goo.gl/AbC' => 'https://goo.gl/maps/Def',
    'https://goo.gl/maps/Def'     => 'https://maps.google.com/?q=27.5,80.6',
]);
check('two hops', 'https://maps.google.com/?q=27.5,80.6', expand_map_link('https://maps.app.goo.gl/AbC', $r));

echo "\nrefusals\n";
check('not a google host to begin with', null, expand_map_link('https://evil.example/x', table([])));
$r = table(['https://maps.app.goo.gl/AbC' => 'https://evil.example/steal']);
check('redirect leaves google — refused', null, expand_map_link('https://maps.app.goo.gl/AbC', $r));
$r = table(['https://maps.app.goo.gl/AbC' => 'https://maps.app.goo.gl/AbC']);
check('loop hits the hop cap', null, expand_map_link('https://maps.app.goo.gl/AbC', $r));
check('no redirect at all returns the url itself', 'https://www.google.com/maps?q=1.5,2.5', expand_map_link('https://www.google.com/maps?q=1.5,2.5', table([])));
check('scheme other than https refused', null, expand_map_link('ftp://maps.app.goo.gl/x', table([])));
check('a lookalike host is refused', null, expand_map_link('https://google.com.evil.example/x', table([])));

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
