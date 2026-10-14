// SPDX-License-Identifier: MIT

const REACTION_API_TIMEOUT_MS = 10000;

function normalizeId(value) {
    const cleaned = String(value ?? "").trim();
    return /^\d+$/.test(cleaned) ? cleaned : "";
}

export async function sendReaction(account, { messageId, emojiId }) {
    const mid = normalizeId(messageId);
    if (!mid) {
        return { ok: false, error: "missing message_id" };
    }
    const eid = String(emojiId ?? "").trim();
    if (!/^\d+$/.test(eid)) {
        return { ok: false, error: "missing emoji_id" };
    }
    try {
        const headers = { "Content-Type": "application/json" };
        if (account.accessToken) {
            headers.Authorization = `Bearer ${account.accessToken}`;
        }
        const resp = await fetch(`${account.httpUrl}/set_msg_emoji_like`, {
            method: "POST",
            headers,
            body: JSON.stringify({ message_id: Number(mid), emoji_id: eid, set: true }),
            signal: AbortSignal.timeout(REACTION_API_TIMEOUT_MS),
        });
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        const result = await resp.json();
        if (result.retcode !== 0 || result.status === "failed") {
            throw new Error(`set_msg_emoji_like failed: ${result.retcode} ${result.message ?? result.wording ?? ""}`.trim());
        }
        return { ok: true, message_id: Number(mid), emoji_id: eid };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
    }
}
