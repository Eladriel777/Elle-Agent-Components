// SPDX-License-Identifier: MIT
const FORWARD_PAGE_SIZE = 50;

function formatTime(unixSeconds) {
    const ms = Number(unixSeconds) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) {
        return "??-?? ??:??";
    }
    try {
        return new Intl.DateTimeFormat("zh-CN", {
            timeZone: "Asia/Shanghai",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(new Date(ms));
    } catch {
        return new Date(ms).toISOString().slice(5, 16).replace("T", " ");
    }
}

function segmentToText(segment) {
    const data = segment?.data ?? {};
    switch (segment?.type) {
        case "text":
            return data.text ?? "";
        case "image":
            return data.url ? `[图片] ${data.url}` : "[图片]";
        case "face":
            return "[表情]";
        case "at":
            return `@${data.qq ?? ""}`;
        case "reply":
            return `[回复 ${data.id ?? ""}]`;
        case "record":
            return "[语音]";
        case "video":
            return "[视频]";
        case "file":
            return `[文件 ${data.name ?? ""}]`;
        case "json":
        case "xml":
            return "[卡片消息]";
        case "forward":
            return "[嵌套合并转发]";
        default:
            return `[${segment?.type ?? "未知类型"}]`;
    }
}

async function fetchRawMessages(account, forwardId) {
    const headers = { "Content-Type": "application/json" };
    if (account?.accessToken) {
        headers.Authorization = `Bearer ${account.accessToken}`;
    }
    try {
        const resp = await fetch(`${account.httpUrl}/get_forward_msg`, {
            method: "POST",
            headers,
            body: JSON.stringify({ message_id: forwardId }),
            signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) {
            return null;
        }
        const data = await resp.json();
        if (data.retcode !== 0 || data.status === "failed") {
            return null;
        }
        const messages = data.data?.messages;
        return Array.isArray(messages) ? messages : null;
    } catch {
        return null;
    }
}

function indentFor(level) {
    return level <= 0 ? "" : "　".repeat(level * 2) + "↪ ";
}

async function renderMessages(account, messages, level, visited) {
    const out = [];
    for (const message of messages ?? []) {
        const sender = message?.sender ?? {};
        const name = sender.nickname || sender.card || String(message?.user_id ?? "?");
        const userId = message?.user_id ?? sender.user_id ?? "?";
        const time = formatTime(message?.time);
        let content = "";
        const nestedBlocks = [];
        if (Array.isArray(message?.message) && message.message.length > 0) {
            for (const segment of message.message) {
                if (segment?.type === "forward") {
                    const data = segment?.data ?? {};
                    const innerId = data.id != null ? String(data.id).trim() : "";
                    let innerContent = Array.isArray(data.content) ? data.content : null;
                    if (!innerContent && innerId && !visited.has(innerId)) {
                        visited.add(innerId);
                        innerContent = await fetchRawMessages(account, innerId);
                    }
                    if (Array.isArray(innerContent) && innerContent.length > 0) {
                        content += "[嵌套合并转发 ↓]";
                        nestedBlocks.push(innerContent);
                    } else {
                        content += "[嵌套合并转发]";
                    }
                    continue;
                }
                content += segmentToText(segment);
            }
        }
        if (!content) {
            content = String(message?.raw_message ?? "").trim();
        }
        out.push(`${indentFor(level)}[${time}] ${name}(${userId}): ${content}`);
        for (const block of nestedBlocks) {
            out.push(...await renderMessages(account, block, level + 1, visited));
        }
    }
    return out;
}

export async function fetchForward(account, { id, offset } = {}) {
    const forwardId = String(id ?? "").trim();
    if (!/^\d+$/.test(forwardId)) {
        return { ok: false, error: "id 不是有效的合并转发 id（应从 [CQ:forward,id=数字] 中抄）" };
    }
    const off = Math.max(0, Number.parseInt(String(offset ?? 0), 10) || 0);
    const messages = await fetchRawMessages(account, forwardId);
    if (!messages) {
        return { ok: false, error: "无法获取这条合并转发的内容（id 无效、已过期或 NapCat 未响应）" };
    }
    const visited = new Set([forwardId]);
    const lines = await renderMessages(account, messages, 0, visited);
    const total = lines.length;
    const page = lines.slice(off, off + FORWARD_PAGE_SIZE);
    const next = off + page.length;
    const result = {
        ok: true,
        id: forwardId,
        total,
        offset: off,
        shown: page.length,
        messages: page,
    };
    if (page.length > 0 && next < total) {
        result.next_offset = next;
    }
    return result;
}
