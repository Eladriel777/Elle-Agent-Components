// SPDX-License-Identifier: MIT
const VOICE_TEXT_RETRIES = 6;
const VOICE_TEXT_INTERVAL_MS = 1000;

export async function callFetchPttText(httpUrl, messageId) {
    const account = typeof httpUrl === "string" ? { httpUrl } : httpUrl;
    const endpoint = account?.httpUrl;
    if (!endpoint)
        return { ok: false, error: "no httpUrl" };
    const resp = await fetch(`${endpoint}/fetch_ptt_text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(account.accessToken ? { Authorization: `Bearer ${account.accessToken}` } : {}) },
        body: JSON.stringify({ message_id: messageId }),
        signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => null);
    if (data && data.status === "ok" && data.data && typeof data.data.text === "string" && data.data.text) {
        return { ok: true, text: data.data.text };
    }
    return { ok: false, error: (data && (data.message || data.wording)) || `HTTP ${resp.status}` };
}

export function warmupPttText(httpUrl, messageId, log) {
    if (!httpUrl || messageId == null)
        return;
    callFetchPttText(httpUrl, messageId)
        .then((r) => log?.info?.(`[voice-text] warmup msg=${messageId}: ${r.ok ? "ready" : "pending (" + r.error + ")"}`))
        .catch((e) => log?.warn?.(`[voice-text] warmup error msg=${messageId}: ${e.message}`));
}

export async function transcribeVoiceWithRetry(httpUrl, messageId, log, opts = {}) {
    const retries = opts.retries ?? VOICE_TEXT_RETRIES;
    const intervalMs = opts.intervalMs ?? VOICE_TEXT_INTERVAL_MS;
    let lastError = "unknown";
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const r = await callFetchPttText(httpUrl, messageId);
            if (r.ok) {
                log?.info?.(`[voice-text] msg=${messageId}: transcription ready (attempt ${attempt})`);
                return r;
            }
            lastError = r.error;
        }
        catch (e) {
            lastError = e.message;
        }
        if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
    }
    log?.warn?.(`[voice-text] msg=${messageId}: transcription failed after ${retries} attempts: ${lastError}`);
    return { ok: false, error: lastError };
}
