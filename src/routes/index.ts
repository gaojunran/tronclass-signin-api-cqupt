import { Hono } from "hono";
import { UserService } from "../services/userService.ts";
import { SigninService } from "../services/signinService.ts";
import { LogService, LogAction } from "../services/logService.ts";
import type {
  AddUserRequest,
  RemoveUserRequest,
  RenameUserRequest,
  RefreshCookieRequest,
  SetAutoRequest,
  SigninRequest,
  AddUserResponse,
  SigninResponse,
  UserWithCookie
} from "../types/index.ts";

const app = new Hono();

// 中间件：验证请求体
app.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    try {
      const body = await c.req.json();
      c.set("body", body);
    } catch {
      // 如果JSON解析失败，继续处理
    }
  }
  await next();
});

/**
 * /user/list：列出目前所有需要被签到的用户
 */
app.get("/user/list", async (c) => {
  try {
    const users = await UserService.getAllUsers();
    return c.json(users);
  } catch (error) {
    console.error("获取用户列表失败:", error);
    return c.json({ error: "获取用户列表失败" }, 500);
  }
});

/**
 * /user/add：新增一个用户
 */
app.post("/user/add", async (c) => {
  try {
    const body = c.get("body") as AddUserRequest;
    const { ua_info, name } = body;
    
    if (!name) {
      return c.json({ error: "用户名不能为空" }, 400);
    }
    
    const result = await UserService.addUser(name);
    
    // 记录日志（在业务逻辑之后）
    await LogService.logUserAdd(ua_info, name, result);
    
    return c.json(result as AddUserResponse);
  } catch (error) {
    console.error("添加用户失败:", error);
    return c.json({ error: "添加用户失败" }, 500);
  }
});

/**
 * /user/remove/<id>：删除一个用户
 */
app.post("/user/remove/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = c.get("body") as RemoveUserRequest;
    const { ua_info } = body;
    
    if (!id) {
      return c.json({ error: "用户ID不能为空" }, 400);
    }
    
    // 验证用户是否存在
    const exists = await UserService.userExists(id);
    if (!exists) {
      return c.json({ error: "用户不存在" }, 404);
    }
    
    await UserService.removeUser(id);
    
    // 记录日志（在业务逻辑之后）
    await LogService.logUserRemove(ua_info, id, { success: true });
    
    return c.json({ success: true });
  } catch (error) {
    console.error("删除用户失败:", error);
    return c.json({ error: "删除用户失败" }, 500);
  }
});

/**
 * /user/rename/<id>：给一个用户改名
 */
app.post("/user/rename/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = c.get("body") as RenameUserRequest;
    const { ua_info, new_name } = body;
    
    if (!id) {
      return c.json({ error: "用户ID不能为空" }, 400);
    }
    
    if (!new_name) {
      return c.json({ error: "新用户名不能为空" }, 400);
    }
    
    // 验证用户是否存在
    const exists = await UserService.userExists(id);
    if (!exists) {
      return c.json({ error: "用户不存在" }, 404);
    }
    
    const result = await UserService.renameUser(id, new_name);
    
    // 记录日志（在业务逻辑之后）
    await LogService.logUserRename(ua_info, id, new_name, result);
    
    return c.json(result);
  } catch (error) {
    console.error("重命名用户失败:", error);
    return c.json({ error: "重命名用户失败" }, 500);
  }
});

/**
 * /user/refresh/<id>：给一个用户更新cookie
 */
app.post("/user/refresh/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = c.get("body") as RefreshCookieRequest;
    const { ua_info, cookie } = body;
    
    if (!id) {
      return c.json({ error: "用户ID不能为空" }, 400);
    }
    
    if (!cookie) {
      return c.json({ error: "Cookie不能为空" }, 400);
    }
    
    // 验证用户是否存在
    const exists = await UserService.userExists(id);
    if (!exists) {
      return c.json({ error: "用户不存在" }, 404);
    }
    
    const result = await UserService.refreshCookie(id, cookie);
    
    // 记录日志（在业务逻辑之后）
    await LogService.logUserRefreshCookie(ua_info, id, result);
    
    return c.json(result);
  } catch (error) {
    console.error("更新Cookie失败:", error);
    return c.json({ error: "更新Cookie失败" }, 500);
  }
});

/**
 * /user/auto/<id>：给一个用户更新其 is_auto 的值
 */
app.post("/user/auto/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = c.get("body") as SetAutoRequest;
    const { ua_info, is_auto } = body;
    
    if (!id) {
      return c.json({ error: "用户ID不能为空" }, 400);
    }
    
    if (typeof is_auto !== "boolean") {
      return c.json({ error: "is_auto必须是布尔值" }, 400);
    }
    
    // 验证用户是否存在
    const exists = await UserService.userExists(id);
    if (!exists) {
      return c.json({ error: "用户不存在" }, 404);
    }
    
    const result = await UserService.setUserAuto(id, is_auto);
    
    // 记录日志（在业务逻辑之后）
    await LogService.logUserSetAuto(ua_info, id, is_auto, result);
    
    return c.json(result);
  } catch (error) {
    console.error("设置自动签到失败:", error);
    return c.json({ error: "设置自动签到失败" }, 500);
  }
});

/**
 * /signin：扫码签到，上传扫码结果，自动给所有用户签到
 */
app.post("/signin", async (c) => {
  try {
    const body = c.get("body") as SigninRequest;
    const { ua_info, scan_result, user_id } = body;
    
    if (!scan_result) {
      return c.json({ error: "扫码结果不能为空" }, 400);
    }
    
    const result = await SigninService.processSignin(scan_result, user_id);
    
    // 记录扫码日志（在业务逻辑之后）
    await LogService.logScanSignin(ua_info, scan_result, user_id, result);
    
    // 记录自动签到日志
    const userIds = result.signin_results.map(r => r?.user_id).filter(Boolean) as string[];
    await LogService.logSigninAuto(ua_info, result.scan_result.id, userIds, result);
    
    return c.json(result as SigninResponse);
  } catch (error) {
    console.error("扫码签到失败:", error);
    return c.json({ error: "扫码签到失败" }, 500);
  }
});

/**
 * /history/signin：按时间最近，列出所有签到历史
 */
app.get("/history/signin", async (c) => {
  try {
    const count = parseInt(c.req.query("count") || "10");
    const userId = c.req.query("user_id");
    const index = parseInt(c.req.query("index") || "0");
    
    const history = await SigninService.getSigninHistory(count, userId, index);
    return c.json(history);
  } catch (error) {
    console.error("获取签到历史失败:", error);
    return c.json({ error: "获取签到历史失败" }, 500);
  }
});

/**
 * /history/scan：按时间最近，列出所有扫码历史
 */
app.get("/history/scan", async (c) => {
  try {
    const count = parseInt(c.req.query("count") || "10");
    const userId = c.req.query("user_id");
    const index = parseInt(c.req.query("index") || "0");
    
    const history = await SigninService.getScanHistory(count, userId, index);
    return c.json(history);
  } catch (error) {
    console.error("获取扫码历史失败:", error);
    return c.json({ error: "获取扫码历史失败" }, 500);
  }
});

// 健康检查接口
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 新增仓库URL端点
app.get("/backend/repo/url", (c) => {
  return c.text("https://github.com/gaojunran/tronclass-signin-api-cqupt");
});

// 404处理
app.notFound((c) => {
  return c.json({ error: "接口不存在" }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error("服务器错误:", err);
  return c.json({ error: "服务器内部错误" }, 500);
});

export default app;
