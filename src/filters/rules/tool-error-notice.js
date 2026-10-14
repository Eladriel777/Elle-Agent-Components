// SPDX-License-Identifier: MIT
export default {
    name: "tool-error-notice",
    priority: 5,

    apply(text, context, config) {
        const trimmed = (text || "").trim();
        if (!trimmed) return { action: "pass" };

        // Only suppress in group chats by default; keep visible in private for debugging
        const groupOnly = config?.groupOnly !== false;
        if (groupOnly && !context?.isGroup) return { action: "pass" };

        // Rule 1: framework tool-error notice, e.g. "\u26A0\uFE0F \u{1F9E9} Kimi-vision Kimi Vision failed"
        if (/^\u26A0\uFE0F\s*\u{1F9E9}\s+.{0,120}\bfailed\b/iu.test(trimmed)) {
            return { action: "suppress", reason: "framework tool-error notice" };
        }

        // Rule 2: other framework failure banners ending with "failed"
        if (/^\u26A0\uFE0F\s+[^\n]{0,80}\bfailed\s*$/iu.test(trimmed)) {
            return { action: "suppress", reason: "framework failure banner" };
        }

        return { action: "pass" };
    }
};
