// SPDX-License-Identifier: MIT
import { regulateThinkingReplay } from "./hmm.js";
import { stripTranscriptEcho, stripTranscriptEchoTimed, resolveTurnStartMs } from "./transcripts.js";

// Return a copy suitable for the next model request. Store the original separately.
export function prepareReplay(messages, { hmm = {}, cleanAssistantText = true } = {}) {
  if (!Array.isArray(messages)) throw new TypeError("messages must be an array");
  return messages.map((message, index) => {
    if (!message || typeof message !== "object") return message;
    const output = { ...message };
    const reference = resolveTurnStartMs({ messages }, index, message.role);
    const cleanThinking = text => stripTranscriptEchoTimed(regulateThinkingReplay(text, hmm).text, "think", reference);
    const isTool = message.role === "tool" || message.role === "toolResult";
    if (message.role === "assistant" && typeof message.reasoning_content === "string") {
      output.reasoning_content = cleanThinking(message.reasoning_content);
    }
    if (typeof message.content === "string") {
      if (message.role === "assistant" && cleanAssistantText) output.content = stripTranscriptEcho(message.content);
      if (isTool) output.content = stripTranscriptEchoTimed(message.content, "tool", reference);
    } else if (Array.isArray(message.content)) {
      output.content = message.content.map(part => {
        if (!part || typeof part !== "object") return part;
        const value = { ...part };
        if (message.role === "assistant" && part.type === "thinking" && typeof part.thinking === "string") value.thinking = cleanThinking(part.thinking);
        if (part.type === "text" && typeof part.text === "string") {
          if (message.role === "assistant" && cleanAssistantText) value.text = stripTranscriptEcho(part.text);
          if (isTool) value.text = stripTranscriptEchoTimed(part.text, "tool", reference);
        }
        return value;
      });
    }
    return output;
  });
}
