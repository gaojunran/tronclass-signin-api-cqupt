import { Hono } from 'hono'
import { cors } from 'hono/cors'
import apiRoutes from './src/routes/index.ts'

const app = new Hono()

// 配置CORS
app.use('*', cors({
  origin: (origin) => origin || '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))

// 根路径
app.get('/', (c) => {
  return c.json({
    message: 'TronClass Signin API Server',
    version: '1.0.0',
    endpoints: {
      '/user/list': 'GET - 获取用户列表',
      '/user/add': 'POST - 添加用户',
      '/user/remove/:id': 'POST - 删除用户',
      '/user/rename/:id': 'POST - 重命名用户',
      '/user/refresh/:id': 'POST - 更新用户Cookie',
      '/user/auto/:id': 'POST - 设置自动签到',
      '/user/identity/update/:id': 'POST - 更新用户身份信息',
      '/signin': 'POST - 扫码签到',
      '/signin-digital': 'POST - 数字签到',
      '/todos': 'GET - 获取用户待办事项',
      '/history/signin': 'GET - 获取签到历史',
      '/history/scan': 'GET - 获取扫码历史',
      '/wx/jssdk-config': 'GET - 获取微信JS-SDK配置签名',
      '/health': 'GET - 健康检查'
    }
  })
})

// 挂载API路由
app.route('/', apiRoutes)

// 启动服务器
const port = parseInt(Deno.env.get('PORT') || '8001')

console.log(`🚀 TronClass Signin API Server starting on port ${port}...`)
console.log(`📊 Environment: ${Deno.env.get('NODE_ENV') || 'development'}`)

Deno.serve({
  port,
  onListen: ({ port, hostname }) => {
    console.log(`✅ Server is running on http://${hostname}:${port}`)
    console.log(`📚 API Documentation: http://${hostname}:${port}/`)
  },
}, app.fetch)
