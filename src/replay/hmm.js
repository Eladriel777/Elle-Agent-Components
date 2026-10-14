// SPDX-License-Identifier: MIT
// Apply only to historical reasoning being replayed, never to the raw archive.
export const DEFAULT_HMM_OPTIONS = Object.freeze({
  minChars: 400,
  minOccurrences: 6,
  minDensityPer1000: 3,
});

function settings(options) {
  const value = { ...DEFAULT_HMM_OPTIONS, ...options };
  for (const key of Object.keys(DEFAULT_HMM_OPTIONS)) {
    if (!Number.isFinite(value[key]) || value[key] < 0) {
      throw new RangeError(`${key} must be a non-negative finite number`);
    }
  }
  return value;
}

export function inspectHmmReplay(text, options = {}) {
  if (typeof text !== "string") throw new TypeError("reasoning must be a string");
  const config = settings(options);
  const occurrences = (text.match(/\bh+m+\b/gi) || []).length;
  const densityPer1000 = text.length ? occurrences * 1000 / text.length : 0;
  const shortExempt = text.length < config.minChars;
  return {
    chars: text.length,
    occurrences,
    densityPer1000,
    shortExempt,
    shouldClean: !shortExempt &&
      (occurrences >= config.minOccurrences || densityPer1000 >= config.minDensityPer1000),
  };
}

export function stripHmmTokens(text) {
  if (typeof text !== "string") throw new TypeError("reasoning must be a string");
  return text
    .replace(/\bh+m+\b[.,!?]?[ \t]*/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[.,!?]+[ \t]*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "");
}

export function regulateThinkingReplay(text, options = {}) {
  const assessment = inspectHmmReplay(text, options);
  const output = assessment.shouldClean ? stripHmmTokens(text) : text;
  return { ...assessment, text: output, changed: output !== text, action: assessment.shouldClean ? "clean" : "pass" };
}

export function regulateThinkingBlocks(blocks, options = {}) {
  if (!Array.isArray(blocks)) throw new TypeError("blocks must be an array");
  return blocks.map(block => {
    if (!block || typeof block.thinking !== "string") return block;
    return { ...block, thinking: regulateThinkingReplay(block.thinking, options).text };
  });
}
