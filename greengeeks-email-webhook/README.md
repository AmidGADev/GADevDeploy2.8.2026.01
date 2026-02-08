# GreenGeeks Email-to-Webhook Forwarder

This script forwards Interac e-Transfer emails to your GA Developments webhook for automatic payment reconciliation.

## Files

- `email-to-webhook.php` - Main script that receives piped emails
- `test-webhook.php` - Test script to verify configuration

## Setup Instructions

### Step 1: Get Your Webhook Secret

1. Go to your GA Developments admin panel
2. Navigate to **e-Transfer Automation**
3. Copy the **Webhook Secret** (it looks like `pwh_abc123...`)

### Step 2: Upload Files to GreenGeeks

1. Log into GreenGeeks cPanel
2. Open **File Manager**
3. Create a new folder: `/home/YOUR_USERNAME/email-webhook/`
4. Upload both PHP files to this folder

### Step 3: Configure the Script

1. In File Manager, edit `email-to-webhook.php`
2. Find this line near the top:
   ```php
   define('WEBHOOK_SECRET', 'YOUR_WEBHOOK_SECRET_HERE');
   ```
3. Replace `YOUR_WEBHOOK_SECRET_HERE` with your actual webhook secret
4. Save the file

### Step 4: Make Script Executable

1. In cPanel, open **Terminal** (or use SSH)
2. Run:
   ```bash
   chmod +x /home/YOUR_USERNAME/email-webhook/email-to-webhook.php
   ```

### Step 5: Test the Configuration

1. In Terminal, run:
   ```bash
   php /home/YOUR_USERNAME/email-webhook/test-webhook.php
   ```
2. You should see "SUCCESS!" if everything is configured correctly

### Step 6: Set Up Email Forwarder

1. In cPanel, go to **Email** → **Forwarders**
2. Click **Add Forwarder**
3. Fill in:
   - **Address to Forward**: `rent`
   - **Domain**: `gadevelopments.ca`
4. Under **Destination**, select **Pipe to a Program**
5. Enter the path: `/home/YOUR_USERNAME/email-webhook/email-to-webhook.php`
6. Click **Add Forwarder**

### Step 7: Test with a Real Email

1. Send a test e-Transfer to `rent@gadevelopments.ca`
2. Check the **e-Transfer Automation** page in your admin panel
3. The payment should appear in the Activity Log

## Troubleshooting

### Check the Log File
```bash
cat /home/YOUR_USERNAME/email-webhook/email-webhook.log
```

### Common Issues

1. **Permission denied**: Make sure the script is executable (`chmod +x`)
2. **401 Unauthorized**: Check that WEBHOOK_SECRET matches your Render env variable
3. **404 Not Found**: Verify your Render app is deployed and the URL is correct
4. **No emails received**: Check cPanel email routing and forwarder settings

### Disable Debug Logging (Production)

Once everything is working, edit `email-to-webhook.php` and change:
```php
define('DEBUG_MODE', false);
```

## Support

For issues with:
- **This script**: Check the log file first
- **GA Developments app**: Contact your developer
- **GreenGeeks hosting**: Contact GreenGeeks support
