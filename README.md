# TronClass 批量扫码签到 - 学在重邮 API

基于 Hono + Prisma + Deno 开发的后端 API，用于批量处理 TronClass 扫码签到。为 [tronclass-signin-app](https://github.com/gaojunran/tronclass-signin-app) 提供「学在重邮」的后端支持。

> [!CAUTION]
> 本项目仅供 **自部署** 技术交流，请勿用于违反校规或法律的用途。

## 功能特性

- ✅ 用户管理（添加、删除、重命名）
- ✅ Cookie 管理（更新用户 Cookie）
- ✅ 自动签到设置
- ✅ 扫码签到处理
- ✅ 历史记录查询
- ✅ 操作日志记录
- ✅ CORS 支持

## 技术栈

- **框架**: Hono 
- **运行时**: Deno
- **数据库**: PostgreSQL + Prisma ORM
- **语言**: TypeScript

## 快速开始

### 1. 配置环境变量

复制环境变量文件并修改配置:

```bash
cp .env.example .env
```

编辑 `.env` 文件:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/tronclass"
PORT=8000
NODE_ENV=development
```

### 2. 配置 prisma

```bash
deno run -A npm:prisma generate
```

这适用于你已经搭建了数据库表的情况。如果你只有一个空数据库，可以：

```bash
deno run -A npm:prisma migrate dev --name init
```

这将生成迁移 SQL 并在你的数据库中执行。

### 3. 启动服务

```bash
deno run -A main.ts
```

## API 文档

### 用户管理

#### 获取用户列表
```http
GET /user/list
```

#### 添加用户
```http
POST /user/add
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "name": "用户名"
}
```

#### 删除用户
```http
POST /user/remove/:id
Content-Type: application/json

{
  "ua_info": "浏览器信息"
}
```

#### 重命名用户
```http
POST /user/rename/:id
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "new_name": "新用户名"
}
```

#### 更新用户 Cookie
```http
POST /user/refresh/:id
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "cookie": "cookie字符串"
}
```

#### 设置自动签到
```http
POST /user/auto/:id
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "is_auto": true
}
```

### 签到功能

#### 扫码签到
```http
POST /signin
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "scan_result": "扫码结果字符串"
}
```

### 历史记录

#### 获取签到历史
```http
GET /history/signin?count=10&user_id=用户ID
```

#### 获取扫码历史
```http
GET /history/scan?count=10&user_id=用户ID
```

### 系统状态

#### 健康检查
```http
GET /health
```

## 数据库结构

### 主要表结构

- `users` - 用户表
- `cookies` - Cookie 表
- `scan_history` - 扫码历史表
- `signin_history` - 签到历史表
- `log` - 操作日志表

### 视图

- `user_with_cookie` - 带最新 Cookie 的用户视图

## 许可证

MIT License
