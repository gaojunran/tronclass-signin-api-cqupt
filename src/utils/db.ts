/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */
import { db } from "../db/index.ts";
import { users, cookies, scanHistory, signinHistory, log } from "../db/schema.ts";
import type { UserWithCookie } from "../types/index.ts";
import { eq, desc, sql } from "drizzle-orm";
import { v4 } from "uuid";


// 数据库操作函数
export class DatabaseService {
  // 获取所有用户（带最新cookie）
  static async getAllUsersWithCookies(): Promise<UserWithCookie[]> {
    const result = await db.execute(sql`
      SELECT 
        u.id,
        u.name,
        u.is_auto,
        u.identity_account,
        u.identity_password,
        c.value AS latest_cookie,
        c.expires
      FROM users u
      LEFT JOIN LATERAL (
        SELECT value, expires
        FROM cookies
        WHERE cookies.user_id = u.id
        ORDER BY created_at DESC
        LIMIT 1
      ) c ON TRUE
    `);
    return result.rows as unknown as UserWithCookie[];
  }

  // 添加用户
  static async addUser(name: string, isAuto: boolean = true) {
    const [user] = await db.insert(users).values({
      id: v4.generate(),
      name,
      is_auto: isAuto,
    }).returning();
    return user;
  }

  // 删除用户
  static async removeUser(id: string) {
    const [user] = await db.delete(users)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // 重命名用户
  static async renameUser(id: string, newName: string) {
    const [user] = await db.update(users)
      .set({ name: newName })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // 更新用户自动签到设置
  static async setUserAuto(id: string, isAuto: boolean) {
    const [user] = await db.update(users)
      .set({ is_auto: isAuto })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // 更新用户身份信息
  static async updateUserIdentity(id: string, account: string, password: string) {
    const [user] = await db.update(users)
      .set({ 
        identity_account: account,
        identity_password: password
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // 添加或更新Cookie
  static async addCookie(userId: string, value: string, expires?: Date) {
    const [cookie] = await db.insert(cookies).values({
      id: v4.generate(),
      user_id: userId,
      value,
      expires,
    }).returning();
    return cookie;
  }

  // 获取用户的最新Cookie
  static async getLatestCookie(userId: string) {
    const [cookie] = await db.select()
      .from(cookies)
      .where(eq(cookies.user_id, userId))
      .orderBy(desc(cookies.created_at))
      .limit(1);
    return cookie;
  }

  // 添加扫码历史
  static async addScanHistory(result: string, userId: string) {
    const [scan] = await db.insert(scanHistory).values({
      id: v4.generate(),
      result,
      user_id: userId,
    }).returning();
    return scan;
  }

  // 添加签到历史
  static async addSigninHistory(
    userId: string,
    cookie: string | null,
    scanHistoryId: string | null,
    requestData: Record<string, unknown>,
    responseCode: number | null,
    responseData: Record<string, unknown> | null
  ) {
    const [signin] = await db.insert(signinHistory).values({
      id: v4.generate(),
      user_id: userId,
      cookie,
      scan_history_id: scanHistoryId,
      request_data: requestData,
      response_code: responseCode,
      response_data: responseData,
    }).returning();
    return signin;
  }

  // 获取扫码历史
  static async getScanHistory(count: number = 10, userId?: string, index: number = 0) {
    const query = db.select().from(scanHistory);
    
    if (userId) {
      query.where(eq(scanHistory.user_id, userId));
    }
    
    const results = await query
      .orderBy(desc(scanHistory.created_at))
      .limit(count)
      .offset(index * count);
    
    return results;
  }

  // 获取签到历史
  static async getSigninHistory(count: number = 10, userId?: string, index: number = 0) {
    const query = db.select({
      id: signinHistory.id,
      user_id: signinHistory.user_id,
      cookie: signinHistory.cookie,
      scan_history_id: signinHistory.scan_history_id,
      request_data: signinHistory.request_data,
      response_code: signinHistory.response_code,
      response_data: signinHistory.response_data,
      created_at: signinHistory.created_at,
      user: {
        name: users.name,
      },
    })
    .from(signinHistory)
    .leftJoin(users, eq(signinHistory.user_id, users.id));
    
    if (userId) {
      query.where(eq(signinHistory.user_id, userId));
    }
    
    const results = await query
      .orderBy(desc(signinHistory.created_at))
      .limit(count)
      .offset(index * count);
    
    return results;
  }

  // 添加日志
  static async addLog(action: string, data: Record<string, unknown>) {
    const [logEntry] = await db.insert(log).values({
      id: v4.generate(),
      action,
      data,
    }).returning();
    return logEntry;
  }

  // 获取所有需要自动签到的用户
  static async getAutoSigninUsers() {
    const results = await db.select({
      id: users.id,
      name: users.name,
      is_auto: users.is_auto,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.is_auto, true));

    // 为每个用户获取最新的 cookie
    const usersWithCookies = await Promise.all(
      results.map(async (user) => {
        const [latestCookie] = await db.select()
          .from(cookies)
          .where(eq(cookies.user_id, user.id))
          .orderBy(desc(cookies.created_at))
          .limit(1);
        
        return {
          ...user,
          cookies: latestCookie ? [latestCookie] : [],
        };
      })
    );

    return usersWithCookies;
  }
}

