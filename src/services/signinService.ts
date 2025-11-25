/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */
import { DatabaseService } from "../utils/db.ts";
import { parseSignQrCode } from "../utils/parse.ts";

// 生成随机UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export class SigninService {
  /**
   * 处理扫码签到
   */
  static async processSignin(scanResult: string, userId: string) {
    // 1. 保存扫码历史
    const scanHistory = await DatabaseService.addScanHistory(scanResult, userId);
    
    // 2. 解析扫码结果
    const parsedResult = parseSignQrCode(scanResult);
    
    // 3. 获取需要自动签到的用户
    const autoUsers = await DatabaseService.getAutoSigninUsers();
    
    // 4. 并发处理所有用户的签到
    const signinResults = await Promise.allSettled(
      autoUsers.map(user => this.signinUser(user, parsedResult, scanHistory.id))
    );
    
    // 5. 返回结果
    return {
      scan_result: scanHistory,
      signin_results: signinResults.map(result => 
        result.status === 'fulfilled' ? result.value : null
      ).filter(Boolean)
    };
  }

  /**
   * 为单个用户执行签到
   */
  private static async signinUser(
    user: any,
    parsedResult: any,
    scanHistoryId: string
  ) {
    try {
      const latestCookie = user.cookies?.[0]?.value;
      
      if (!latestCookie) {
        throw new Error(`用户 ${user.name} 没有可用的Cookie`);
      }

      if (!parsedResult.rollcallId) {
        throw new Error('扫码结果中缺少rollcallId');
      }

      if (!parsedResult.data) {
        throw new Error('扫码结果中缺少data字段');
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
          "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Edg/141.0.0.0",
          "Content-Type": "application/json",
          "Cookie": latestCookie,
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
        responseData
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
        { error: error.message }
      );

      return signinHistory;
    }
  }

  /**
   * 获取扫码历史
   */
  static async getScanHistory(count: number = 10, userId?: string, index: number = 0) {
    return await DatabaseService.getScanHistory(count, userId, index);
  }

  /**
   * 获取签到历史
   */
  static async getSigninHistory(count: number = 10, userId?: string, index: number = 0) {
    return await DatabaseService.getSigninHistory(count, userId, index);
  }

  /**
   * 处理数字签到
   */
  static async processDigitalSignin(data: string | undefined, userId: string) {
    // 1. 获取需要自动签到的用户
    const autoUsers = await DatabaseService.getAutoSigninUsers();
    
    if (autoUsers.length === 0) {
      throw new Error('没有开启自动签到的用户');
    }

    // 2. 获取活跃的签到任务
    const rollcallTasks = await this.getActiveRollcalls(autoUsers[0].cookies?.[0]?.value);
    
    // 3. 筛选出数字签到任务
    const digitalTasks = rollcallTasks.filter((task: any) => 
      task.status === 'absent' && task.is_number && !task.is_radar
    );

    if (digitalTasks.length === 0) {
      throw new Error('当前没有活跃的数字签到任务');
    }

    // 4. 对每个数字签到任务进行处理
    const allResults = [];
    
    for (const task of digitalTasks) {
      const rollcallId = task.rollcall_id;
      
      // 如果提供了具体的数字，直接使用
      if (data) {
        const results = await this.digitalSigninWithCode(autoUsers, rollcallId, data);
        allResults.push(...results);
      } else {
        // 否则遍历 0000-9999
        const results = await this.bruteForceDigitalSignin(autoUsers, rollcallId);
        allResults.push(...results);
      }
    }

    return {
      tasks: digitalTasks,
      signin_results: allResults
    };
  }

  /**
   * 获取活跃的签到任务
   */
  private static async getActiveRollcalls(cookie: string | undefined) {
    if (!cookie) {
      throw new Error('没有可用的Cookie');
    }

    const radarUrl = 'http://lms.tc.cqupt.edu.cn/api/radar/rollcalls';
    
    const response = await fetch(radarUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Edg/141.0.0.0',
        'Cookie': cookie,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`获取签到任务失败: ${response.status}`);
    }

    const data = await response.json();
    return data.rollcalls || [];
  }

  /**
   * 使用指定的数字签到码进行签到
   */
  private static async digitalSigninWithCode(
    users: any[],
    rollcallId: string,
    code: string
  ) {
    const results = await Promise.allSettled(
      users.map(user => this.attemptDigitalSignin(user, rollcallId, code, null))
    );

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : null
    ).filter(Boolean);
  }

  /**
   * 遍历破解数字签到（0000-9999）
   */
  private static async bruteForceDigitalSignin(
    users: any[],
    rollcallId: string
  ) {
    // 使用并发控制，避免过多请求
    const batchSize = 50;
    const allResults = [];

    for (let i = 0; i < 10000; i += batchSize) {
      const batch = [];
      
      for (let j = i; j < Math.min(i + batchSize, 10000); j++) {
        const code = j.toString().padStart(4, '0');
        
        // 对每个用户尝试这个签到码
        for (const user of users) {
          batch.push(this.attemptDigitalSignin(user, rollcallId, code, null));
        }
      }

      const batchResults = await Promise.allSettled(batch);
      
      // 检查是否有成功的
      const successResults = batchResults
        .map(result => result.status === 'fulfilled' ? result.value : null)
        .filter(result => result && result.response_code === 200);

      if (successResults.length > 0) {
        allResults.push(...successResults);
        // 找到正确的签到码后，停止遍历
        console.log(`找到正确的签到码，停止遍历`);
        break;
      }
    }

    return allResults;
  }

  /**
   * 尝试使用指定的数字签到码进行签到
   */
  private static async attemptDigitalSignin(
    user: any,
    rollcallId: string,
    numberCode: string,
    scanHistoryId: string | null
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
      const signUrl = `http://lms.tc.cqupt.edu.cn/api/rollcall/${rollcallId}/answer?api_version=1.76`;
      
      const response = await fetch(signUrl, {
        method: 'PUT',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Edg/141.0.0.0',
          'Content-Type': 'application/json',
          'Cookie': latestCookie,
        },
        body: JSON.stringify(requestData),
        credentials: 'include',
      });

      const responseData = await response.json();
      
      // 保存签到历史
      const signinHistory = await DatabaseService.addSigninHistory(
        user.id,
        latestCookie,
        scanHistoryId,
        requestData,
        response.status,
        responseData
      );

      // 如果签到成功，打印日志
      if (response.status === 200) {
        console.log(`用户 ${user.name} 数字签到成功，签到码: ${numberCode}`);
      }

      return signinHistory;
      
    } catch (error) {
      console.error(`用户 ${user.name} 数字签到失败:`, error);
      
      // 保存失败的签到记录
      const signinHistory = await DatabaseService.addSigninHistory(
        user.id,
        user.cookies?.[0]?.value || null,
        scanHistoryId,
        { error: error.message, numberCode },
        null,
        { error: error.message }
      );

      return signinHistory;
    }
  }
}
