# 记忆组件

在专用工作目录处理使用者自己的数据，脚本不含固定账号、群号、密钥或人格提示词。快照与汇总会保存聊天内容，使用者应将输出目录留在私有存储中。

## 增量快照

```sh
python3 memory/snapshot.py \
  --sessions-dir /path/to/private/sessions \
  --workspace /path/to/private/workspace \
  --group 10001 --group 10002
```

读取 OpenClaw `sessions.json` 与会话 JSONL，仅处理明确指定的群。保存每群会话编号和已读取记录游标；会话轮换时接续旧文件尾部，再读取新会话。首次运行仅保存最近 30 分钟消息；没有新消息不生成快照。

输出为 `workspace/memory/YYYY-MM-DD-HHMM.md`，状态为 `workspace/memory_system_state.json`。同一分钟的多批消息追加到同一快照，避免覆盖。快照提取文字、思考和简短工具结果，不保存完整附件。请串行调度快照，避免并发写状态；异常中断及手工重置游标仍可能造成重读。

## 日汇总

先只检查计划，不调用模型、不写汇总：

```sh
python3 memory/summary.py --memory-dir /path/to/private/workspace/memory --dry-run
```

实际汇总使用兼容 Chat Completions 的 API：

```sh
export ELLE_SUMMARY_API_KEY='填自己的密钥'
export ELLE_SUMMARY_BASE_URL='https://api.example.invalid/v1'
export ELLE_SUMMARY_MODEL='填自己的模型名'
python3 memory/summary.py --memory-dir /path/to/private/workspace/memory
```

API 地址需要包含服务要求的路径前缀，脚本在末尾追加 `/chat/completions`。实际运行会将所选快照发送给该服务，产生相应费用。默认提示词只整理有原文依据的事实，可用 `--system-prompt` 替换。

时区固定 GMT+8；一天的窗口是当天 03:15（含）到次日 03:15（不含），按快照文件时间归属。只处理完整窗口，对缺失日汇总逐日补齐。已有 `YYYY-MM-DD.md` 不覆盖；API 最多尝试 5 次，失败或空结果不标记完成。输出是模型生成内容，使用者仍需评估准确性。单次发送完整窗口，超出所用模型上下文时需要另行分批。

## 增量索引

```sh
export ELLE_MEMORY_INDEX_DIR='/path/to/private/index'
export ELLE_MEMORY_AGENT='qqgroup'
bash memory/index_memory.sh
```

需安装且配置好 OpenClaw CLI。脚本使用文件锁防止重叠索引，执行 `openclaw memory index --agent ...`，默认超时 600 秒，不加 `--force`；原样返回命令退出码。可用 `OPENCLAW_BIN` 指定命令路径。

`--prune-orphans` 是显式可选清理：只删除专用索引目录第一层、匹配该 agent 的 `.sqlite.tmp-*` 且超过一天的普通文件。普通运行不删除文件。目录必须已经存在，不能选择根目录或家目录。
