请你开发 Hono + Prisma 框架的 后端 API，此项目的背景 如 .llm/BACKGROUND.md 所述。SQL 建表语句在 .llm/db.sql 中。

## 注意事项

1. 所有会影响数据库的接口，请求都带有 ua_info 字段，这些接口操作时应该在 log 表中新增一行，其中把请求的 query 参数和请求体参数合并起来存入 log 表的 data 字段，以便审计。


## /user/list：列出目前所有需要被签到的用户。

直接查数据库 user_with_cookie

## /user/add：新增一个用户

POST 请求，请求体是 ua_info, name，响应体包含 id

直接操作 user 表即可

## /user/remove/<id>：删除一个用户

POST 请求，请求体只有 ua_info

直接操作 user 表即可

## /user/rename/<id>：给一个用户改名

POST 请求，请求体：ua_info, new_name

直接操作 user 表即可

## /user/refresh/<id>：给一个用户更新cookie

POST 请求，请求体：ua_info, cookie

给 cookie 表新增一行

## /user/auto/<id>：给一个用户更新其 is_auto 的值

POST 请求，请求体：ua_info, is_auto

直接操作 user 表即可

## /signin：扫码签到，上传扫码结果，自动给所有用户签到，返回签到结果

POST 请求，请求体：ua_info, scan_result，返回的数据结构是:

{
  "scan_result": ScanHistory,
  "signin_results": SigninHistory[]
}

这个接口逻辑比较复杂，我展开讲一下：

首先，用户将扫码结果通过接口传递。

你应该把扫码结果存入 scan_history 表中。

接着你应该把这个字符串用 .llm/parse.py 里的逻辑解析（你应该用 TS 重写这个解析函数），得到的字典中有一个键为 data 的字段和一个键为 rollcallId 的字段是我们想要的。

然后，你应该查询 user 表，找出所有 is_auto 为 true 的用户。

然后，你应该并发地给这些用户发起签到请求，请求方式如下：
```js
const response = await fetch(signUrl, {
  method: "PUT",
  headers: {
    "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) \
AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 \
Edg/141.0.0.0",
    "Content-Type": "application/json",
    "Cookie": cookieStr
  },
  body: JSON.stringify(body),
  credentials: "include"
});
```
其中 signUrl 值为 https://lms.tc.cqupt.edu.cn/api/rollcall/<rollcallId>/answer_qr_rollcall

cookieStr 从 cookie 表中拿出当前用户最新的一条 cookie

body 的结构如下：
{
  data: <data 从扫码结果解析得到的 data 字段>,
  deviceId: generateUUID()，随机生成即可
}




下面两个接口直接查询 signin_history 和 scan_history 表即可

## /history/signin?count=<count>&user_id=<id>：

按时间最近，列出所有签到历史，至多 count 条，如果包含id 则筛选指定 id

## /history/scan?count=<count>&user_id=<id>：

按时间最近，列出所有扫码历史，至多 count 条，如果包含id 则筛选指定 id
