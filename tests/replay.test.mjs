import test from "node:test";
import assert from "node:assert/strict";
import { inspectHmmReplay, regulateThinkingReplay, regulateThinkingBlocks } from "../src/replay/hmm.js";
import { stripTranscriptEcho, stripTranscriptEchoTimed } from "../src/replay/transcripts.js";
import { prepareReplay } from "../src/replay/prepare.js";

test("short reasoning remains exactly unchanged even when repetition is high", () => {
  const text = "Hmm ".repeat(50);
  assert.equal(regulateThinkingReplay(text).text, text);
  assert.equal(inspectHmmReplay(text).shortExempt, true);
});
test("six occurrences trigger cleaning while long meaningful content survives", () => {
  const body = "keep useful evidence ".repeat(220);
  const original = "Hmm. Hmm! Hmmm, Hmm? Hmm. Hmm. " + body;
  const result = regulateThinkingReplay(original);
  assert.equal(result.action, "clean");
  assert.equal((result.text.match(/\bh+m+\b/gi) || []).length, 0);
  assert.equal(result.text, body.trimEnd());
  assert.ok(result.text.length > 1500);
});
test("density threshold cleans two occurrences in 500 characters", () => {
  const text = ("Hmm. Hmm. " + "x".repeat(500)).slice(0, 500);
  assert.equal(inspectHmmReplay(text).occurrences, 2);
  assert.equal(inspectHmmReplay(text).shouldClean, true);
});
test("density boundary and healthy long reasoning", () => {
  const boundary = ("Hmm Hmm Hmm " + "x".repeat(1000)).slice(0, 1000);
  assert.equal(inspectHmmReplay(boundary).densityPer1000, 3);
  const healthy = "Hmm ".repeat(5) + "reasoning ".repeat(700);
  assert.equal(regulateThinkingReplay(healthy).text, healthy);
});
test("tokens inside ordinary words are not filler matches", () => {
  assert.equal(inspectHmmReplay("rhmmh algorithm mhm ".repeat(40)).occurrences, 0);
  assert.throws(() => regulateThinkingReplay("x", { minChars: -1 }), RangeError);
});
test("blocks keep metadata and do not mutate original", () => {
  const blocks = [{ type: "thinking", thinking: "Hmm ".repeat(10) + "evidence ".repeat(60), signature: "reasoning_content" }];
  const original = JSON.stringify(blocks);
  assert.equal(regulateThinkingBlocks(blocks)[0].signature, "reasoning_content");
  assert.equal(JSON.stringify(blocks), original);
});
const reference = Date.parse("2030-01-01T12:00:00+08:00");
test("future timestamp is cut in reasoning but inline past quotes pass", () => {
  const prefix = "valid thought\n";
  assert.equal(stripTranscriptEchoTimed(prefix + "[Tue 2030-01-01 12:01 GMT+8] fake", "think", reference), "valid thought");
  const inline = 'quotation "[Tue 2030-01-01 11:59 GMT+8] old"';
  assert.equal(stripTranscriptEchoTimed(inline, "think", reference), inline);
});
test("three anchored past blocks cut while two do not", () => {
  const two = "[Tue 2030-01-01 11:55 GMT+8] a\n[Tue 2030-01-01 11:56 GMT+8] b";
  assert.equal(stripTranscriptEchoTimed(two, "think", reference), two);
  assert.equal(stripTranscriptEchoTimed(two + "\n[Tue 2030-01-01 11:57 GMT+8] c", "think", reference), "");
});
test("tool mode detects inline future only and tolerates missing timestamps", () => {
  assert.equal(stripTranscriptEchoTimed('result "[Tue 2030-01-01 12:01 GMT+8] fake"', "tool", reference), 'result "');
  const ordinary = "Conversation info (untrusted metadata) is a field name";
  assert.equal(stripTranscriptEchoTimed(ordinary, "tool", reference), ordinary);
  assert.equal(stripTranscriptEchoTimed(ordinary, "think", null), ordinary);
});
test("strict assistant text strips envelopes and replay preserves the archive", () => {
  assert.equal(stripTranscriptEcho("hello\n[全局: demo] fake"), "hello");
  const messages = [{ role: "assistant", timestamp: "2030-01-01T12:00:00+08:00", reasoning_content: "Hmm ".repeat(12) + "meaningful ".repeat(100), content: "hello\n[群: example] fake" }];
  const original = JSON.stringify(messages);
  const result = prepareReplay(messages);
  assert.equal(result[0].content, "hello");
  assert.equal((result[0].reasoning_content.match(/\bh+m+\b/gi) || []).length, 0);
  assert.equal(JSON.stringify(messages), original);
});
