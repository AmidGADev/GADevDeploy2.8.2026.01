#!/usr/bin/php
<?php
/**
 * Test Script for Email Webhook Forwarder
 *
 * Run this script manually to test if your configuration is correct
 * Usage: php test-webhook.php
 */

// Include the same configuration
define('WEBHOOK_URL', 'https://ga-developments-api.onrender.com/api/webhooks/rent-payment-intake');
define('WEBHOOK_SECRET', 'YOUR_WEBHOOK_SECRET_HERE');

echo "=== Email Webhook Test ===\n\n";

// Test 1: Check PHP version
echo "1. PHP Version: " . PHP_VERSION . "\n";
if (version_compare(PHP_VERSION, '7.0.0') < 0) {
    echo "   WARNING: PHP 7.0+ recommended\n";
}

// Test 2: Check cURL
echo "2. cURL Extension: ";
if (function_exists('curl_init')) {
    echo "OK\n";
} else {
    echo "MISSING - cURL is required!\n";
    exit(1);
}

// Test 3: Check JSON
echo "3. JSON Extension: ";
if (function_exists('json_encode')) {
    echo "OK\n";
} else {
    echo "MISSING - JSON is required!\n";
    exit(1);
}

// Test 4: Check webhook URL
echo "4. Webhook URL: $WEBHOOK_URL\n";

// Test 5: Check webhook secret
echo "5. Webhook Secret: ";
if (WEBHOOK_SECRET === 'YOUR_WEBHOOK_SECRET_HERE') {
    echo "NOT SET - Please update WEBHOOK_SECRET!\n";
} else {
    echo substr(WEBHOOK_SECRET, 0, 8) . "****\n";
}

// Test 6: Test connection to webhook
echo "\n6. Testing connection to webhook...\n";

$testPayload = [
    'subject' => 'TEST: INTERAC e-Transfer: Test User sent you money',
    'from' => 'notify@payments.interac.ca',
    'to' => 'rent@gadevelopments.ca',
    'date' => date('r'),
    'body' => 'Hi,

Test User sent you $1,500.00 (CAD).

The money has been automatically deposited to your account ending in ****1234.

Message from Test User:
Test payment - Unit 101 - ' . date('F Y') . '

Reference Number: TEST' . strtoupper(substr(md5(time()), 0, 10)) . '

This e-Transfer was completed securely with Interac e-Transfer Autodeposit.

---
Interac e-Transfer | Virement Interac',
    'receivedAt' => date('c'),
    'source' => 'greengeeks-test'
];

$ch = curl_init(WEBHOOK_URL);

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($testPayload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'X-Webhook-Secret: ' . WEBHOOK_SECRET,
        'User-Agent: GreenGeeks-Email-Forwarder/1.0-Test'
    ],
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);

curl_close($ch);

if ($error) {
    echo "   ERROR: $error\n";
    exit(1);
}

echo "   HTTP Status: $httpCode\n";
echo "   Response: $response\n";

if ($httpCode >= 200 && $httpCode < 300) {
    echo "\n✅ SUCCESS! Webhook is working correctly.\n";
    echo "   Check your e-Transfer Automation page for the test entry.\n";
} elseif ($httpCode === 401 || $httpCode === 403) {
    echo "\n❌ AUTHENTICATION FAILED\n";
    echo "   Make sure WEBHOOK_SECRET matches your Render environment variable.\n";
} elseif ($httpCode === 404) {
    echo "\n❌ ENDPOINT NOT FOUND\n";
    echo "   Make sure WEBHOOK_URL is correct and your Render app is deployed.\n";
} else {
    echo "\n❌ UNEXPECTED RESPONSE\n";
    echo "   Check the response above for details.\n";
}

echo "\n=== Test Complete ===\n";
