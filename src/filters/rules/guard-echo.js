// SPDX-License-Identifier: MIT
export default {
    name: 'guard-echo',
    priority: 10,

    apply(text, context, config) {
        const trimmed = (text || '').trim();
        if (!trimmed) return { action: 'pass' };

        // --- Rule 1: NO_REPLY leakage ---
        if (/NO_REPLY/i.test(trimmed) && trimmed.length >= 8) {
            return { action: 'suppress', reason: 'NO_REPLY leaked (len=' + trimmed.length + ')' };
        }

        // --- Rule 2: self-referential thinking leaked as text ---
        const selfTalk = [
            // Decision language
            /\bI (should|don't|shouldn't|must|need to|have to) (reply|respond|say|jump|engage|answer|chime|interject|get involved)\b/i,
            /\bI don't need to (reply|respond|say|jump|answer|get involved)\b/i,
            /\bI('ll| will) (stay|remain|just) (silent|quiet|out of this)\b/i,
            /\bI should (probably |just )?(ignore|skip|pass|stay out)\b/i,
            /\bI('m| am) not (being|getting) (addressed|called|mentioned|tagged)\b/i,
            // Conclusion language
            /\b(not|none of this|nothing here|nothing) (is )?(directed at|addressed to|meant for|talking to|about) me\b/i,
            /\bNone of this\b/,
            /\bno one (is|was) (talking|speaking) (to|about) me\b/i,
            // Analytical framing
            /\bLet me (analyze|look|check|see|consider|examine|review|assess) what\b/i,
            /\bLet me (think|figure) (about|out) what('s| is) (happening|going on)\b/i,
            /\bwhat('s| is) (happening|going on) here\b/i,
            // Dismissal language
            /\b(not|isn't) (my|a) conversation\b/i,
            /\bthis (is|seems|appears) (just |only )?(a )?(group chat|casual|general|random)\b/i,
            /\bthey('re| are) (just|only|simply) (chatting|talking|discussing)\b/i,
            /\bdoesn't (seem|appear|look) (like|to be) (directed|meant|aimed) (at|for)\b/i,
            // Catch-all: "these are all just normal..."
            /\b(these|those) (are|were) (all |)just (normal |random |)group (chat |)messages\b/i,
        ];
        const selfTalkCount = selfTalk.filter(p => p.test(trimmed)).length;

        if (selfTalkCount >= 2) {
            return { action: 'suppress', reason: 'self-talk leak (' + selfTalkCount + ' patterns)' };
        }
        if (selfTalkCount >= 1 && trimmed.length > 80) {
            return { action: 'suppress', reason: 'probable self-talk (len=' + trimmed.length + ')' };
        }

        // --- Rule 3: guard instruction echo (legacy) ---
        const guardPatterns = [
            /inbound message has no associated tool call/i,
            /not responding to a message directed at you/i,
            /group chat bot.*respond only/i,
            /respond only when addressed/i,
            /otherwise,?\s*respond appropriately/i,
        ];
        const guardCount = guardPatterns.filter(p => p.test(trimmed)).length;
        const minMatches = config?.minPatternMatches ?? 3;

        if (guardCount >= minMatches) {
            return { action: 'suppress', reason: 'guard echo (' + guardCount + ' patterns)' };
        }
        if (guardCount >= 1 && trimmed.length > 40) {
            return { action: 'suppress', reason: 'guard echo suspect (len=' + trimmed.length + ')' };
        }

        return { action: 'pass' };
    }
};