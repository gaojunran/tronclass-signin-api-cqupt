# TronClass 批量扫码签到 API

基于 Hono + Prisma + Deno 开发的后端 API，用于批量处理 TronClass 扫码签到。

## 功能特性

- ✅ 用户管理（添加、删除、重命名）
- ✅ Cookie 管理（更新用户 Cookie）
- ✅ 自动签到设置
- ✅ 扫码签到处理
- ✅ 历史记录查询
- ✅ 操作日志记录
- ✅ CORS 支持

## 技术栈

- **框架**: Hono (轻量级 Web 框架)
- **运行时**: Deno
- **数据库**: PostgreSQL + Prisma ORM
- **语言**: TypeScript

## 快速开始

### 1. 环境准备

确保已安装:
- Deno (>= 1.40.0)
- PostgreSQL (>= 12.0)

### 2. 克隆项目

```bash
git clone <repository-url>
cd tronclass-signin-api-cqupt
```

### 3. 配置环境变量

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

### 4. 初始化数据库

创建数据库并运行迁移:

```bash
# 使用提供的 SQL 文件创建数据库结构
psql -U postgres -f .llm/db.sql

# 生成 Prisma 客户端
deno task db:generate

# 推送数据库结构
deno task db:push
```

### 5. 启动服务

```bash
# 开发模式
deno task start

# 或直接运行
deno run --allow-net --allow-env --allow-read --allow-write main.ts
```

服务将在 http://localhost:8000 启动

## API 文档

### 用户管理

#### 获取用户列表
```http
GET /api/user/list
```

#### 添加用户
```http
POST /api/user/add
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "name": "用户名"
}
```

#### 删除用户
```http
POST /api/user/remove/:id
Content-Type: application/json

{
  "ua_info": "浏览器信息"
}
```

#### 重命名用户
```http
POST /api/user/rename/:id
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "new_name": "新用户名"
}
```

#### 更新用户 Cookie
```http
POST /api/user/refresh/:id
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "cookie": "cookie字符串"
}
```

#### 设置自动签到
```http
POST /api/user/auto/:id
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "is_auto": true
}
```

### 签到功能

#### 扫码签到
```http
POST /api/signin
Content-Type: application/json

{
  "ua_info": "浏览器信息",
  "scan_result": "扫码结果字符串"
}
```

### 历史记录

#### 获取签到历史
```http
GET /api/history/signin?count=10&user_id=用户ID
```

#### 获取扫码历史
```http
GET /api/history/scan?count=10&user_id=用户ID
```

### 系统状态

#### 健康检查
```http
GET /api/health
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

## 开发指南

### 项目结构

```
src/
├── types/          # TypeScript 类型定义
├── services/       # 业务逻辑服务
├── utils/          # 工具函数
├── routes/         # API 路由
└── main.ts         # 应用入口
```

### 开发命令

```bash
# 启动开发服务器
deno task start

# 生成 Prisma 客户端
deno task db:generate

# 数据库迁移
deno task db:push

# 打开 Prisma Studio
deno task db:studio
```

### 代码规范

- 使用 TypeScript 严格模式
- 遵循 RESTful API 设计原则
- 所有数据库操作通过 Prisma 进行
- 错误处理使用 try-catch 包装

## 部署

### 生产环境部署

1. 设置生产环境变量
2. 构建项目
3. 使用 PM2 或类似工具管理进程

```bash
# 生产环境启动
deno run --allow-net --allow-env --allow-read --allow-write main.ts
```

### Docker 部署

```dockerfile
FROM denoland/deno:alpine

WORKDIR /app
COPY . .

RUN deno cache main.ts

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]
```

## 注意事项

1. **安全性**: 生产环境请使用 HTTPS
2. **数据库**: 定期备份数据库
3. **日志**: 操作日志会记录所有敏感操作
4. **CORS**: 根据前端域名配置 CORS

## 许可证

MIT License
