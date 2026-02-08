#!/usr/bin/php
<?php
/**
 * Email to Webhook Forwarder for GreenGeeks (cPanel)
 *
 * This script receives piped emails from cPanel and forwards them
 * to your Render webhook endpoint for e-Transfer processing.
 *
 * SETUP INSTRUCTIONS:
 * 1. Upload this file to your GreenGeeks hosting (e.g., /home/yourusername/email-webhook/email-to-webhook.php)
 * 2. Make it executable: chmod +x email-to-webhook.php
 * 3. In cPanel > Forwarders > Add Forwarder:
 *    - Address: rent
 *    - Destination: Pipe to a Program
 *    - Path: /home/yourusername/email-webhook/email-to-webhook.php
 * 4. Update the WEBHOOK_URL and WEBHOOK_SECRET below
 */

// =============================================================================
// CONFIGURATION - UPDATE THESE VALUES
// =============================================================================

// Your Render webhook URL (get this from the e-Transfer Automation page)
define('WEBHOOK_URL', 'https://ga-developments-api.onrender.com/api/webhooks/rent-payment-intake');

// Your webhook secret (get this from the e-Transfer Automation page)
define('WEBHOOK_SECRET', 'YOUR_WEBHOOK_SECRET_HERE');

// Enable logging for debugging (set to false in production)
define('DEBUG_MODE', true);

// Log file path (make sure this directory is writable)
define('LOG_FILE', __DIR__ . '/email-webhook.log');

// =============================================================================
// DO NOT MODIFY BELOW THIS LINE
// =============================================================================

/**
 * Log a message to the log file
 */
function logMessage($message) {
    if (DEBUG_MODE) {
        $timestamp = date('Y-m-d H:i:s');
        $logEntry = "[$timestamp] $message\n";
        file_put_contents(LOG_FILE, $logEntry, FILE_APPEND | LOCK_EX);
    }
}

/**
 * Parse email headers from raw email content
 */
function parseEmailHeaders($rawEmail) {
    $headers = [];
    $lines = explode("\n", $rawEmail);
    $currentHeader = '';
    $currentValue = '';

    foreach ($lines as $line) {
        // Empty line marks end of headers
        if (trim($line) === '') {
            if ($currentHeader !== '') {
                $headers[$currentHeader] = trim($currentValue);
            }
            break;
        }

        // Continuation of previous header (starts with whitespace)
        if (preg_match('/^\s+/', $line)) {
            $currentValue .= ' ' . trim($line);
            continue;
        }

        // New header
        if ($currentHeader !== '') {
            $headers[$currentHeader] = trim($currentValue);
        }

        if (preg_match('/^([^:]+):\s*(.*)$/', $line, $matches)) {
            $currentHeader = strtolower($matches[1]);
            $currentValue = $matches[2];
        }
    }

    return $headers;
}

/**
 * Extract email body from raw email
 */
function extractEmailBody($rawEmail) {
    // Split headers and body
    $parts = preg_split('/\r?\n\r?\n/', $rawEmail, 2);

    if (count($parts) < 2) {
        return $rawEmail; // No clear header/body separation
    }

    $body = $parts[1];

    // Handle multipart emails - extract text/plain part
    if (preg_match('/boundary="?([^"\s]+)"?/i', $parts[0], $matches)) {
        $boundary = $matches[1];
        $bodyParts = explode('--' . $boundary, $body);

        foreach ($bodyParts as $part) {
            // Look for text/plain content
            if (stripos($part, 'Content-Type: text/plain') !== false) {
                // Extract content after headers
                $contentParts = preg_split('/\r?\n\r?\n/', $part, 2);
                if (count($contentParts) >= 2) {
                    $body = trim($contentParts[1]);
                    break;
                }
            }
        }
    }

    // Decode if base64 encoded
    if (preg_match('/Content-Transfer-Encoding:\s*base64/i', $rawEmail)) {
        $decoded = base64_decode($body);
        if ($decoded !== false) {
            $body = $decoded;
        }
    }

    // Decode if quoted-printable
    if (preg_match('/Content-Transfer-Encoding:\s*quoted-printable/i', $rawEmail)) {
        $body = quoted_printable_decode($body);
    }

    return trim($body);
}

/**
 * Send data to webhook endpoint
 */
function sendToWebhook($payload) {
    $jsonPayload = json_encode($payload);

    logMessage("Sending to webhook: " . WEBHOOK_URL);
    logMessage("Payload: " . $jsonPayload);

    $ch = curl_init(WEBHOOK_URL);

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $jsonPayload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Webhook-Secret: ' . WEBHOOK_SECRET,
            'User-Agent: GreenGeeks-Email-Forwarder/1.0'
        ],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    curl_close($ch);

    if ($error) {
        logMessage("cURL Error: $error");
        return false;
    }

    logMessage("Response ($httpCode): $response");

    return $httpCode >= 200 && $httpCode < 300;
}

/**
 * Check if email is an Interac e-Transfer notification
 */
function isInteracEmail($headers, $body) {
    $from = $headers['from'] ?? '';
    $subject = $headers['subject'] ?? '';

    // Check if from Interac
    if (stripos($from, 'interac') !== false ||
        stripos($from, 'payments.interac.ca') !== false) {
        return true;
    }

    // Check subject for e-Transfer keywords
    if (stripos($subject, 'e-transfer') !== false ||
        stripos($subject, 'etransfer') !== false ||
        stripos($subject, 'sent you money') !== false ||
        stripos($subject, 'sent you $') !== false) {
        return true;
    }

    // Check body for e-Transfer indicators
    if (stripos($body, 'INTERAC e-Transfer') !== false ||
        stripos($body, 'sent you $') !== false ||
        stripos($body, 'Reference Number:') !== false) {
        return true;
    }

    return false;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

logMessage("=== Email received ===");

// Read email from stdin (piped from cPanel)
$rawEmail = file_get_contents('php://stdin');

if (empty($rawEmail)) {
    logMessage("ERROR: No email content received");
    exit(1);
}

logMessage("Raw email length: " . strlen($rawEmail) . " bytes");

// Parse the email
$headers = parseEmailHeaders($rawEmail);
$body = extractEmailBody($rawEmail);

$subject = $headers['subject'] ?? 'No Subject';
$from = $headers['from'] ?? 'Unknown';
$to = $headers['to'] ?? '';
$date = $headers['date'] ?? date('r');

logMessage("From: $from");
logMessage("Subject: $subject");
logMessage("To: $to");

// Check if this is an Interac e-Transfer email
if (!isInteracEmail($headers, $body)) {
    logMessage("Not an Interac e-Transfer email - ignoring");
    exit(0);
}

logMessage("Detected as Interac e-Transfer email");

// Prepare webhook payload
$payload = [
    'subject' => $subject,
    'from' => $from,
    'to' => $to,
    'date' => $date,
    'body' => $body,
    'rawEmail' => $rawEmail,
    'receivedAt' => date('c'),
    'source' => 'greengeeks-forwarder'
];

// Send to webhook
$success = sendToWebhook($payload);

if ($success) {
    logMessage("Successfully forwarded to webhook");
    exit(0);
} else {
    logMessage("ERROR: Failed to forward to webhook");
    exit(1);
}
