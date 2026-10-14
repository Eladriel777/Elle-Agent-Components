// SPDX-License-Identifier: MIT
export default {
    name: 'fallback-notice',
    priority: 15,

    apply(text, context, config) {
        const trimmed = (text || '').trim();
        if (!trimmed) return { action: 'pass' };

        // Rule: OpenClaw model-fallback system notice. It appears when the runtime
        // switches to a backup model (or switches back), e.g.
        //   [U+21AA U+FE0F] Model Fallback: tokenrhythm/deepseek-flash (selected deepseek/deepseek-flash; timeout)
        //   [U+21AA U+FE0F] Model Fallback cleared: deepseek/deepseek-flash (was tokenrhythm/deepseek-flash)
        // Only match at the start of the text so ordinary chat mentioning the words is unaffected.
        if (/^\u21AA\uFE0F?\s*Model Fallback\b/i.test(trimmed)) {
            return { action: 'suppress', reason: 'model fallback notice' };
        }

        return { action: 'pass' };
    }
};
