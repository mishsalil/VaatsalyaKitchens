<?php
/* Run once from the command line (or cPanel → Terminal):
       php scripts/generate-vapid.php
   Then paste the two keys into includes/config.php under 'vapid'. */

require __DIR__ . '/../vendor/autoload.php';

$keys = Minishlink\WebPush\VAPID::createVapidKeys();

echo "Add these to includes/config.php:\n\n";
echo "    'vapid' => [\n";
echo "        'subject'     => 'mailto:your-email@example.com',\n";
echo "        'public_key'  => '{$keys['publicKey']}',\n";
echo "        'private_key' => '{$keys['privateKey']}',\n";
echo "    ],\n";
