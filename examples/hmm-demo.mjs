import { regulateThinkingReplay } from "../src/replay/hmm.js";

const reasoning = "Hmm. Hmm! Hmmm, Hmm? Hmm. Hmm. " + "保留的有效分析。".repeat(80);
const result = regulateThinkingReplay(reasoning);
console.log(JSON.stringify({ action: result.action, beforeOccurrences: result.occurrences, remainingOccurrences: (result.text.match(/\bh+m+\b/gi) || []).length, originalChars: reasoning.length, resultChars: result.text.length }, null, 2));
