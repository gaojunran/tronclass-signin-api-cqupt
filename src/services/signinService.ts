/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */
import { DatabaseService } from "../utils/db.ts";
import { parseSignQrCode } from "../utils/parse.ts";

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

  /**
   * 处理扫码签到
   */
  static async processSignin(scanResult: string, userId: string) {
    // 1. 保存扫码历史
    const scanHistory = await DatabaseService.addScanHistory(
      scanResult,
      userId,
    );

    // 2. 解析扫码结果
    const parsedResult = parseSignQrCode(scanResult);

    // 3. 获取需要自动签到的用户
    const autoUsers = await DatabaseService.getAutoSigninUsers();

    // 4. 过滤掉请假的用户
    const currentTime = new Date();
    const availableUsers = [];
    for (const user of autoUsers) {
      const isAbsent = await DatabaseService.isUserAbsent(user.id, currentTime);
      if (!isAbsent) {
        availableUsers.push(user);
      }
    }

    // 5. 并发处理所有用户的签到
    const signinResults = await Promise.allSettled(
      availableUsers.map((user) =>
        this.signinUser(user, parsedResult, scanHistory.id),
      ),
    );

    // 6. 返回结果
    return {
      scan_result: scanHistory,
      signin_results: signinResults
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter(Boolean),
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

      return signinHistory;
    } catch (error) {
      console.error(`用户 ${user.name} 签到失败:`, error);

      // 保存失败的签到记录
      const signinHistory = await DatabaseService.addSigninHistory(
        user.id,
        user.cookies?.[0]?.value || null,
        scanHistoryId,
        { error: error.message },
        null,
        { error: error.message },
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
  static async processDigitalSignin(data: string | undefined, userId: string) {
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
      .filter(Boolean);
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

      // 保存失败的签到记录
      const signinHistory = await DatabaseService.addSigninHistory(
        user.id,
        user.cookies?.[0]?.value || null,
        scanHistoryId,
        { error: error.message, numberCode },
        null,
        { error: error.message },
      );

      return signinHistory;
    }
  }
}
