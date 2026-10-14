# 回放防护

```js
import { prepareReplay } from "../src/replay/prepare.js";
const requestMessages = prepareReplay(archivedMessages);
```

支持 OpenAI 风格 `assistant.reasoning_content`，以及包含 `thinking` / `text` 块的 OpenClaw 消息。用户消息保留；处理后的消息和内容块使用副本。

| 位置 | 策略 |
| --- | --- |
| assistant 正文 | 从首个元数据标记、群/全局信封行或旧时间戳对话行处截断 |
| assistant 思考 | 先做 Hmm 治理；再截断行首的未来时间戳，或至少三段行首时间戳构成的回放 |
| tool / toolResult | 仅截断比该消息时间更晚的时间戳，可在行内出现 |

时间参考来自消息自身 `timestamp`，可为毫秒数或可解析日期字符串。检测格式为 `[Tue 2030-01-01 12:01 GMT+8]` 一类英文星期、分钟精度的信封。没有时间参考时，工具结果不做未来检测；思考仍可按连续信封数量触发。

正文规则针对聊天系统信封。技术文档若需要讨论 `Conversation info (untrusted metadata)` 等字面量，严格正文规则可能误删，可关闭：

```js
prepareReplay(messages, { cleanAssistantText: false });
```

也可单独调用 `stripTranscriptEcho`、`stripTranscriptEchoTimed(input, "think" | "tool", referenceMs)`。规则是启发式检测，不是通用提示注入防护或时间真实性证明。
