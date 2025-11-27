# Prisma to Drizzle Migration Guide

## 迁移已完成

已成功将项目从 Prisma 迁移到 Drizzle ORM。

### 变更概览

#### 1. 新增文件
- **`src/db/schema.ts`** - Drizzle 数据库模式定义
- **`src/db/index.ts`** - Drizzle 数据库客户端配置
- **`drizzle.config.ts`** - Drizzle Kit 配置文件

#### 2. 修改文件
- **`src/utils/db.ts`** - 从 Prisma Client 迁移到 Drizzle ORM
- **`deno.json`** - 更新依赖和任务脚本

#### 3. 依赖变更
移除的依赖：
- `@prisma/client`
- `@prisma/adapter-pg`
- `prisma`

添加的依赖：
- `drizzle-kit@^0.30.1`

保留的依赖：
- `drizzle-orm@^0.44.7` (已存在)
- `@neondatabase/serverless@^1.0.2` (已存在)

### 迁移后的新命令

```bash
# 生成迁移文件
deno task db:generate

# 推送模式到数据库
deno task db:push

# 运行迁移
deno task db:migrate

# 打开 Drizzle Studio
deno task db:studio

# 启动应用
deno task start
```

### 数据库模式

所有表结构保持不变：
- `users` - 用户表
- `cookies` - Cookie 表
- `scan_history` - 扫码历史表
- `signin_history` - 签到历史表
- `log` - 日志表

### API 兼容性

`DatabaseService` 类的所有方法签名保持不变，确保与现有代码的兼容性。

### 注意事项

1. **现有的 Prisma 迁移文件保留**在 `prisma/migrations/` 目录中，作为历史记录
2. 数据库结构无需改动，可以直接使用现有数据库
3. 如果遇到类型错误，请运行 `deno cache --reload main.ts` 重新加载依赖

### 主要优势

1. **更好的 Deno 支持** - Drizzle 对 Deno 的支持更原生
2. **类型安全** - 完全的 TypeScript 类型推断
3. **更轻量** - 无需生成客户端代码
4. **SQL-like API** - 更接近原生 SQL 的 API 设计
5. **更好的性能** - 使用 Neon Serverless 连接，优化了无服务器环境

### 后续步骤

如果需要创建新的迁移或修改数据库结构：

1. 修改 `src/db/schema.ts`
2. 运行 `deno task db:generate` 生成迁移文件
3. 运行 `deno task db:push` 或 `deno task db:migrate` 应用更改

可以安全删除以下文件/目录（如果不再需要）：
- `prisma/` 目录
- `generated/` 目录
- `prisma.config.ts`
