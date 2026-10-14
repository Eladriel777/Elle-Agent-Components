// SPDX-License-Identifier: MIT
export default {
    name: "openclaw-status-echo",
    priority: 20,

    apply(text, context, config) {
        const trimmed = (text || "").trim();
        if (!trimmed) return { action: "pass" };

        // Rule: gateway status banner "[OpenClaw] Request received, processing..."
        // suppress whether it comes from a timeout notice or the model echoing it
        if (/request received\b[^\n]{0,40}processing/i.test(trimmed)) {
            return { action: "suppress", reason: "openclaw status banner" };
        }

        return { action: "pass" };
    }
};
