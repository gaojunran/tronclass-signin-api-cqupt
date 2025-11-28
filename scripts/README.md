# Cookie Refresh Automation

This directory contains scripts for automating cookie refresh tasks.

## Scripts

### `identity-refresh-cookies.ts`

Automatically refreshes cookies for all users with identity credentials by:
1. Fetching user list from the API
2. Using Puppeteer to automate browser login
3. Extracting cookies after successful login
4. Updating cookies via the API

## GitHub Actions Setup

The workflow `.github/workflows/refresh-cookies.yml` runs daily at 10:00 AM UTC.

### Required Secrets

You need to configure the following secrets in your GitHub repository settings:

1. **EMAIL_USERNAME**: Your email SMTP username (e.g., your Gmail address)
2. **EMAIL_PASSWORD**: Your email SMTP password (for Gmail, use an App Password)
3. **EMAIL_TO**: The recipient email address for notifications

#### Setting up Gmail App Password

1. Go to your Google Account settings
2. Navigate to Security → 2-Step Verification
3. Scroll down to "App passwords"
4. Generate a new app password for "Mail"
5. Use this password as `EMAIL_PASSWORD`

### Manual Trigger

You can manually trigger the workflow from the GitHub Actions tab by clicking "Run workflow".

## Local Testing

To test the script locally:

```bash
deno run -A scripts/identity-refresh-cookies.ts
```

**Note**: You need to have Chromium installed locally for Puppeteer to work.

## How It Works

1. **Fetch Users**: Retrieves all users from `https://tronclass.codenebula.deno.net/user/list`
2. **Filter Users**: Only processes users with both `identity_account` and `identity_password`
3. **Browser Automation**: For each user:
   - Opens `http://lms.tc.cqupt.edu.cn/`
   - Waits for redirect to `https://ids.cqupt.edu.cn/authserver/login...`
   - Fills in username and password
   - Checks "Remember Me" checkbox
   - Clicks login button
   - Waits for redirect back to `http://lms.tc.cqupt.edu.cn/user/index#/`
   - Extracts cookies using `document.cookie`
4. **Update API**: Calls `POST /user/refresh/:id` to update the cookie
5. **Email Report**: Sends execution summary via email

## Troubleshooting

- **Browser launch fails**: Ensure Chromium is installed in the GitHub Actions runner
- **Login fails**: Check if the identity credentials are correct
- **API update fails**: Verify the API endpoint is accessible
- **Email not sent**: Check if the email secrets are configured correctly
