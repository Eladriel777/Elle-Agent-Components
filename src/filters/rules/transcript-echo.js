// SPDX-License-Identifier: MIT

const TRANSCRIPT_LINE_START = /^[ \t]*(?:user|assistant|system)\[[^\n\]]{0,120}GMT[+-]\d+\]/m;
const TRANSCRIPT_INLINE = /(?:user|assistant|system)\[[^\n\]]{0,120}GMT[+-]\d+\]\s+\[(?:群|全局|引用回复):/;
const METADATA_ECHO = /(?:^|\n)[ \t]*(?:\[[A-Z][a-z]{2}[^\n\]]{0,60}GMT[+-]\d+\][ \t]*)?(?:Conversation info|Sender) \(untrusted metadata\):/;
const ENVELOPE_LINE = /(?:^|\n)[ \t]*\[(?:全局|群):/;
const TIMESTAMP_LINE = /(?:^|\n)[ \t]*\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[^\n\]]{0,80}GMT[+-]\d+\]/;

export default {
    name: 'transcript-echo',
    priority: 12,

    apply(text, context, config) {
        if (typeof text !== 'string' || !text.trim()) return { action: 'pass' };

        let match = text.match(TRANSCRIPT_LINE_START);
        let reason = 'transcript marker at line start';
        if (!match) {
            match = text.match(TRANSCRIPT_INLINE);
            reason = 'transcript marker inline with message block';
        }
        if (!match) {
            match = text.match(METADATA_ECHO);
            reason = 'fabricated metadata envelope';
        }
        if (!match) {
            match = text.match(ENVELOPE_LINE);
            reason = 'fabricated inbound header line';
        }
        if (!match) {
            match = text.match(TIMESTAMP_LINE);
            reason = 'fabricated timestamp envelope line';
        }
        if (!match) return { action: 'pass' };

        const mode = (config && config.mode === 'suppress') ? 'suppress' : 'truncate';

        if (mode === 'suppress') {
            return { action: 'suppress', reason: reason + ' (suppress mode)' };
        }

        const kept = text.slice(0, match.index).replace(/\s+$/, '');
        if (!kept) {
            return { action: 'suppress', reason: reason + ' (nothing before marker)' };
        }
        return { action: 'replace', reason: reason, text: kept };
    }
};