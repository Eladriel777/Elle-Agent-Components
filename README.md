# Elle 智能体组件集

**首要组件：Hmm 思考回放治理。** 当长段历史思考充满反复的 `Hmm / Hmmm`，组件按重复次数和密度识别，并清理下次模型请求中的回放副本，保留有效分析与原始存档。

本仓库公开从 Elle 提取、参数化整理的七类技术成品。它们围绕长时间运行的聊天智能体：治理历史思考污染、阻断伪造对话回放、控制输出、读取 QQ 复杂消息，以及持续整理记忆。项目设计与组件整理归属 Eladriel777；代码实现与验证使用 Codex 协作完成。包含的上游衍生代码单独标注来源。

## 1. Hmm 思考回放治理

长思考中的重复语气词可能随历史上下文继续被回放。这里提供可独立使用的治理函数：

| 默认规则 | 行为 |
| --- | --- |
| 思考少于 400 个字符 | 原样通过 |
| 思考至少 400 字符，匹配至少 6 次 | 清理匹配词 |
| 思考至少 400 字符，密度至少 3 次 / 1000 字符 | 清理匹配词 |
| 未达到以上条件 | 原样通过 |

匹配使用独立词边界、不区分大小写，覆盖 `Hmm`、`Hmmm` 等形式。清理同时整理残留空格与标点；**没有 1500 字符截断，也不删除整个思考块**。

```js
import { regulateThinkingReplay } from "./src/replay/hmm.js";

const archived = "Hmm. Hmm! Hmmm, Hmm? Hmm. Hmm. " + "保留有效分析。".repeat(100);
const replay = regulateThinkingReplay(archived);
console.log(replay.action, replay.occurrences, replay.text);
// archived 保持不变；replay.text 用于下一次请求。
```

这治理的是历史回放中的重复污染。它不拦截当前生成流，也不承诺消除模型产生重复思考的原因。参见 [Hmm 用法与边界](docs/HMM.md)。

## 2–7. 其余成品

| 组件 | 提供的能力 | 入口 |
| --- | --- | --- |
| 伪造对话回放防护 | 对消息正文、思考和工具结果使用不同清理策略；时间戳检测；返回副本 | [回放防护](docs/REPLAY.md) |
| 模块化输出过滤 | 五条规则、优先级、启停、替换/抑制、可选审计统计 | [输出过滤](docs/FILTERS.md) |
| 嵌套合并转发读取 | 递归展开、编号循环保护、每页返回 50 条与下一页偏移 | [QQ 组件](docs/QQ.md) |
| 完整群公告读取 | 普通公告、新成员公告、置顶标记、图片、每页 10 条 | [QQ 组件](docs/QQ.md) |
| 快照 / 日汇总 / 索引 | 增量游标、会话轮换尾部接续、跨凌晨汇总、索引互斥与退出码 | [记忆组件](docs/MEMORY.md) |
| QQ 工具与附件接入 | 六个工具、头像、语音转文字重试、卡片/按钮/身份/@/反应摘要 | [QQ 组件](docs/QQ.md) |

## 快速开始

JavaScript 使用 Node.js 20 或更新版本，无额外 npm 依赖。Python 脚本使用 Python 3.10 或更新版本；索引脚本使用 Linux / WSL 的 Bash、flock、timeout、realpath 和 OpenClaw CLI。

```sh
git clone https://github.com/Eladriel777/Elle-Agent-Components.git
cd Elle-Agent-Components
node examples/hmm-demo.mjs
node --test tests/*.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
```

测试使用虚构消息、临时目录和模拟接口，不连接真实 QQ，也不调用收费模型。OpenClaw 接入见 [适配说明](docs/OPENCLAW.md)；纯函数可以直接导入，不必安装 QQ 插件。`package.json` 的 `private: true` 仅防止意外发布到 npm。

## 公开范围与许可

仓库包含成品源码、合成示例、接口测试、配置模板和使用说明。部署者的账号、凭据、聊天记录、记忆文件以及项目研发记录不属于发布内容。环境变量示例在 [config/runtime.env.example](config/runtime.env.example)，需由使用者自行填写。

采用 [MIT 许可证](LICENSE)，允许使用、修改、分发和商业使用，分发时保留相关许可与版权声明。上游来源及衍生范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
