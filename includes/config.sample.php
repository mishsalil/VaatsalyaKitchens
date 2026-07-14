<?php
/* =====================================================================
   COPY this file to config.php (same folder) and fill in your values.
   config.php is never committed to git — it holds your secrets.
   ===================================================================== */

return [
    // --- MySQL database (from cPanel → MySQL Databases) ---
    'db' => [
        'host'    => 'localhost',
        'name'    => 'vaatsalya_kitchens',
        'user'    => 'vaatsalya_user',
        'pass'    => 'your-database-password',
        'charset' => 'utf8mb4',
    ],

    // --- Kitchen contact ---
    // WhatsApp/phone in international format, digits only: 91XXXXXXXXXX
    'kitchen_whatsapp'      => '919623836382',
    'kitchen_phone_display' => '+91 96238 36382',
    'kitchen_email'         => 'msalil2810@gmail.com',

    // --- Web Push (run: php scripts/generate-vapid.php  and paste output) ---
    'vapid' => [
        'subject'    => 'mailto:msalil2810@gmail.com',
        'public_key'  => '',
        'private_key' => '',
    ],

    // Site base URL, no trailing slash (used in push notification links)
    'base_url' => 'https://www.example.com',

    // Default branch id (multi-branch readiness). Storefront treats this as
    // the current branch; branches live in the `branches` table.
    'default_branch_id' => 1,
];
