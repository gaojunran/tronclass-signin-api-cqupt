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

The workflow `.github/workflows/refresh-cookies.yml` runs daily at 10:00 AM UTC on the `dev` branch.

### Features

- **Automatic Chrome Installation**: Uses `browser-actions/setup-chrome` to automatically install Chrome and dependencies
- **Retry Mechanism**: Automatically retries up to 3 times on failure
- **Branch Control**: Scheduled tasks only run on `dev` branch to avoid duplication
- **Built-in Notifications**: Uses GitHub's native notification system (no email configuration needed)

### Manual Trigger

You can manually trigger the workflow from the GitHub Actions tab by clicking "Run workflow".

### Viewing Results

- Check the **Actions** tab in your GitHub repository
- Click on the workflow run to see detailed logs
- The summary page shows a formatted report with success/failure status
- GitHub will send you email notifications if the workflow fails (configure in your GitHub notification settings)

## Local Testing

To test the script locally:

```bash
# Run with default Puppeteer Chrome
deno run -A scripts/identity-refresh-cookies.ts

# Or specify a custom Chrome path
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome deno run -A scripts/identity-refresh-cookies.ts
```

**Note**: 
- Puppeteer will automatically download Chromium on first run if no Chrome is specified
- You can also use your system Chrome by setting `PUPPETEER_EXECUTABLE_PATH`

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

- **Browser launch fails**: 
  - Check if Chrome was installed successfully in the workflow logs
  - Verify `PUPPETEER_EXECUTABLE_PATH` is set correctly
  - The workflow will automatically retry up to 3 times
- **Login fails**: 
  - Check if the identity credentials are correct
  - Verify the login page URL hasn't changed
- **API update fails**: 
  - Verify the API endpoint `https://tronclass.codenebula.deno.net` is accessible
  - Check API logs for error details
- **Workflow not running**: 
  - Scheduled tasks only run on `dev` branch
  - Check if GitHub Actions is enabled for your repository
