/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */
import { DatabaseService } from "../utils/db.ts";
import { parseSignQrCode } from "../utils/parse.ts";

// ──────────────────────────────────────────────
// Streaming event types (JSON Lines protocol)
// ──────────────────────────────────────────────

export type SigninStreamEventType =
  | "start"
  | "progress"
  | "user_result"
  | "done"
  | "error";

export type SigninPhase =
  | "save_scan"
  | "parse_qr"
  | "fetch_users"
  | "filter_time_window"
  | "filter_absence"
  | "signing"
  | "fetch_rollcalls"
  | "brute_force"
  | "brute_force_progress"
  | "brute_force_found"
  | "notify"
  | "save_log";

export interface StreamEvent {
  type: SigninStreamEventType;
  ts?: number;
  // start
  mode?: "qr" | "digital";
  // progress
  phase?: SigninPhase;
  message?: string;
  detail?: string;
  // user_result
  user_id?: string;
  user_name?: string;
  success?: boolean;
  code?: number | null;
  // done
  summary?: string;
  // error (also uses message)
}

// Helper to create a JSON line
function jsonLine(event: StreamEvent): string {
  return JSON.stringify({ ...event, ts: Date.now() }) + "\n";
}

/**
 * Check if the current time (Asia/Shanghai) falls within restricted time windows:
 * - Monday  07:30 – 09:40
 * - Wednesday 15:45 – 18:00
 * During these windows only the scanner and "高浚然" should be signed in.
 */
function isInRestrictedTimeWindow(date: Date): { restricted: boolean; label?: string } {
  // Convert to Asia/Shanghai local time components
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value; // Mon, Tue, Wed...
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const totalMinutes = hour * 60 + minute;

  // Monday 07:30 – 09:40
  if (weekday === "Mon" && totalMinutes >= 7 * 60 + 30 && totalMinutes <= 9 * 60 + 40) {
    return { restricted: true, label: "周一 7:30-9:40" };
  }
  // Wednesday 15:45 – 18:00
  if (weekday === "Wed" && totalMinutes >= 15 * 60 + 45 && totalMinutes <= 18 * 60) {
    return { restricted: true, label: "周三 15:45-18:00" };
  }
  return { restricted: false };
}

// Generate random UUID
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const isDefined = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

/**
 * Build standard request headers matching the real TronClass mobile client.
 * `cookieString` is the full document.cookie value stored in the DB.
 * The SESSION token is extracted and sent as X-SESSION-ID per the real app protocol.
 */
function buildHeaders(cookieString: string): Record<string, string> {
  const sessionMatch = cookieString.match(/(?:^|;\s*)SESSION=([^;]+)/);
  const sessionId = sessionMatch?.[1];
  return {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 wxwork/5.0.6 MicroMessenger/7.0.1 Language/zh ColorScheme/Dark wwmver/3.26.506.378",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-Hans",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "http://mobile.tc.cqupt.edu.cn",
    "Referer": "http://mobile.tc.cqupt.edu.cn/",
    "Cookie": cookieString,
    ...(sessionId ? { "X-SESSION-ID": sessionId } : {}),
  };
}

// ──────────────────────────────────────────────
// QR signin streaming
// ──────────────────────────────────────────────

export class SigninStreamService {
  /**
   * Stream QR-code sign-in progress.
   * Calls `emit` with each JSON line chunk.
   */
  static async streamSignin(
    scanResult: string,
    userId: string,
    notify: boolean,
    emit: (chunk: string) => void,
  ): Promise<void> {
    emit(jsonLine({ type: "start", mode: "qr" }));

    try {
      // 1. Save scan history
      emit(
        jsonLine({
          type: "progress",
          phase: "save_scan",
          message: "正在保存扫码记录...",
        }),
      );
      const scanHistory = await DatabaseService.addScanHistory(
        scanResult,
        userId,
      );
      emit(
        jsonLine({
          type: "progress",
          phase: "save_scan",
          message: "扫码记录已保存",
          detail: `记录 ID: ${scanHistory.id}`,
        }),
      );

      // 2. Parse QR code
      emit(
        jsonLine({
          type: "progress",
          phase: "parse_qr",
          message: "正在解析二维码...",
        }),
      );
      const parsedResult = parseSignQrCode(scanResult);
      if (!parsedResult.rollcallId) {
        throw new Error("二维码中缺少签到任务 ID，请重新扫码");
      }
      emit(
        jsonLine({
          type: "progress",
          phase: "parse_qr",
          message: "二维码解析成功",
          detail: `任务 ID: ${parsedResult.rollcallId}`,
        }),
      );

      // 3. Fetch auto-signin users
      emit(
        jsonLine({
          type: "progress",
          phase: "fetch_users",
          message: "正在获取自动签到用户列表...",
        }),
      );
      const autoUsers = await DatabaseService.getAutoSigninUsers();
      emit(
        jsonLine({
          type: "progress",
          phase: "fetch_users",
          message: `获取到 ${autoUsers.length} 位自动签到用户`,
          detail: autoUsers.map((u: any) => u.name).join("、") || "（无）",
        }),
      );

      // 4. Check restricted time window
      const currentTime = new Date();
      const timeWindowCheck = isInRestrictedTimeWindow(currentTime);
      let availableUsers: any[] = [];

      if (timeWindowCheck.restricted) {
        // During restricted windows: only sign in the scanner and 高浚然
        emit(
          jsonLine({
            type: "progress",
            phase: "filter_time_window",
            message: `当前处于限制时段（${timeWindowCheck.label}），仅为扫码者和高浚然签到`,
          }),
        );
        availableUsers = autoUsers.filter(
          (u: any) => u.id === userId || u.name === "高浚然",
        );
        const skippedUsers = autoUsers.filter(
          (u: any) => u.id !== userId && u.name !== "高浚然",
        );
        emit(
          jsonLine({
            type: "progress",
            phase: "filter_time_window",
            message: `时段过滤完成：${availableUsers.length} 人可签到，${skippedUsers.length} 人跳过`,
            detail:
              skippedUsers.length > 0
                ? `跳过：${skippedUsers.map((u: any) => u.name).join("、")}`
                : undefined,
          }),
        );

        if (availableUsers.length === 0) {
          throw new Error("限制时段内没有符合条件的用户（扫码者或高浚然）");
        }
      } else {
        // Normal flow: filter absent users
        emit(
          jsonLine({
            type: "progress",
            phase: "filter_absence",
            message: "正在检查请假状态...",
          }),
        );
        const absentUsers: any[] = [];
        for (const user of autoUsers) {
          const isAbsent = await DatabaseService.isUserAbsent(
            user.id,
            currentTime,
          );
          if (isAbsent) {
            absentUsers.push(user);
          } else {
            availableUsers.push(user);
          }
        }
        emit(
          jsonLine({
            type: "progress",
            phase: "filter_absence",
            message: `请假过滤完成：${availableUsers.length} 人可签到，${absentUsers.length} 人请假`,
            detail:
              absentUsers.length > 0
                ? `请假：${absentUsers.map((u: any) => u.name).join("、")}`
                : undefined,
          }),
        );

        if (availableUsers.length === 0) {
          throw new Error("所有用户均已请假，无需签到");
        }
      }

      // 5. Concurrent sign-in for all users
      emit(
        jsonLine({
          type: "progress",
          phase: "signing",
          message: `开始并发签到，共 ${availableUsers.length} 人...`,
        }),
      );

      const signinResults = await Promise.allSettled(
        availableUsers.map(async (user) => {
          try {
            const record = await SigninStreamService.signinUser(
              user,
              parsedResult,
              scanHistory.id,
            );
            const success =
              typeof record.response_code === "number" &&
              record.response_code >= 200 &&
              record.response_code < 300;
            emit(
              jsonLine({
                type: "user_result",
                user_id: user.id,
                user_name: user.name,
                success,
                code: record.response_code,
                message: success
                  ? undefined
                  : SigninStreamService.extractFailureReason(record),
              }),
            );
            return record;
          } catch (err) {
            emit(
              jsonLine({
                type: "user_result",
                user_id: user.id,
                user_name: user.name,
                success: false,
                code: null,
                message: getErrorMessage(err),
              }),
            );
            return null;
          }
        }),
      );

      const normalizedResults = signinResults
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter(isDefined);

      const successCount = normalizedResults.filter(
        (r) =>
          typeof r.response_code === "number" &&
          r.response_code >= 200 &&
          r.response_code < 300,
      ).length;
      const failCount = normalizedResults.length - successCount;

      // 6. Notify (fire-and-forget)
      if (notify) {
        emit(
          jsonLine({
            type: "progress",
            phase: "notify",
            message: "正在发送群通知...",
          }),
        );
      }

      emit(
        jsonLine({
          type: "done",
          success: failCount === 0,
          summary: `签到完成：${successCount} 人成功，${failCount} 人失败`,
        }),
      );
    } catch (err) {
      emit(
        jsonLine({
          type: "error",
          message: getErrorMessage(err),
        }),
      );
    }
  }

  private static extractFailureReason(record: any): string {
    const data = record.response_data;
    if (data && typeof data === "object") {
      const maybeError =
        data.error ?? data.message ?? data.msg ?? data.detail ?? data.reason;
      if (typeof maybeError === "string" && maybeError.trim().length > 0) {
        return maybeError;
      }
    }
    if (record.response_code) return `HTTP ${record.response_code}`;
    return "未知错误";
  }

  private static async signinUser(
    user: any,
    parsedResult: any,
    scanHistoryId: string,
  ) {
    const latestCookie = user.cookies?.[0]?.value;
    if (!latestCookie) throw new Error(`用户 ${user.name} 没有可用的 Cookie`);
    if (!parsedResult.rollcallId) throw new Error("扫码结果中缺少 rollcallId");
    if (!parsedResult.data) throw new Error("扫码结果中缺少 data 字段");

    const requestData = { data: parsedResult.data, deviceId: generateUUID() };
    const signUrl = `http://lms.tc.cqupt.edu.cn/api/rollcall/${parsedResult.rollcallId}/answer_qr_rollcall`;

    const response = await fetch(signUrl, {
      method: "PUT",
      headers: buildHeaders(latestCookie),
      body: JSON.stringify(requestData),
    });

    const responseData = await response.json();
    return await DatabaseService.addSigninHistory(
      user.id,
      latestCookie,
      scanHistoryId,
      requestData,
      response.status,
      responseData,
    );
  }

  // ──────────────────────────────────────────────
  // Digital signin streaming
  // ──────────────────────────────────────────────

  // Brute-force lock shared with original service – use a module-level flag
  private static isBruteForcing = false;

  static async streamDigitalSignin(
    data: string | undefined,
    userId: string,
    notify: boolean,
    emit: (chunk: string) => void,
  ): Promise<void> {
    emit(jsonLine({ type: "start", mode: "digital" }));

    try {
      if (!data && SigninStreamService.isBruteForcing) {
        throw new Error("服务器正在破解签到码，请稍后再试或提供具体的签到码");
      }

      // 1. Fetch auto-signin users
      emit(
        jsonLine({
          type: "progress",
          phase: "fetch_users",
          message: "正在获取自动签到用户列表...",
        }),
      );
      const autoUsers = await DatabaseService.getAutoSigninUsers();
      if (autoUsers.length === 0) throw new Error("没有开启自动签到的用户");

      emit(
        jsonLine({
          type: "progress",
          phase: "fetch_users",
          message: `获取到 ${autoUsers.length} 位自动签到用户`,
          detail: autoUsers.map((u: any) => u.name).join("、"),
        }),
      );

      // 2. Filter absent users
      emit(
        jsonLine({
          type: "progress",
          phase: "filter_absence",
          message: "正在检查请假状态...",
        }),
      );
      const currentTime = new Date();
      const availableUsers: any[] = [];
      const absentUsers: any[] = [];
      for (const user of autoUsers) {
        const isAbsent = await DatabaseService.isUserAbsent(
          user.id,
          currentTime,
        );
        if (isAbsent) absentUsers.push(user);
        else availableUsers.push(user);
      }

      emit(
        jsonLine({
          type: "progress",
          phase: "filter_absence",
          message: `过滤完成：${availableUsers.length} 人可签到，${absentUsers.length} 人请假`,
          detail:
            absentUsers.length > 0
              ? `请假：${absentUsers.map((u: any) => u.name).join("、")}`
              : undefined,
        }),
      );

      if (availableUsers.length === 0) throw new Error("所有用户均已请假");

      // 3. Get caller's cookie
      const latestCookie = await DatabaseService.getLatestCookie(userId);
      if (!latestCookie) throw new Error("用户没有可用的 Cookie");

      // 4. Fetch active rollcalls
      emit(
        jsonLine({
          type: "progress",
          phase: "fetch_rollcalls",
          message: "正在获取活跃签到任务...",
        }),
      );
      const rollcallTasks = await SigninStreamService.getActiveRollcalls(
        latestCookie.value,
      );
      const digitalTasks = rollcallTasks.filter(
        (t: any) => t.status === "absent" && t.is_number && !t.is_radar,
      );

      if (digitalTasks.length === 0)
        throw new Error("当前没有活跃的数字签到任务");

      emit(
        jsonLine({
          type: "progress",
          phase: "fetch_rollcalls",
          message: `找到 ${digitalTasks.length} 个数字签到任务`,
          detail: digitalTasks
            .map((t: any) => `任务 ${t.rollcall_id}`)
            .join("、"),
        }),
      );

      // 5. Process each task
      const allResults: any[] = [];
      for (const task of digitalTasks) {
        const rollcallId = task.rollcall_id;
        if (data) {
          // Known code path
          emit(
            jsonLine({
              type: "progress",
              phase: "signing",
              message: `使用签到码 ${data} 开始签到...`,
              detail: `任务 ${rollcallId}`,
            }),
          );
          const results = await SigninStreamService.digitalSigninWithCode(
            availableUsers,
            rollcallId,
            data,
            emit,
          );
          allResults.push(...results);
        } else {
          // Brute-force path
          emit(
            jsonLine({
              type: "progress",
              phase: "brute_force",
              message: "开始遍历破解签到码 (0000–9999)...",
              detail: `任务 ${rollcallId}`,
            }),
          );
          try {
            SigninStreamService.isBruteForcing = true;
            const results = await SigninStreamService.bruteForceAndSignin(
              availableUsers,
              rollcallId,
              userId,
              emit,
            );
            allResults.push(...results);
          } finally {
            SigninStreamService.isBruteForcing = false;
          }
        }
      }

      // 6. Notify
      if (notify) {
        emit(
          jsonLine({
            type: "progress",
            phase: "notify",
            message: "正在发送群通知...",
          }),
        );
      }

      const successCount = allResults.filter(
        (r) =>
          typeof r.response_code === "number" &&
          r.response_code >= 200 &&
          r.response_code < 300,
      ).length;
      const failCount = allResults.length - successCount;

      emit(
        jsonLine({
          type: "done",
          success: failCount === 0,
          summary: `签到完成：${successCount} 人成功，${failCount} 人失败`,
        }),
      );
    } catch (err) {
      emit(
        jsonLine({
          type: "error",
          message: getErrorMessage(err),
        }),
      );
    }
  }

  private static async getActiveRollcalls(cookie: string | undefined) {
    if (!cookie) throw new Error("没有可用的 Cookie");
    const radarUrl =
      "http://lms.tc.cqupt.edu.cn/api/radar/rollcalls?api_version=1.1.0";
    const response = await fetch(radarUrl, {
      method: "GET",
      headers: buildHeaders(cookie),
    });
    if (!response.ok) throw new Error(`获取签到任务失败: ${response.status}`);
    const resData = await response.json();
    return resData.rollcalls || [];
  }

  private static async digitalSigninWithCode(
    users: any[],
    rollcallId: string,
    code: string,
    emit: (chunk: string) => void,
  ) {
    const results = await Promise.allSettled(
      users.map(async (user) => {
        try {
          const record = await SigninStreamService.attemptDigitalSignin(
            user,
            rollcallId,
            code,
            null,
          );
          const success =
            typeof record.response_code === "number" &&
            record.response_code >= 200 &&
            record.response_code < 300;
          emit(
            jsonLine({
              type: "user_result",
              user_id: user.id,
              user_name: user.name,
              success,
              code: record.response_code,
              message: success
                ? undefined
                : SigninStreamService.extractFailureReason(record),
            }),
          );
          return record;
        } catch (err) {
          emit(
            jsonLine({
              type: "user_result",
              user_id: user.id,
              user_name: user.name,
              success: false,
              code: null,
              message: getErrorMessage(err),
            }),
          );
          return null;
        }
      }),
    );
    return results
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter(isDefined);
  }

  private static async bruteForceAndSignin(
    users: any[],
    rollcallId: string,
    userId: string,
    emit: (chunk: string) => void,
  ) {
    // Find test user (the request initiator, or first available user)
    const testUser =
      users.find((u) => u.id === userId && u.cookies?.[0]?.value) ||
      users.find((u) => u.cookies?.[0]?.value);

    if (!testUser) throw new Error("没有可用的用户 Cookie 进行破解");

    const batchSize = 500;
    let correctCode: string | null = null;
    let tried = 0;

    for (let i = 0; i < 10000; i += batchSize) {
      const batch: Promise<{ success: boolean; code: string }>[] = [];
      for (let j = i; j < Math.min(i + batchSize, 10000); j++) {
        const code = j.toString().padStart(4, "0");
        batch.push(
          SigninStreamService.tryDigitalCode(testUser, rollcallId, code),
        );
      }

      const batchResults = await Promise.allSettled(batch);
      tried += batchResults.length;

      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value.success) {
          correctCode = result.value.code;
          break;
        }
      }

      // Emit progress every batch
      emit(
        jsonLine({
          type: "progress",
          phase: "brute_force_progress",
          message: correctCode
            ? `找到签到码：${correctCode}`
            : `遍历进度：${tried} / 10000`,
          detail: correctCode ? undefined : `已完成 ${Math.round((tried / 10000) * 100)}%`,
        }),
      );

      if (correctCode) break;
    }

    if (!correctCode) throw new Error("未能找到正确的签到码（已尝试 0000–9999）");

    emit(
      jsonLine({
        type: "progress",
        phase: "brute_force_found",
        message: `找到正确签到码：${correctCode}`,
        detail: "正在为所有用户签到...",
      }),
    );

    return await SigninStreamService.digitalSigninWithCode(
      users,
      rollcallId,
      correctCode,
      emit,
    );
  }

  private static async tryDigitalCode(
    user: any,
    rollcallId: string,
    numberCode: string,
  ): Promise<{ success: boolean; code: string }> {
    try {
      const latestCookie = user.cookies?.[0]?.value;
      if (!latestCookie) return { success: false, code: numberCode };

      const requestData = { deviceId: generateUUID(), numberCode };
      const signUrl = `http://lms.tc.cqupt.edu.cn/api/rollcall/${rollcallId}/answer_number_rollcall`;

      const response = await fetch(signUrl, {
        method: "PUT",
        headers: buildHeaders(latestCookie),
        body: JSON.stringify(requestData),
      });
      return { success: response.ok, code: numberCode };
    } catch {
      return { success: false, code: numberCode };
    }
  }

  private static async attemptDigitalSignin(
    user: any,
    rollcallId: string,
    numberCode: string,
    scanHistoryId: string | null,
  ) {
    const latestCookie = user.cookies?.[0]?.value;
    if (!latestCookie) throw new Error(`用户 ${user.name} 没有可用的 Cookie`);

    const requestData = { deviceId: generateUUID(), numberCode };
    const signUrl = `http://lms.tc.cqupt.edu.cn/api/rollcall/${rollcallId}/answer_number_rollcall`;

    const response = await fetch(signUrl, {
      method: "PUT",
      headers: buildHeaders(latestCookie),
      body: JSON.stringify(requestData),
    });
    const responseData = await response.json();
    return await DatabaseService.addSigninHistory(
      user.id,
      latestCookie,
      scanHistoryId,
      requestData,
      response.status,
      responseData,
    );
  }
}
