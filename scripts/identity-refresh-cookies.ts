import puppeteer from "npm:puppeteer";
import { Config, Effect, Logger, Option, Schema } from "npm:effect";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_ENDPOINT = "https://tronclass.codenebula.deno.net";
const LOGIN_URL = "http://lms.tc.cqupt.edu.cn/";
const TARGET_URL = "http://lms.tc.cqupt.edu.cn/user/index#/";
const NOTIFY_URL = "https://air.codenebula.deno.net/qq/group1/send";
const NOTIFY_AT_QQ = "489601672";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

interface User {
  id: string;
  name: string;
  is_auto: boolean;
  identity_account?: string | null;
  identity_password?: string | null;
  qq_account?: string | null;
  latest_cookie: string | null;
  expires: string | null;
}

interface RefreshResult {
  userId: string;
  userName: string;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class FetchUsersError extends Schema.TaggedError<FetchUsersError>()(
  "FetchUsersError",
  { message: Schema.String },
) {}

class UpdateCookieError extends Schema.TaggedError<UpdateCookieError>()(
  "UpdateCookieError",
  { userId: Schema.String, message: Schema.String },
) {}

class BrowserLaunchError extends Schema.TaggedError<BrowserLaunchError>()(
  "BrowserLaunchError",
  { message: Schema.String },
) {}

class LoginError extends Schema.TaggedError<LoginError>()(
  "LoginError",
  { userName: Schema.String, message: Schema.String },
) {}

class NotifyError extends Schema.TaggedError<NotifyError>()(
  "NotifyError",
  { message: Schema.String },
) {}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const fetchUsers = Effect.fn("fetchUsers")(function* () {
  const response = yield* Effect.tryPromise({
    try: () => fetch(`${API_ENDPOINT}/user/list`),
    catch: (e) =>
      new FetchUsersError({ message: `Network error: ${String(e)}` }),
  });

  if (!response.ok) {
    return yield* Effect.fail(
      new FetchUsersError({
        message: `HTTP ${response.status}: ${response.statusText}`,
      }),
    );
  }

  const users = yield* Effect.tryPromise({
    try: () => response.json() as Promise<User[]>,
    catch: (e) =>
      new FetchUsersError({
        message: `Failed to parse response: ${String(e)}`,
      }),
  });

  return users;
});

const updateUserCookie = Effect.fn("updateUserCookie")(function* (
  userId: string,
  cookie: string,
) {
  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(`${API_ENDPOINT}/user/refresh/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ua_info: "GitHub Actions Cookie Refresh Bot",
          cookie,
        }),
      }),
    catch: (e) =>
      new UpdateCookieError({
        userId,
        message: `Network error: ${String(e)}`,
      }),
  });

  if (!response.ok) {
    const errorData = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ error?: string }>,
      catch: (e) =>
        new UpdateCookieError({
          userId,
          message: `Failed to parse error response: ${String(e)}`,
        }),
    });
    return yield* Effect.fail(
      new UpdateCookieError({
        userId,
        message: errorData.error ?? response.statusText,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

const acquireBrowser = Effect.fn("acquireBrowser")(function* () {
  const chromePath = yield* Config.string("PUPPETEER_EXECUTABLE_PATH").pipe(
    Config.option,
  );

  const launchOptions: puppeteer.LaunchOptions = {
    headless: true,
    pipe: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
    ],
  };

  if (Option.isSome(chromePath)) {
    yield* Effect.log("Using Chrome from environment", {
      path: chromePath.value,
    });
    launchOptions.executablePath = chromePath.value;
  }

  const browser = yield* Effect.tryPromise({
    try: () => puppeteer.launch(launchOptions),
    catch: (e) =>
      new BrowserLaunchError({ message: `Failed to launch: ${String(e)}` }),
  });

  return browser;
});

const refreshCookieForUser = Effect.fn("refreshCookieForUser")(function* (
  user: User,
  browser: puppeteer.Browser,
) {
  yield* Effect.log("Starting cookie refresh", { user: user.name });

  const result = yield* Effect.gen(function* () {
    const page = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => browser.newPage(),
        catch: (e) =>
          new LoginError({
            userName: user.name,
            message: `Failed to open page: ${String(e)}`,
          }),
      }),
      (page) =>
        Effect.gen(function* () {
          yield* Effect.log("Clearing browser cookies", { user: user.name });
          yield* Effect.tryPromise({
            try: async () => {
              const client = await page.createCDPSession();
              await client.send("Network.clearBrowserCookies");
              await client.send("Network.clearBrowserCache");
            },
            catch: () => undefined,
          }).pipe(Effect.ignore);
          yield* Effect.promise(() => page.close());
        }),
    );

    yield* Effect.tryPromise({
      try: () => page.setViewport({ width: 1280, height: 800 }),
      catch: (e) =>
        new LoginError({ userName: user.name, message: String(e) }),
    });

    yield* Effect.log("Navigating to login page", { user: user.name });

    yield* Effect.tryPromise({
      try: () =>
        page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 30000 }),
      catch: (e) =>
        new LoginError({
          userName: user.name,
          message: `Navigation failed: ${String(e)}`,
        }),
    });

    yield* Effect.tryPromise({
      try: () => page.waitForSelector("#username", { timeout: 30000 }),
      catch: (e) =>
        new LoginError({
          userName: user.name,
          message: `Login page not loaded: ${String(e)}`,
        }),
    });

    yield* Effect.log("Filling credentials", { user: user.name });

    yield* Effect.tryPromise({
      try: () =>
        page.type("#username", user.identity_account!, { delay: 50 }),
      catch: (e) =>
        new LoginError({
          userName: user.name,
          message: `Failed to type username: ${String(e)}`,
        }),
    });

    yield* Effect.tryPromise({
      try: () =>
        page.type("#password", user.identity_password!, { delay: 50 }),
      catch: (e) =>
        new LoginError({
          userName: user.name,
          message: `Failed to type password: ${String(e)}`,
        }),
    });

    yield* Effect.tryPromise({
      try: () => page.click("#rememberMe"),
      catch: (e) =>
        new LoginError({
          userName: user.name,
          message: `Failed to click remember me: ${String(e)}`,
        }),
    });

    yield* Effect.log("Submitting login form", { user: user.name });

    yield* Effect.tryPromise({
      try: () => page.click("#login_submit"),
      catch: (e) =>
        new LoginError({
          userName: user.name,
          message: `Failed to click submit: ${String(e)}`,
        }),
    });

    yield* Effect.tryPromise({
      try: () =>
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
      catch: (e) =>
        new LoginError({
          userName: user.name,
          message: `Post-login navigation failed: ${String(e)}`,
        }),
    });

    yield* Effect.tryPromise({
      try: () =>
        page.waitForFunction(
          (targetUrl: string) => window.location.href.startsWith(targetUrl),
          { timeout: 30000 },
          TARGET_URL,
        ),
      catch: (e) =>
        new LoginError({
          userName: user.name,
          message: `Target page not reached: ${String(e)}`,
        }),
    });

    yield* Effect.sleep("2 seconds");

    yield* Effect.log("Extracting cookies", { user: user.name });

    const cookieString = yield* Effect.tryPromise({
      try: () => page.evaluate("document.cookie") as Promise<string>,
      catch: (e) =>
        new LoginError({
          userName: user.name,
          message: `Failed to extract cookies: ${String(e)}`,
        }),
    });

    if (!cookieString) {
      return yield* Effect.fail(
        new LoginError({
          userName: user.name,
          message: "Cookie string is empty after login",
        }),
      );
    }

    yield* updateUserCookie(user.id, cookieString).pipe(
      Effect.mapError(
        (e) => new LoginError({ userName: user.name, message: e.message }),
      ),
    );

    return cookieString;
  }).pipe(
    Effect.scoped,
    Effect.map(
      (): RefreshResult => ({
        userId: user.id,
        userName: user.name,
        success: true,
      }),
    ),
    Effect.catchTag("LoginError", (e) =>
      Effect.succeed<RefreshResult>({
        userId: user.id,
        userName: user.name,
        success: false,
        error: e.message,
      }),
    ),
  );

  if (result.success) {
    yield* Effect.log("Cookie refresh successful", { user: user.name });
  } else {
    yield* Effect.log("Cookie refresh failed", {
      user: user.name,
      error: result.error,
    });
  }

  return result;
});

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

const sendGroupNotification = Effect.fn("sendGroupNotification")(function* (
  results: RefreshResult[],
  errorMessage?: string,
  logLines?: string[],
) {
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  const lines: string[] = ["Cookie 刷新任务完成"];
  lines.push("");
  lines.push(
    `总计: ${results.length} | 成功: ${successCount} | 失败: ${failureCount}`,
  );

  if (successCount > 0) {
    lines.push("");
    lines.push("成功用户:");
    for (const r of results.filter((r) => r.success)) {
      lines.push(`  - ${r.userName}`);
    }
  }

  if (failureCount > 0) {
    lines.push("");
    lines.push("失败用户:");
    for (const r of results.filter((r) => !r.success)) {
      lines.push(`  - ${r.userName}: ${r.error}`);
    }
  }

  if (errorMessage) {
    lines.push("");
    lines.push("脚本异常:");
    lines.push(`  ${errorMessage}`);
  }

  if (logLines && logLines.length > 0) {
    lines.push("");
    lines.push("执行日志:");
    lines.push(logLines.join("\n"));
  }

  const payload = {
    ats: [NOTIFY_AT_QQ],
    text: lines.join("\n"),
  };

  yield* Effect.log("Sending group notification");

  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(NOTIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    catch: (e) =>
      new NotifyError({ message: `Network error: ${String(e)}` }),
  });

  if (!response.ok) {
    return yield* Effect.fail(
      new NotifyError({
        message: `HTTP ${response.status}: ${response.statusText}`,
      }),
    );
  }

  yield* Effect.log("Group notification sent");
});

// ---------------------------------------------------------------------------
// Main program
// ---------------------------------------------------------------------------

const program = Effect.fn("program")(function* (logLines: string[]) {
  yield* Effect.log("Cookie refresh task started");

  const users = yield* fetchUsers();
  yield* Effect.log("Fetched users", { total: users.length });

  const usersWithCredentials = users.filter(
    (u) => u.identity_account && u.identity_password,
  );

  yield* Effect.log("Users with credentials", {
    count: usersWithCredentials.length,
  });

  if (usersWithCredentials.length === 0) {
    yield* Effect.log("No users to process");
    return [];
  }

  const results = yield* Effect.acquireUseRelease(
    acquireBrowser(),
    (browser) =>
      Effect.gen(function* () {
        yield* Effect.log("Browser launched");
        const acc: RefreshResult[] = [];
        for (const user of usersWithCredentials) {
          const result = yield* refreshCookieForUser(user, browser);
          acc.push(result);
          yield* Effect.sleep("2 seconds");
        }
        return acc;
      }),
    (browser) =>
      Effect.gen(function* () {
        yield* Effect.log("Closing browser");
        yield* Effect.promise(() => browser.close());
      }),
  );

  yield* Effect.log("All users processed", {
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });

  const failureCount = results.filter((r) => !r.success).length;
  const notifyLogs = failureCount > 0 ? logLines : undefined;

  yield* sendGroupNotification(results, undefined, notifyLogs).pipe(
    Effect.catchTag("NotifyError", (e) =>
      Effect.log("Failed to send group notification", { error: e.message }),
    ),
  );

  if (failureCount > 0) {
    // Notification was already sent above with logs; just signal a non-zero exit
    Deno.exit(1);
  }

  return results;
});

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const logLines: string[] = [];

  const collectingLogger = Logger.make(({ message, logLevel, date }) => {
    const ts = date.toISOString();
    const msg = Array.isArray(message) ? message.join(" ") : String(message);
    const line = `${ts} [${logLevel.label}] ${msg}`;
    logLines.push(line);
    console.log(line);
  });

  Effect.runPromise(
    program(logLines).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, collectingLogger)),
    ),
  ).catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);

    // Fatal error (e.g. API unreachable, browser failed to launch) —
    // forward to group with full logs since no per-user notification was sent
    await Effect.runPromise(
      sendGroupNotification([], message, logLines).pipe(
        Effect.catchTag("NotifyError", (e) =>
          Effect.log("Could not send failure notification", {
            error: e.message,
          }),
        ),
      ),
    );

    Deno.exit(1);
  });
}
