/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */
import { DatabaseService } from "../utils/db.ts";

// 日志操作类型
export enum LogAction {
  USER_ADD = "USER_ADD",
  USER_REMOVE = "USER_REMOVE", 
  USER_RENAME = "USER_RENAME",
  USER_REFRESH_COOKIE = "USER_REFRESH_COOKIE",
  USER_SET_AUTO = "USER_SET_AUTO",
  SCAN_SIGNIN = "SCAN_SIGNIN",
  SIGNIN_AUTO = "SIGNIN_AUTO",
  DIGITAL_SIGNIN = "DIGITAL_SIGNIN",
  OTHER = "OTHER"
}

export class LogService {
  /**
   * 添加日志记录
   */
  static async addLog(
    action: LogAction, 
    uaInfo: string, 
    queryParams?: Record<string, any>, 
    bodyParams?: Record<string, any>,
    responseParams?: Record<string, any>
  ) {
    // 合并查询参数、请求体参数和响应体参数
    const data = {
      ua_info: uaInfo,
      query: queryParams || {},
      body: bodyParams || {},
      response: responseParams || {},
      timestamp: new Date().toISOString()
    };

    return await DatabaseService.addLog(action, data);
  }

  /**
   * 用户添加日志
   */
  static async logUserAdd(uaInfo: string, name: string, response?: any) {
    return await LogService.addLog(LogAction.USER_ADD, uaInfo, {}, { name }, response);
  }

  /**
   * 用户删除日志
   */
  static async logUserRemove(uaInfo: string, userId: string, response?: any) {
    return await LogService.addLog(LogAction.USER_REMOVE, uaInfo, { user_id: userId }, {}, response);
  }

  /**
   * 用户重命名日志
   */
  static async logUserRename(uaInfo: string, userId: string, newName: string, response?: any) {
    return await LogService.addLog(LogAction.USER_RENAME, uaInfo, { user_id: userId }, { new_name: newName }, response);
  }

  /**
   * 用户Cookie刷新日志
   */
  static async logUserRefreshCookie(uaInfo: string, userId: string, response?: any) {
    return await LogService.addLog(LogAction.USER_REFRESH_COOKIE, uaInfo, { user_id: userId }, {}, response);
  }

  /**
   * 用户自动签到设置日志
   */
  static async logUserSetAuto(uaInfo: string, userId: string, isAuto: boolean, response?: any) {
    return await LogService.addLog(LogAction.USER_SET_AUTO, uaInfo, { user_id: userId }, { is_auto: isAuto }, response);
  }

  /**
   * 扫码签到日志
   */
  static async logScanSignin(uaInfo: string, scanResult: string, userId?: string, response?: any) {
    return await LogService.addLog(LogAction.SCAN_SIGNIN, uaInfo, { user_id: userId }, { scan_result: scanResult }, response);
  }

  /**
   * 自动签到日志
   */
  static async logSigninAuto(uaInfo: string, scanHistoryId: string, userIds: string[], response?: any) {
    return await LogService.addLog(LogAction.SIGNIN_AUTO, uaInfo, { scan_history_id: scanHistoryId }, { user_ids: userIds }, response);
  }

  /**
   * 数字签到日志
   */
  static async logDigitalSignin(uaInfo: string, data?: string, userId?: string, response?: any) {
    return await LogService.addLog(LogAction.DIGITAL_SIGNIN, uaInfo, { user_id: userId }, { data }, response);
  }
}
