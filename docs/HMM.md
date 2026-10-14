# Hmm 思考回放治理

## 接入位置

将原始会话存档与模型请求上下文分开：读取原始消息 → 创建回放副本 → 清理历史思考 → 构造下一次请求。函数不会回写原始字符串或消息数组。

```js
import { inspectHmmReplay, regulateThinkingReplay, regulateThinkingBlocks }
  from "../src/replay/hmm.js";

const diagnosis = inspectHmmReplay(historyThinking);
const cleaned = regulateThinkingReplay(historyThinking);
const blocks = regulateThinkingBlocks(historyContentBlocks);
```

`inspectHmmReplay` 返回 `chars`、`occurrences`、`densityPer1000`、`shortExempt`、`shouldClean`。`regulateThinkingReplay` 额外返回 `text`、`changed`、`action`（`pass` 或 `clean`）。`regulateThinkingBlocks` 复制带 `thinking` 字符串的块，保留其他字段。

## 参数

```js
const result = regulateThinkingReplay(text, {
  minChars: 400,
  minOccurrences: 6,
  minDensityPer1000: 3,
});
```

数值必须有限且非负。默认先判断短块豁免，再判断“次数或密度”。字符长度采用 JavaScript 字符串长度（UTF-16 代码单元），不是 token 数。正则为 `/\bh+m+\b/gi`，不是语义模型；合法引用中的独立 `Hmm` 也会计数。

触发后移除匹配词及紧邻的一个英文标点和横向空白；压缩连续空格、过多空行并清理行末空白。不会按长度截断剩余正文。短段即便高度重复仍原样保留。

## 适用边界

适合将历史明文 `reasoning_content` / `thinking` 再次送入模型的系统。不要用于需要原样保真的正文、代码、原始证据或带加密签名/加密载荷的思考协议。保留一个 `signature` 字段不代表修改后的内容仍满足签名校验。

它减少重复词进入下一轮上下文，不限制当轮生成量，不处理所有重复模式，也不提供模型效果提升的量化结论。测试验证阈值、正文保留和输入不变性，不能替代使用者针对自己模型的效果评估。
