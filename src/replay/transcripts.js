// SPDX-License-Identifier: MIT
const TRANSCRIPT_FUTURE_MARGIN_MS = 0;

export function stripTranscriptEcho(input) {
	if (typeof input !== "string" || input.length === 0) return input;
	let cut = -1;
	const bump = (i) => {
		if (i !== -1 && (cut === -1 || i < cut)) cut = i;
	};
	bump(input.indexOf("Conversation info (untrusted metadata)"));
	bump(input.indexOf("Sender (untrusted metadata)"));
	const lineMarkers = [/(?:^|\n)[ \t]*\[(?:全局|群):[^\n]*/, /(?:^|\n)[ \t]*(?:user|assistant|system)\[[^\n\]]{0,120}GMT[+-]\d+\]/, /(?:^|\n)[ \t]*\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[^\n\]]{0,80}GMT[+-]\d+\]/];
	for (const rx of lineMarkers) {
		const m = rx.exec(input);
		if (m) bump(m.index);
	}
	if (cut === -1) return input;
	let kept = input.slice(0, cut);
	kept = kept.replace(/\n?[ \t]*\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[^\]\n]{0,60}GMT[+-]\d+\][ \t]*$/, "");
	return kept.replace(/\s+$/, "");
}

export function parseTranscriptTsMs(match) {
    const y = Number(match[1]);
    const mo = Number(match[2]);
    const d = Number(match[3]);
    const hh = Number(match[4]);
    const mi = Number(match[5]);
    const off = Number(match[6]);
    return Date.UTC(y, mo - 1, d, hh, mi) - off * 3600000;
}

export function isTranscriptLineStart(text, index) {
    let j = index - 1;
    while (j >= 0 && (text[j] === " " || text[j] === "\t")) j--;
    return j < 0 || text[j] === "\n";
}

export function resolveTurnStartMs(context, index, expectRole) {
    try {
        const raw = context && Array.isArray(context.messages) ? context.messages[index] : void 0;
        if (!raw) return null;
        if (expectRole && raw.role !== expectRole) return null;
        const t = raw.timestamp;
        if (typeof t === "number" && Number.isFinite(t) && t > 1e12) return t;
        if (typeof t === "string") {
            const v = Date.parse(t);
            if (Number.isFinite(v)) return v;
        }
    } catch (e) {}
    return null;
}

export function stripTranscriptEchoTimed(input, mode, refMs) {
    if (typeof input !== "string" || input.length === 0) return input;
    const tsRe = /\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s+GMT([+-]\d+)\]/g;
    const hits = [];
    let m;
    while ((m = tsRe.exec(input)) !== null) hits.push({
        index: m.index,
        ms: parseTranscriptTsMs(m),
        anchored: isTranscriptLineStart(input, m.index)
    });
    if (hits.length === 0) return input;
    let cut = -1;
    if (typeof refMs === "number" && Number.isFinite(refMs)) {
        const future = hits.find((h) => (mode === "tool" || h.anchored) && h.ms > refMs + TRANSCRIPT_FUTURE_MARGIN_MS);
        if (future) cut = future.index;
    }
    if (cut === -1 && mode === "think") {
        const anchored = hits.filter((h) => h.anchored);
        if (anchored.length >= 3) cut = anchored[0].index;
    }
    if (cut === -1) return input;
    let kept = input.slice(0, cut);
    kept = kept.replace(/\n?[ \t]*\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[^\]\n]{0,60}GMT[+-]\d+\][ \t]*$/, "");
    return kept.replace(/\s+$/, "");
}
