// SPDX-License-Identifier: MIT
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const PAGE_SIZE = 10;
const MAX_IMAGES = 4;
const IMAGE_DIR = process.env.ELLE_IMAGE_DIR || join(tmpdir(), "elle-components-images");
const IMAGE_CDN = "https://gdynamic.qpic.cn/gdynamic";
const QQ_UA = "Mozilla/5.0 QQ/9.9";

function formatTime(unixSeconds) {
    const ms = Number(unixSeconds) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) {
        return "未知时间";
    }
    try {
        return new Intl.DateTimeFormat("zh-CN", {
            timeZone: "Asia/Shanghai",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(new Date(ms));
    } catch {
        return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
    }
}

function unescapeText(text) {
    return String(text ?? "")
        .replace(/&#x([0-9a-fA-F]{1,6});/g, (match, hex) => {
            const code = parseInt(hex, 16);
            return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
        })
        .replace(/&#(\d{1,7});/g, (match, dec) => {
            const code = parseInt(dec, 10);
            return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
        })
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ");
}

function toArray(value) {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.filter(Boolean);
    }
    if (typeof value === "object") {
        return Object.values(value).filter(Boolean);
    }
    return [];
}

function pickName(ui, uid) {
    const entry = ui && typeof ui === "object" ? (ui[uid] ?? ui[String(uid)]) : undefined;
    if (!entry) {
        return String(uid ?? "?");
    }
    if (typeof entry === "string") {
        return entry;
    }
    return entry.n ?? entry.name ?? entry.nick ?? entry.nickname ?? entry.card ?? String(uid ?? "?");
}

function calcBkn(skey) {
    let hash = 5381;
    for (let i = 0; i < skey.length; i += 1) {
        hash = hash + (hash << 5) + skey.charCodeAt(i);
    }
    return (hash & 0x7fffffff).toString();
}

function skeyFromCookies(cookies) {
    const match = /(?:^|;\s*)skey=([^;]+)/.exec(String(cookies ?? ""));
    return match ? match[1] : "";
}

async function napcatPost(account, action, payload, timeoutMs = 20000) {
    const headers = { "Content-Type": "application/json" };
    if (account?.accessToken) {
        headers.Authorization = `Bearer ${account.accessToken}`;
    }
    const resp = await fetch(`${account.httpUrl}/${action}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
        throw new Error(`NapCat ${action} 返回 HTTP ${resp.status}`);
    }
    const data = await resp.json();
    if (data.retcode !== 0 || data.status === "failed") {
        const reason = data.message || data.wording || "";
        throw new Error(reason || `NapCat ${action} 调用失败`);
    }
    return data.data ?? {};
}

async function downloadImage(id, stamp, seq) {
    for (const suffix of ["0", "628"]) {
        const url = `${IMAGE_CDN}/${encodeURIComponent(id)}/${suffix}`;
        try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (!resp.ok) {
                continue;
            }
            const buf = Buffer.from(await resp.arrayBuffer());
            const contentType = (resp.headers.get("content-type") || "").toLowerCase();
            if (buf.length <= 1024 || contentType.startsWith("text/")) {
                continue;
            }
            await mkdir(IMAGE_DIR, { recursive: true });
            const ext = contentType.includes("png") ? "png" : (contentType.includes("gif") ? "gif" : "jpg");
            const localPath = `${IMAGE_DIR}/notice_${stamp}_${seq}.${ext}`;
            await writeFile(localPath, buf);
            return { id, url, path: localPath, bytes: buf.length };
        } catch {
            // 换下一个候选地址重试
        }
    }
    return { id, url: `${IMAGE_CDN}/${encodeURIComponent(id)}/0`, path: null };
}

async function collectImages(pics, stamp, budget) {
    const list = Array.isArray(pics) ? pics : [];
    const out = [];
    for (const pic of list) {
        const id = String(pic?.id ?? "").trim();
        if (!id) {
            continue;
        }
        if (budget.left <= 0) {
            out.push({ id, url: `${IMAGE_CDN}/${encodeURIComponent(id)}/0`, path: null, note: "超过单次下载上限，未下载" });
            continue;
        }
        budget.left -= 1;
        budget.seq += 1;
        out.push(await downloadImage(id, stamp, budget.seq));
    }
    return out;
}

export async function fetchGroupNotice(account, { groupId, offset }) {
    const gid = String(groupId ?? "").trim();
    if (!/^\d+$/.test(gid)) {
        return { ok: false, error: "group_id 不是有效的群号（应是纯数字）" };
    }
    let start = Number(offset ?? 0);
    if (!Number.isFinite(start) || start < 0) {
        start = 0;
    }
    start = Math.floor(start);
    const sParam = start > 0 ? String(start) : "-1";

    let cookies = "";
    let bkn = "";
    try {
        const cred = await napcatPost(account, "get_cookies", { domain: "qun.qq.com" });
        cookies = String(cred.cookies ?? "");
        bkn = String(cred.bkn ?? "");
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `拿不到 QQ 登录态（${message}）` };
    }
    if (!bkn) {
        const skey = skeyFromCookies(cookies);
        bkn = skey ? calcBkn(skey) : "";
    }
    if (!cookies || !bkn) {
        return { ok: false, error: "拿不到 QQ 登录态（NapCat 未登录或返回为空）" };
    }

    const params = new URLSearchParams({
        bkn,
        qid: gid,
        ft: "23",
        ni: "1",
        n: String(PAGE_SIZE),
        i: "1",
        log_read: "1",
        platform: "1",
        s: sParam,
    });
    const url = `https://web.qun.qq.com/cgi-bin/announce/get_t_list?${params.toString()}`;

    let data = null;
    try {
        const resp = await fetch(url, {
            headers: {
                Cookie: cookies,
                "User-Agent": QQ_UA,
                Referer: "https://web.qun.qq.com/",
            },
            signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) {
            return { ok: false, error: `查询群公告失败（HTTP ${resp.status}）` };
        }
        data = await resp.json();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `查询群公告失败（${message}）` };
    }
    if (!data || data.ec !== 0) {
        const em = data?.em ? ` ${data.em}` : "";
        return { ok: false, error: `查询群公告失败（ec=${data?.ec ?? "未知"}${em}）` };
    }

    const stamp = Date.now();
    const imageBudget = { left: MAX_IMAGES, seq: 0 };
    const ui = data.ui;

    const instList = toArray(data.inst);
    const feedList = toArray(data.feeds);

    let memberNotice = null;
    if (instList.length > 0) {
        const inst = instList[0];
        memberNotice = {
            text: unescapeText(inst?.msg?.text ?? ""),
            pinned: (inst?.settings?.inst_no_pinned ?? null) === 0,
            time: formatTime(inst?.pubt),
            images: await collectImages(inst?.msg?.pics, stamp, imageBudget),
        };
    }

    const notices = [];
    for (let i = 0; i < feedList.length; i += 1) {
        const feed = feedList[i];
        notices.push({
            index: start + i + 1,
            time: formatTime(feed?.pubt),
            sender: pickName(ui, feed?.u),
            text: unescapeText(feed?.msg?.text ?? ""),
            read_num: feed?.read_num ?? null,
            images: await collectImages(feed?.msg?.pics, stamp, imageBudget),
        });
    }

    const hasMore = feedList.length >= PAGE_SIZE;
    return {
        ok: true,
        group_id: gid,
        new_member_notice: memberNotice,
        notices,
        page: {
            offset: start,
            has_more: hasMore,
            next_offset: hasMore ? start + feedList.length : null,
        },
        notes: "普通公告的置顶状态接口不提供；只有【发给新成员】公告带 pinned（true=置顶中）。",
    };
}