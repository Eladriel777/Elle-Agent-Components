# OpenClaw 适配

独立函数不依赖 OpenClaw。这里另提供工具注册入口和兼容函数形状的回放挂钩；二者分别接入，不会自动连接或改动运行中的服务。

## QQ 工具注册

`adapters/openclaw/plugin.js` 导出 `register(api)`，从 `api.pluginConfig` 读取 `httpUrl` / `accessToken`，通过 `api.registerTool` 注册六个工具。环境变量 `ONEBOT_ACCESS_TOKEN` 优先于配置值。

将本仓库作为本地插件交给你自己的 OpenClaw 插件加载流程，再合并 [配置片段](../config/openclaw.example.json)。片段包含示例 agent `qqgroup` 的工具允许列表，不是完整网关配置；请按现有配置合并。`openclaw.plugin.json` 和 `package.json` 声明入口。

适配源来自 OpenClaw 2026.6.6 / openclaw-onebot 1.2.15 环境。当前验证覆盖模拟工具注册及接口调用，未对所有 OpenClaw 版本做安装、端到端登录或网关运行验证。六工具不包含完整 QQ 通道，已有 OneBot 通道仍需由使用者配置。

## 历史回放挂钩

推荐在自己可维护的 provider 请求组装处直接调用 `prepareReplay`。提供的 Python 工具只支持以下明确函数签名的 JavaScript 模块：

```js
function convertMessages(model, context, compat, options = {}) {
```

默认只检查，必须显式给出目标文件：

```sh
python3 adapters/openclaw/replay_hook.py --target /path/to/provider.mjs
```

检查返回码：0 已安装；2 尚未安装；1 不支持或配置冲突。显式安装：

```sh
python3 adapters/openclaw/replay_hook.py --target /path/to/provider.mjs --apply
```

安装前创建备份；插入指向当前仓库的绝对 file URI 导入，以及基于副本的回放处理；执行 `node --check`。语法失败或 Node 不可用时恢复备份。重复安装保持不变；签名不匹配不会写入。不重启服务，不搜索或批量修改其他 provider。

挂钩依赖仓库位置稳定：移动目录或升级 provider 后需重新检查。只用于明文思考回放，带签名或加密载荷的思考协议应自行适配。合成 provider 测试验证检查、备份、重复安装及运行调用，不能据此承诺任意版本的 OpenClaw 兼容。
