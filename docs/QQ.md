# QQ 工具与附件

## 调用

需要使用者自己的 OneBot HTTP 服务及对应接口。仅依赖 QQ 框架提供的现有能力；账号权限、登录状态和服务版本影响结果。

```js
import { fetchForward, fetchGroupNotice, createQQTools } from "../src/qq/index.js";
const account = {
  httpUrl: "http://127.0.0.1:3001",
  accessToken: process.env.ONEBOT_ACCESS_TOKEN,
};
const page = await fetchForward(account, { id: "10003", offset: 0 });
const notices = await fetchGroupNotice(account, { groupId: "10001", offset: 0 });
const tools = createQQTools(account);
```

`10003`、`10001` 是示例占位符，运行时替换成自己的编号。

## 嵌套合并转发

`fetchForward` 优先展开已内联的节点，必要时按编号读取子转发；访问过的编号用于阻止重复获取和循环。结果每次返回最多 50 条，使用返回的 `next_offset` 继续。

每次调用会展开整个可读转发，再对输出分页，**并非后端惰性分页**。没有人为设置固定递归层数；超大或很深的输入仍受调用栈、内存和网络限制。失效编号和上游访问失败会返回错误结果。

## 群公告

`fetchGroupNotice` 使用 OneBot `get_cookies` 取得 QQ 群网页接口所需凭据，读取 `web.qun.qq.com` 公告；同时覆盖普通 `feeds` 与新成员 `inst` 公告。新成员公告带置顶标记，普通公告的接口不提供置顶状态。每页最多 10 条，返回后续偏移；单次调用最多下载 4 张图片，失败时保留可用信息。

Cookies 仅用于请求，不放入结果。该网页接口可能随 QQ 服务变化；某些 OneBot 实现不提供 `get_cookies`，会无法使用。头像和公告图片保存到 `ELLE_IMAGE_DIR`，未设置时保存到系统临时目录下的 `elle-components-images`。

## 六个工具

| 名称 | 功能 |
| --- | --- |
| `qq_poke` | 群或私聊戳一戳 |
| `qq_avatar` | 用户或群头像 |
| `qq_forward` | 嵌套合并转发读取 |
| `qq_notice` | 群公告读取 |
| `qq_member` | 成员资料；省略用户编号时查自己 |
| `qq_reaction` | 给消息添加 QQ 表情反应 |

`createQQTools` 返回 JSON Schema 参数定义及 `execute(callId, input)`。结果包含 `content` 文本与 `details` 数据。长消息/转发编号使用字符串，避免数值精度损失。

## 附件与消息格式

`src/qq/attachments.js` 导出：卡片标题/摘要/链接提取、Ark 卡片摘要、按钮语义摘要、成员身份标签、群聊 CQ @ 转换、反应事件摘要。卡片文字最多 160 字符，链接额外保留；反应摘录最多 30 字符。

按钮摘要区分跳转、回调和指令。指令按钮转成对应的文字操作提示；回调按钮仅描述，不自动执行。`parseAtMarkers` 只转换明确数字账号的 @；私聊不转换，也不支持 @全体。

`voice-text.js` 提供 `warmupPttText` 与 `transcribeVoiceWithRetry(account, messageId, logger, options)`。依赖服务的 `fetch_ptt_text`；默认最多 6 次尝试、间隔 1 秒，支持 Bearer token。模块不自带语音识别模型。
