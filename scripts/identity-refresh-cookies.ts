import puppeteer from "npm:puppeteer";

const API_ENDPOINT = "https://tronclass.codenebula.deno.net";
const LOGIN_URL = "http://lms.tc.cqupt.edu.cn/";
const TARGET_URL = "http://lms.tc.cqupt.edu.cn/user/index#/";

/**
 * Find Chromium executable path
 */
function findChromiumPath(): string | undefined {
  const possiblePaths = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];

  for (const path of possiblePaths) {
    try {
      const stat = Deno.statSync(path);
      if (stat.isFile) {
        console.log(`✅ Found Chromium at: ${path}`);
        return path;
      }
    } catch {
      // File doesn't exist, continue
    }
  }

  console.log("⚠️ No Chromium executable found in standard paths");
  return undefined;
}

interface User {
  id: string;
  name: string;
  is_auto: boolean;
  identity_account?: string | null;
  identity_password?: string | null;
  latest_cookie: string | null;
  expires: string | null;
}

interface RefreshResult {
  userId: string;
  userName: string;
  success: boolean;
  error?: string;
  newCookie?: string;
}

/**
 * Fetch all users from the API
 */
async function fetchUsers(): Promise<User[]> {
  try {
    const response = await fetch(`${API_ENDPOINT}/user/list`);
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.statusText}`);
    }
    const users = await response.json();
    return users;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
}

/**
 * Update user cookie via API
 */
async function updateUserCookie(
  userId: string,
  cookie: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_ENDPOINT}/user/refresh/${userId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ua_info: "GitHub Actions Cookie Refresh Bot",
        cookie: cookie,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Failed to update cookie: ${errorData.error || response.statusText}`
      );
    }

    return true;
  } catch (error) {
    console.error(`Error updating cookie for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Refresh cookie for a single user using Puppeteer
 */
async function refreshCookieForUser(
  user: User,
  browser: puppeteer.Browser
): Promise<RefreshResult> {
  const result: RefreshResult = {
    userId: user.id,
    userName: user.name,
    success: false,
  };

  console.log(`\n[${user.name}] Starting cookie refresh...`);

  let page: puppeteer.Page | null = null;

  try {
    // Create a new page
    page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`[${user.name}] Navigating to ${LOGIN_URL}...`);

    // Navigate to the initial URL
    await page.goto(LOGIN_URL, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for redirect to login page
    console.log(`[${user.name}] Waiting for redirect to login page...`);
    await page.waitForSelector("#username", { timeout: 30000 });

    console.log(`[${user.name}] Login page loaded, filling credentials...`);

    // Fill in username
    await page.type("#username", user.identity_account!, { delay: 50 });

    // Fill in password
    await page.type("#password", user.identity_password!, { delay: 50 });

    // Check "Remember Me"
    await page.click("#rememberMe");

    console.log(`[${user.name}] Submitting login form...`);

    // Click login button
    await page.click("#login_submit");

    // Wait for navigation to complete
    await page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    console.log(`[${user.name}] Waiting for target page to load...`);

    // Wait for the target URL
    await page.waitForFunction(
      (targetUrl) => window.location.href.startsWith(targetUrl),
      { timeout: 30000 },
      TARGET_URL
    );

    // Additional wait to ensure page is fully rendered
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(`[${user.name}] Extracting cookies...`);

    // Get cookies using evaluate
    const cookieString = await page.evaluate(() => document.cookie);

    if (!cookieString) {
      throw new Error("Failed to extract cookie from page");
    }

    console.log(`[${user.name}] Cookie extracted, updating via API...`);

    // Update cookie via API
    await updateUserCookie(user.id, cookieString);

    result.success = true;
    result.newCookie = cookieString.substring(0, 50) + "..."; // Truncate for logging

    console.log(`[${user.name}] ✅ Cookie refresh successful!`);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`[${user.name}] ❌ Cookie refresh failed:`, result.error);
  } finally {
    if (page) {
      await page.close();
    }
  }

  return result;
}

/**
 * Main function
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Cookie Refresh Task Started");
  console.log("Time:", new Date().toISOString());
  console.log("=".repeat(60));

  let browser: puppeteer.Browser | null = null;
  const results: RefreshResult[] = [];

  try {
    // Fetch all users
    console.log("\n📥 Fetching user list from API...");
    const users = await fetchUsers();
    console.log(`Found ${users.length} total users`);

    // Filter users with identity credentials
    const usersWithCredentials = users.filter(
      (user) => user.identity_account && user.identity_password
    );

    console.log(
      `Found ${usersWithCredentials.length} users with identity credentials`
    );

    if (usersWithCredentials.length === 0) {
      console.log("No users to process. Exiting.");
      return;
    }

    // Launch browser
    console.log("\n🌐 Launching browser...");
    
    const chromiumPath = findChromiumPath();
    const launchOptions: any = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    };
    
    if (chromiumPath) {
      launchOptions.executablePath = chromiumPath;
    } else {
      console.log("⚠️ Using default Puppeteer Chromium (will download if needed)");
    }
    
    console.log("Launch options:", JSON.stringify(launchOptions, null, 2));
    
    try {
      browser = await puppeteer.launch(launchOptions);
    } catch (launchError) {
      console.error("❌ Failed to launch browser:", launchError);
      throw new Error(`Browser launch failed: ${launchError}`);
    }

    console.log("Browser launched successfully");

    // Process each user
    for (const user of usersWithCredentials) {
      const result = await refreshCookieForUser(user, browser);
      results.push(result);

      // Add delay between users to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    Deno.exit(1);
  } finally {
    if (browser) {
      console.log("\n🔒 Closing browser...");
      await browser.close();
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("Cookie Refresh Task Completed");
  console.log("=".repeat(60));

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  console.log(`\n📊 Summary:`);
  console.log(`   Total processed: ${results.length}`);
  console.log(`   Successful: ${successCount} ✅`);
  console.log(`   Failed: ${failureCount} ❌`);

  if (failureCount > 0) {
    console.log(`\n❌ Failed users:`);
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`   - ${r.userName} (${r.userId}): ${r.error}`);
      });
  }

  console.log("\n" + "=".repeat(60));

  // Exit with error code if any failures
  if (failureCount > 0) {
    Deno.exit(1);
  }
}

// Run main function
if (import.meta.main) {
  main();
}
