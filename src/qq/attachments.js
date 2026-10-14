// SPDX-License-Identifier: MIT
import { REACTION_EMOJI_NAMES } from "./emoji-names.js";
const CLICK_BUTTON_ENABLED = false;

export function decodeHtmlEntitiesLite(input) {
    return String(input ?? "")
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
            const code = parseInt(hex, 16);
            return Number.isFinite(code) && code > 0 && code <= 1114111 ? String.fromCodePoint(code) : match;
        })
        .replace(/&#(\d+);/g, (match, dec) => {
            const code = parseInt(dec, 10);
            return Number.isFinite(code) && code > 0 && code <= 1114111 ? String.fromCodePoint(code) : match;
        })
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

export function extractCardLink(obj) {
    if (!obj || typeof obj !== "object") return "";
    const meta = obj.meta && typeof obj.meta === "object" ? obj.meta : {};
    const detail = [meta.detail_1, meta.detail_0, meta.detail_2].find((d) => d && typeof d === "object") || {};
    const candidates = [obj.qqdocurl, obj.jumpUrl, obj.url, meta.qqdocurl, meta.jumpUrl, meta.url, detail.qqdocurl, detail.jumpUrl, detail.url];
    for (const cand of candidates) {
        const s = String(cand ?? "").replace(/\s+/g, " ").trim();
        if (/^https?:\/\/\S+$/i.test(s)) return s;
    }
    return "";
}

export function summarizeCardFields(obj) {
    if (!obj || typeof obj !== "object") return "";
    const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
    const parts = [];
    const add = (v) => {
        const s = norm(v);
        if (s.length < 2) return;
        if (parts.some((p) => p.includes(s) || s.includes(p))) return;
        parts.push(s);
    };
    add(obj.prompt);
    const meta = obj.meta && typeof obj.meta === "object" ? obj.meta : {};
    add(meta.title);
    add(meta.summary);
    add(meta.desc);
    add(meta.tag);
    const detail = [meta.detail_1, meta.detail_0, meta.detail_2].find((d) => d && typeof d === "object");
    if (detail) {
        add(detail.title);
        add(detail.desc);
        add(detail.tag);
    }
    add(meta.button);
    const summary = parts.join(" / ").slice(0, 160);
    const link = extractCardLink(obj);
    if (link && !summary.includes(link)) return summary ? `${summary} / ${link}` : link;
    return summary;
}

export function summarizeKeyboardButtons(raw) {
    const elements = Array.isArray(raw?.elements) ? raw.elements : [];
    const kb = elements.map((el) => el?.inlineKeyboardElement).find(Boolean);
    if (!kb) return "";
    const buttons = (Array.isArray(kb.rows) ? kb.rows : [])
        .flatMap((row) => (Array.isArray(row?.buttons) ? row.buttons : []))
        .filter((b) => b && (b.label || b.data));
    if (!buttons.length) return "";
    const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
    const botUin = String(raw?.senderUin || "");
    const groupId = String(raw?.peerUin || "");
    const msgSeq = String(raw?.msgSeq || "");
    const botAppid = norm(kb.botAppid);
    const jump = [];
    const callbacks = [];
    const commands = [];
    const other = [];
    for (const b of buttons) {
        const label = norm(b.label) || norm(b.data);
        const data = norm(b.data);
        const id = norm(b.id);
        const type = Number(b.type);
        if (type === 0) jump.push({ label, data });
        else if (type === 1) callbacks.push({ label, data, id });
        else if (type === 2) commands.push({ label, data });
        else other.push({ label, data, type: Number.isFinite(type) ? type : "?" });
    }
    const lines = [];
    if (commands.length) {
        const list = commands.map((c) => (c.data && c.data !== c.label ? `${c.label}→"${c.data}"` : c.label)).join("｜");
        lines.push(`- 按钮[指令] ${list}`);
        lines.push(`  （想点哪个=在群里发 [CQ:at,qq=${botUin}] 加对应文字：有箭头的用箭头后的文字，没箭头的用按钮原文）`);
    }
    for (const b of jump) lines.push(`- 按钮[跳转] 「${b.label}」→ ${b.data}`);
    for (const b of callbacks) {
        lines.push(CLICK_BUTTON_ENABLED
            ? `- 按钮[回调] 「${b.label}」→ qq_click_button(group_id=${groupId}, bot_appid=${botAppid}, button_id=${b.id}, msg_seq=${msgSeq}, callback_data="${b.data}")`
            : `- 按钮[回调] 「${b.label}」（回调按钮，暂时点不了）`);
    }
    for (const b of other) lines.push(`- 按钮[类型${b.type}] 「${b.label}」${b.data && b.data !== b.label ? ` → "${b.data}"` : ""}`);
    return lines.length ? "\n" + lines.join("\n") : "";
}

export function summarizeArkCard(raw) {
    const elements = Array.isArray(raw?.elements) ? raw.elements : [];
    for (const el of elements) {
        const bytes = el?.arkElement?.bytesData;
        if (typeof bytes !== "string" || !bytes) continue;
        let obj;
        try { obj = JSON.parse(bytes); } catch { continue; }
        const text = summarizeCardFields(obj);
        if (text) return `\n[卡片] ${text}`;
    }
    return "";
}

export function formatMemberTags(member = {}) {
  const tags = [];
  if (member.role === 'owner') tags.push('群主');
  else if (member.role === 'admin') tags.push('管理员');
  if (member.is_robot === true) tags.push('官方机器人');
  if (member.title) tags.push('专属头衔: ' + String(member.title));
  return tags.length ? ' | ' + tags.join(' | ') : '';
}

export function parseAtMarkers(text, { isGroup = true } = {}) {
  if (!isGroup) return [{ type: 'text', data: { text } }];
  const regex = /[\[【]\s*CQ[：:]\s*at\s*[,，]\s*qq\s*[=＝]\s*(\d+)\s*(?:[,，][^\]】]*)?[\]】]/gi;
  const out = []; let offset = 0; let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > offset) out.push({ type: 'text', data: { text: text.slice(offset, match.index) } });
    out.push({ type: 'at', data: { qq: match[1] } });
    offset = match.index + match[0].length;
  }
  if (offset < text.length || !out.length) out.push({ type: 'text', data: { text: text.slice(offset) } });
  return out;
}

export function summarizeReaction({ actorName, targetName, messageText = '', emojiId, isAdd = true, isOwnActor = false, targetIsSelf = false }) {
  if (!isAdd || isOwnActor) return null;
  const id = String(emojiId);
  const name = REACTION_EMOJI_NAMES[id] || '表情' + id;
  const excerpt = messageText.length > 30 ? messageText.slice(0, 30) + '…' : messageText;
  const target = targetIsSelf ? '你的消息' : (targetName || '一条消息');
  return `[${actorName || '有人'} 给 ${target}「${excerpt}」贴了「${name}」(${id})]`;
}
