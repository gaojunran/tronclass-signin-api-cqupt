/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */
import { DatabaseService } from "../utils/db.ts";

export class UserService {
  /**
   * 获取所有用户（带最新Cookie）
   */
  static async getAllUsers() {
    const users = await DatabaseService.getAllUsersWithCookies();
    return users.map((user: { id: any; name: any; is_auto: any; identity_account: any; identity_password: any; qq_account: any; latest_cookie: any; expires: any; }) => ({
      id: user.id,
      name: user.name,
      is_auto: user.is_auto,
      identity_account: user.identity_account,
      identity_password: user.identity_password,
      qq_account: user.qq_account,
      latest_cookie: user.latest_cookie,
      expires: user.expires,
    }));
  }

  /**
   * 添加用户
   */
  static async addUser(name: string, isAuto: boolean = true) {
    const user = await DatabaseService.addUser(name, isAuto);
    return { id: user.id };
  }

  /**
   * 删除用户
   */
  static async removeUser(id: string) {
    await DatabaseService.removeUser(id);
    return { success: true };
  }

  /**
   * 重命名用户
   */
  static async renameUser(id: string, newName: string) {
    const user = await DatabaseService.renameUser(id, newName);
    return { id: user.id, name: user.name };
  }

  /**
   * 设置用户自动签到
   */
  static async setUserAuto(id: string, isAuto: boolean) {
    const user = await DatabaseService.setUserAuto(id, isAuto);
    return { id: user.id, is_auto: user.is_auto };
  }

  /**
   * 更新用户身份信息
   */
  static async updateIdentity(id: string, account: string, password: string) {
    const user = await DatabaseService.updateUserIdentity(id, account, password);
    return { 
      id: user.id, 
      identity_account: user.identityAccount,
      identity_password: user.identityPassword
    };
  }

  /**
   * 更新用户Cookie
   */
  static async refreshCookie(userId: string, cookie: string, expires?: Date) {
    const cookieRecord = await DatabaseService.addCookie(userId, cookie, expires);
    return { 
      id: cookieRecord.id, 
      user_id: cookieRecord.user_id,
      expires: cookieRecord.expires 
    };
  }

  /**
   * 获取用户信息
   */
  static async getUser(id: string) {
    const user = await DatabaseService.getAllUsersWithCookies();
    const foundUser = user.find((u: { id: string; }) => u.id === id);
    if (!foundUser) {
      throw new Error('用户不存在');
    }
    return {
      id: foundUser.id,
      name: foundUser.name,
      is_auto: foundUser.is_auto,
      latest_cookie: foundUser.latest_cookie,
      expires: foundUser.expires,
    };
  }

  /**
   * 验证用户是否存在
   */
  static async userExists(id: string): Promise<boolean> {
    try {
      await UserService.getUser(id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 通过 QQ 账号查找用户
   */
  static async getUserByQQAccount(qqAccount: string) {
    return await DatabaseService.getUserByQQAccount(qqAccount);
  }

  /**
   * 添加请假记录
   */
  static async addAbsence(
    userId: string,
    classBeginAt: Date,
    plus: number = 100,
    minus: number = 15
  ) {
    return await DatabaseService.addAbsence(userId, classBeginAt, plus, minus);
  }

  /**
   * 获取用户最新的请假记录
   */
  static async getLatestAbsence(userId: string) {
    return await DatabaseService.getLatestAbsence(userId);
  }

  /**
   * 删除请假记录
   */
  static async removeAbsence(id: string) {
    return await DatabaseService.removeAbsence(id);
  }
}
