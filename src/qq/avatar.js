// SPDX-License-Identifier: MIT
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const AVATAR_TMP_DIR = process.env.ELLE_IMAGE_DIR || join(tmpdir(), "elle-components-images");

function normalizeId(value) {
    const cleaned = String(value ?? "").trim();
    return /^\d+$/.test(cleaned) ? cleaned : "";
}

function buildAvatarUrl(userId, groupId) {
    if (userId) {
        return `https://q1.qlogo.cn/g?b=qq&nk=${userId}&s=640`;
    }
    if (groupId) {
        return `https://p.qlogo.cn/gh/${groupId}/${groupId}/640`;
    }
    return "";
}

export async function fetchAvatar({ userId, groupId }) {
    const uid = normalizeId(userId);
    const gid = normalizeId(groupId);
    if (!uid && !gid) {
        return { ok: false, error: "missing user_id or group_id" };
    }
    const kind = uid ? "user" : "group";
    const id = uid || gid;
    const url = buildAvatarUrl(uid, gid);
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!resp.ok) {
            return { ok: true, kind, id, url, path: null, note: `download HTTP ${resp.status}; use the URL directly` };
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        const contentType = (resp.headers.get("content-type") || "").toLowerCase();
        if (buf.length <= 1024 || contentType.startsWith("text/")) {
            return { ok: true, kind, id, url, path: null, note: "download looked invalid; use the URL directly" };
        }
        await mkdir(AVATAR_TMP_DIR, { recursive: true });
        const ext = contentType.includes("png") ? "png" : "jpg";
        const localPath = `${AVATAR_TMP_DIR}/avatar_${Date.now()}_${id}.${ext}`;
        await writeFile(localPath, buf);
        return { ok: true, kind, id, url, path: localPath, bytes: buf.length };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: true, kind, id, url, path: null, note: `download failed (${message}); use the URL directly` };
    }
}