/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */
import { DatabaseService } from "../utils/db.ts";
import { parseSignQrCode } from "../utils/parse.ts";

const GROUP_NOTIFY_URL = "https://air.codenebula.deno.net/qq/group/send";
const GROUP_ID = "322989480";

interface AutoSigninUser {
  id: string;
  name: string;
  qq_account?: string | null;
  cookies?: Array<{ value?: string | null }>;
}

interface SigninRecord {
  user_id: string;
  response_code: number | null;
  response_data: Record<string, unknown> | null;
}

const isDefined = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

// 生成随机UUID
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class SigninService {
  // 破解锁：防止多个请求同时进行破解
  private static isBruteForcing = false;

  private static isSigninSuccess(record: SigninRecord): boolean {
    return (
      typeof record.response_code === "number" &&
      record.response_code >= 200 &&
      record.response_code < 300
    );
  }

  private static extractFailureReason(record: SigninRecord): string {
    const data = record.response_data;
    if (data && typeof data === "object") {
      const maybeError =
        data.error ?? data.message ?? data.msg ?? data.detail ?? data.reason;
      if (typeof maybeError === "string" && maybeError.trim().length > 0) {
        return maybeError;
      }
    }

    if (record.response_code) {
      return `HTTP ${record.response_code}`;
    }

    return "未知错误";
  }

  private static async sendSigninNotification(
    title: string,
    users: AutoSigninUser[],
    records: SigninRecord[],
  ) {
    const userById = new Map(users.map((u) => [u.id, u]));
    const ats = Array.from(
      new Set(
        users
          .map((u) => u.qq_account?.trim())
          .filter((qq): qq is string => Boolean(qq)),
      ),
    );

    const successLines: string[] = [];
    const failureLines: string[] = [];

    for (const record of records) {
      const user = userById.get(record.user_id);
      const userName = user?.name ?? record.user_id;
      if (this.isSigninSuccess(record)) {
        successLines.push(`  - ${userName}`);
      } else {
        failureLines.push(
          `  - ${userName}: ${this.extractFailureReason(record)}`,
        );
      }
    }

    const lines = [
      title,
      "",
      `总计: ${records.length} | 成功: ${successLines.length} | 失败: ${failureLines.length}`,
    ];

    if (successLines.length > 0) {
      lines.push("", "签到成功:", ...successLines);
    }

    if (failureLines.length > 0) {
      lines.push("", "签到失败:", ...failureLines);
    }

    try {
      const response = await fetch(GROUP_NOTIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: GROUP_ID,
          ats,
          text: lines.join("\n"),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error("发送群通知失败:", response.status, errorBody);
      }
    } catch (error) {
      console.error("发送群通知异常:", error);
    }
  }

  private static dispatchSigninNotification(
    title: string,
    users: AutoSigninUser[],
    records: SigninRecord[],
  ) {
    void this.sendSigninNotification(title, users, records).catch((error) => {
      console.error("异步发送群通知失败:", error);
    });
  }

  /**
   * 处理扫码签到
   */
  static async processSignin(
    scanResult: string,
    userId: string,
    notify: boolean = false,
  ) {
    const startedAt = Date.now();
    console.log("[signin:qr] 开始处理二维码签到", {
      userId,
      notify,
      scanResultLength: scanResult.length,
    });

    // 1. 保存扫码历史
    const scanHistory = await DatabaseService.addScanHistory(
      scanResult,
      userId,
    );
    console.log("[signin:qr] 已保存扫码历史", { scanHistoryId: scanHistory.id });

    // 2. 解析扫码结果
    const parsedResult = parseSignQrCode(scanResult);
    console.log("[signin:qr] 解析扫码结果", {
      rollcallId: parsedResult.rollcallId,
      hasData: Boolean(parsedResult.data),
      activityId: parsedResult.activityId,
    });

    // 3. 获取需要自动签到的用户
    const autoUsers = await DatabaseService.getAutoSigninUsers();
    console.log("[signin:qr] 获取自动签到用户", { count: autoUsers.length });

    // 4. 过滤掉请假的用户
    const currentTime = new Date();
    const availableUsers = [];
    for (const user of autoUsers) {
      const isAbsent = await DatabaseService.isUserAbsent(user.id, currentTime);
      if (!isAbsent) {
        availableUsers.push(user);
      }
    }
    console.log("[signin:qr] 请假过滤完成", {
      total: autoUsers.length,
      available: availableUsers.length,
      absent: autoUsers.length - availableUsers.length,
    });

    // 5. 并发处理所有用户的签到
    console.log("[signin:qr] 开始并发签到", { userCount: availableUsers.length });
    const signinResults = await Promise.allSettled(
      availableUsers.map((user) =>
        this.signinUser(user, parsedResult, scanHistory.id),
      ),
    );

    const normalizedResults = signinResults
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter(isDefined);

    const successCount = normalizedResults.filter((record) =>
      this.isSigninSuccess(record)
    ).length;
    const failureCount = normalizedResults.length - successCount;
    console.log("[signin:qr] 并发签到完成", {
      total: normalizedResults.length,
      success: successCount,
      failure: failureCount,
      durationMs: Date.now() - startedAt,
    });

    if (notify) {
      console.log("[signin:qr] notify=true，异步发送群通知");
      this.dispatchSigninNotification(
        "二维码签到任务完成",
        availableUsers,
        normalizedResults,
      );
    } else {
      console.log("[signin:qr] notify=false，跳过群通知");
    }

    // 6. 返回结果
    return {
      scan_result: scanHistory,
      signin_results: normalizedResults,
    };
  }

  /**
   * 为单个用户执行签到
   */
  private static async signinUser(
    user: any,
    parsedResult: any,
    scanHistoryId: string,
  ) {
    try {
      const startedAt = Date.now();
      console.log("[signin:qr:user] 开始签到", {
        userId: user.id,
        userName: user.name,
        scanHistoryId,
        rollcallId: parsedResult.rollcallId,
      });

      const latestCookie = user.cookies?.[0]?.value;

      if (!latestCookie) {
        throw new Error(`用户 ${user.name} 没有可用的Cookie`);
      }

      if (!parsedResult.rollcallId) {
        throw new Error("扫码结果中缺少rollcallId");
      }

      if (!parsedResult.data) {
        throw new Error("扫码结果中缺少data字段");
      }

      // 构建请求数据
      const requestData = {
        data: parsedResult.data,
        deviceId: generateUUID(),
      };

      // 调用签到API
      const signUrl = `http://lms.tc.cqupt.edu.cn/api/rollcall/${parsedResult.rollcallId}/answer_qr_rollcall`;

      const response = await fetch(signUrl, {
        method: "PUT",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Edg/141.0.0.0",
          "Content-Type": "application/json",
          Cookie: latestCookie,
        },
        body: JSON.stringify(requestData),
        credentials: "include",
      });

      const responseData = await response.json();

      // 保存签到历史
      const signinHistory = await DatabaseService.addSigninHistory(
        user.id,
        latestCookie,
        scanHistoryId,
        requestData,
        response.status,
        responseData,
      );

      console.log("[signin:qr:user] 签到完成", {
        userId: user.id,
        userName: user.name,
        status: response.status,
        success: response.ok,
        durationMs: Date.now() - startedAt,
      });

      return signinHistory;
    } catch (error) {
      console.error(`用户 ${user.name} 签到失败:`, error);
      const errorMessage = getErrorMessage(error);

      // 保存失败的签到记录
      const signinHistory = await DatabaseService.addSigninHistory(
        user.id,
        user.cookies?.[0]?.value || null,
        scanHistoryId,
        { error: errorMessage },
        null,
        { error: errorMessage },
      );

      return signinHistory;
    }
  }

  /**
   * 获取扫码历史
   */
  static async getScanHistory(
    count: number = 10,
    userId?: string,
    index: number = 0,
  ) {
    return await DatabaseService.getScanHistory(count, userId, index);
  }

  /**
   * 获取签到历史
   */
  static async getSigninHistory(
    count: number = 10,
    userId?: string,
    index: number = 0,
  ) {
    return await DatabaseService.getSigninHistory(count, userId, index);
  }

  /**
   * 处理数字签到
   */
  static async processDigitalSignin(
    data: string | undefined,
    userId: string,
    notify: boolean = false,
  ) {
    // 1. 如果没有提供签到码，且正在破解中，则拒绝请求
    if (!data && this.isBruteForcing) {
      throw new Error("服务器正在破解签到码，请稍后再试或提供具体的签到码");
    }

    // 2. 获取需要自动签到的用户
    const autoUsers = await DatabaseService.getAutoSigninUsers();

    if (autoUsers.length === 0) {
      throw new Error("没有开启自动签到的用户");
    }

    // 2.5 过滤掉请假的用户
    const currentTime = new Date();
    const availableUsers = [];
    for (const user of autoUsers) {
      const isAbsent = await DatabaseService.isUserAbsent(user.id, currentTime);
      if (!isAbsent) {
        availableUsers.push(user);
      }
    }

    if (availableUsers.length === 0) {
      throw new Error("所有用户都已请假");
    }

    // 3. 获取请求用户的最新 cookie
    const latestCookie = await DatabaseService.getLatestCookie(userId);
    if (!latestCookie) {
      throw new Error("用户没有可用的 Cookie");
    }

    // 4. 获取活跃的签到任务
    const rollcallTasks = await this.getActiveRollcalls(latestCookie.value);

    // 5. 筛选出数字签到任务
    const digitalTasks = rollcallTasks.filter(
      (task: any) =>
        task.status === "absent" && task.is_number && !task.is_radar,
    );

    if (digitalTasks.length === 0) {
      throw new Error("当前没有活跃的数字签到任务");
    }

    // 6. 对每个数字签到任务进行处理
    const allResults = [];

    for (const task of digitalTasks) {
      const rollcallId = task.rollcall_id;

      // 如果提供了具体的数字，直接使用
      if (data) {
        const results = await this.digitalSigninWithCode(
          availableUsers,
          rollcallId,
          data,
        );
        allResults.push(...results);
      } else {
        // 否则遍历 0000-9999（需要破解）
        try {
          this.isBruteForcing = true;
          const results = await this.bruteForceDigitalSignin(
            availableUsers,
            rollcallId,
            userId,
          );
          allResults.push(...results);
        } finally {
          this.isBruteForcing = false;
        }
      }
    }

    if (notify) {
      this.dispatchSigninNotification(
        "数字签到任务完成",
        availableUsers,
        allResults,
      );
    }

    return {
      tasks: digitalTasks,
      signin_results: allResults,
    };
  }

  /**
   * 获取活跃的签到任务
   */
  private static async getActiveRollcalls(cookie: string | undefined) {
    if (!cookie) {
      throw new Error("没有可用的Cookie");
    }

    const radarUrl =
      "http://lms.tc.cqupt.edu.cn/api/radar/rollcalls?api_version=1.1.0";

    const response = await fetch(radarUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Edg/141.0.0.0",
        Cookie: cookie,
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`获取签到任务失败: ${response.status}`);
    }

    const data = await response.json();

    console.log("活跃签到任务:", data.rollcalls);

    return data.rollcalls || [];
  }

  /**
   * 使用指定的数字签到码进行签到
   */
  private static async digitalSigninWithCode(
    users: any[],
    rollcallId: string,
    code: string,
  ) {
    const results = await Promise.allSettled(
      users.map((user) =>
        this.attemptDigitalSignin(user, rollcallId, code, null),
      ),
    );

    return results
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter(isDefined);
  }

  /**
   * 遍历破解数字签到（0000-9999）
   * 优化策略：
   * 1. 只用一个用户尝试破解，找到正确的签到码
   * 2. 破解过程中不保存历史记录
   * 3. 找到正确码后，给所有用户签到并保存历史
   */
  private static async bruteForceDigitalSignin(
    users: any[],
    rollcallId: string,
    userId: string,
  ) {
    // 使用传入的 userId 对应的用户进行破解
    const testUser = users.find(
      (user) => user.id === userId && user.cookies?.[0]?.value,
    );

    if (!testUser) {
      throw new Error("没有可用的用户Cookie进行破解");
    }

    console.log(`开始破解数字签到码，使用用户: ${testUser.name}`);

    // 使用并发控制，避免过多请求
    const batchSize = 500;
    let correctCode: string | null = null;

    // 遍历 0000-9999
    for (let i = 0; i < 10000; i += batchSize) {
      const batch = [];

      for (let j = i; j < Math.min(i + batchSize, 10000); j++) {
        const code = j.toString().padStart(4, "0");
        // 只用测试用户尝试，不保存历史
        batch.push(this.tryDigitalCode(testUser, rollcallId, code));
      }

      const batchResults = await Promise.allSettled(batch);

      // 检查是否有成功的
      for (let idx = 0; idx < batchResults.length; idx++) {
        const result = batchResults[idx];
        if (result.status === "fulfilled" && result.value.success) {
          correctCode = result.value.code;
          console.log(`找到正确的签到码: ${correctCode}`);
          break;
        }
      }

      if (correctCode) {
        break;
      }
    }

    // 如果没有找到正确的签到码
    if (!correctCode) {
      throw new Error("未能找到正确的签到码（已尝试 0000-9999）");
    }

    // 使用正确的签到码给所有用户签到
    console.log(`使用签到码 ${correctCode} 为所有用户签到`);
    const results = await this.digitalSigninWithCode(
      users,
      rollcallId,
      correctCode,
    );

    return results;
  }

  /**
   * 尝试数字签到码（用于破解，不保存历史）
   * 返回是否成功以及签到码
   */
  private static async tryDigitalCode(
    user: any,
    rollcallId: string,
    numberCode: string,
  ): Promise<{ success: boolean; code: string }> {
    try {
      const latestCookie = user.cookies?.[0]?.value;

      if (!latestCookie) {
        return { success: false, code: numberCode };
      }

      // 构建请求数据
      const requestData = {
        deviceId: generateUUID(),
        numberCode: numberCode,
      };

      // 调用数字签到API
      const signUrl = `http://lms.tc.cqupt.edu.cn/api/rollcall/${rollcallId}/answer_number_rollcall`;

      const response = await fetch(signUrl, {
        method: "PUT",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Edg/141.0.0.0",
          "Content-Type": "application/json",
          Cookie: latestCookie,
        },
        body: JSON.stringify(requestData),
        credentials: "include",
      });

      // 判断是否成功（不保存历史）
      return { success: response.ok, code: numberCode };
    } catch (error) {
      return { success: false, code: numberCode };
    }
  }

  /**
   * 尝试使用指定的数字签到码进行签到（保存历史）
   */
  private static async attemptDigitalSignin(
    user: any,
    rollcallId: string,
    numberCode: string,
    scanHistoryId: string | null,
  ) {
    try {
      const latestCookie = user.cookies?.[0]?.value;

      if (!latestCookie) {
        throw new Error(`用户 ${user.name} 没有可用的Cookie`);
      }

      // 构建请求数据
      const requestData = {
        deviceId: generateUUID(),
        numberCode: numberCode,
      };

      // 调用数字签到API
      const signUrl = `http://lms.tc.cqupt.edu.cn/api/rollcall/${rollcallId}/answer_number_rollcall`;

      const response = await fetch(signUrl, {
        method: "PUT",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Edg/141.0.0.0",
          "Content-Type": "application/json",
          Cookie: latestCookie,
        },
        body: JSON.stringify(requestData),
        credentials: "include",
      });

      const responseData = await response.json();

      if (response.ok) {
        const signinHistory = await DatabaseService.addSigninHistory(
          user.id,
          latestCookie,
          scanHistoryId,
          requestData,
          response.status,
          responseData,
        );

        console.log(`用户 ${user.name} 数字签到成功，签到码: ${numberCode}`);
        return signinHistory;
      } else {
        // 失败时也保存，但标记为失败
        const signinHistory = await DatabaseService.addSigninHistory(
          user.id,
          latestCookie,
          scanHistoryId,
          requestData,
          response.status,
          responseData,
        );
        return signinHistory;
      }
    } catch (error) {
      console.error(`用户 ${user.name} 数字签到失败:`, error);
      const errorMessage = getErrorMessage(error);

      // 保存失败的签到记录
      const signinHistory = await DatabaseService.addSigninHistory(
        user.id,
        user.cookies?.[0]?.value || null,
        scanHistoryId,
        { error: errorMessage, numberCode },
        null,
        { error: errorMessage },
      );

      return signinHistory;
    }
  }
}
