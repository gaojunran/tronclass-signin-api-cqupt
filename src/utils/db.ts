/** biome-ignore-all lint/complexity/noStaticOnlyClass: <explanation> */
import { PrismaClient } from "../../generated/prisma/client.ts";
import { PrismaPg } from '@prisma/adapter-pg';
import { UserWithCookie } from "../types/index.ts";


const adapter = new PrismaPg({
  connectionString: Deno.env.get("DATABASE_URL") || "",
});
const prisma = new PrismaClient({ adapter });

// 数据库操作函数
export class DatabaseService {
  // 获取所有用户（带最新cookie）
  static async getAllUsersWithCookies(): Promise<UserWithCookie[]> {
    return await prisma.$queryRaw`
      SELECT 
        u.id,
        u.name,
        u.is_auto,
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
    `;
  }

  // 添加用户
  static async addUser(name: string, isAuto: boolean = true) {
    return await prisma.user.create({
      data: {
        name,
        is_auto: isAuto,
      },
    });
  }

  // 删除用户
  static async removeUser(id: string) {
    return await prisma.user.delete({
      where: { id },
    });
  }

  // 重命名用户
  static async renameUser(id: string, newName: string) {
    return await prisma.user.update({
      where: { id },
      data: { name: newName },
    });
  }

  // 更新用户自动签到设置
  static async setUserAuto(id: string, isAuto: boolean) {
    return await prisma.user.update({
      where: { id },
      data: { is_auto: isAuto },
    });
  }

  // 添加或更新Cookie
  static async addCookie(userId: string, value: string, expires?: Date) {
    return await prisma.cookie.create({
      data: {
        user_id: userId,
        value,
        expires,
      },
    });
  }

  // 获取用户的最新Cookie
  static async getLatestCookie(userId: string) {
    return await prisma.cookie.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  // 添加扫码历史
  static async addScanHistory(result: string, userId: string) {
    return await prisma.scanHistory.create({
      data: {
        result,
        user_id: userId,
      },
    });
  }

  // 添加签到历史
  static async addSigninHistory(
    userId: string,
    cookie: string | null,
    scanHistoryId: string | null,
    requestData: any,
    responseCode: number | null,
    responseData: any | null
  ) {
    return await prisma.signinHistory.create({
      data: {
        user_id: userId,
        cookie,
        scan_history_id: scanHistoryId,
        request_data: requestData,
        response_code: responseCode,
        response_data: responseData,
      },
    });
  }

  // 获取扫码历史
  static async getScanHistory(count: number = 10, userId?: string, index: number = 0) {
    const where = userId ? { user_id: userId } : {};
    return await prisma.scanHistory.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: index * count,
      take: count,
    });
  }

  // 获取签到历史
  static async getSigninHistory(count: number = 10, userId?: string, index: number = 0) {
    const where = userId ? { user_id: userId } : {};
    return await prisma.signinHistory.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: index * count,
      take: count,
      include: {
        user: {
          select: { name: true },
        },
      },
    });
  }

  // 添加日志
  static async addLog(action: string, data: any) {
    return await prisma.log.create({
      data: {
        action,
        data,
      },
    });
  }

  // 获取所有需要自动签到的用户
  static async getAutoSigninUsers() {
    return await prisma.user.findMany({
      where: { is_auto: true },
      include: {
        cookies: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });
  }
}
