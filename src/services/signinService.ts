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
    console.log("signin for user", user, parsedResult, scanHistoryId);
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
      const signUrl = `https://lms.tc.cqupt.edu.cn/api/rollcall/${parsedResult.rollcallId}/answer_qr_rollcall`;
      
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
  static async getScanHistory(count: number = 10, userId?: string) {
    return await DatabaseService.getScanHistory(count, userId);
  }

  /**
   * 获取签到历史
   */
  static async getSigninHistory(count: number = 10, userId?: string) {
    return await DatabaseService.getSigninHistory(count, userId);
  }
}
