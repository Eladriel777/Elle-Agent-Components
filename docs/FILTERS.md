# 输出过滤

```js
import { createFilterPipeline } from "../src/filters/index.js";
const filter = createFilterPipeline();
const delivered = await filter(candidateText, { channel: "qq" });
if (delivered !== null) await send(delivered);
```

默认五条规则处理防护决策回显、伪造对话续写、模型回退通知、运行状态回显和工具错误通知。`pass` 继续，`replace` 更新文本，`suppress` 返回 `null`，由调用方跳过发送。

规则按 `priority` 从小到大执行，`0` 是有效优先级。每条规则导出 `{name, priority, apply(text, context, options)}`。自定义参考 [模板](../src/filters/rules/template.js)，或使用 `loadFilterPipeline(directory, options)` 加载可信规则目录。

```js
const filter = createFilterPipeline({
  config: { enabled: true, filters: { "guard-echo": { enabled: true } } },
  failClosed: false,
  onEvent: event => console.log(event.filter, event.action),
});
```

默认规则报错时继续发送当前文本；`failClosed: true` 则抑制。默认不写日志、不记录消息预览。显式设置 `logFile` 可写 JSONL 审计，`getFilterStats(logFile)` 汇总实际动作。`includePreview: true` 会记录前 100 字符，应由部署者决定是否适合自己的数据。

过滤结果依赖规则匹配，不能保证所有内部文本均被识别。普通技术讨论也可能碰到模式，部署前用自己的正常消息样本检查。
