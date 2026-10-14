import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFilterPipeline, getFilterStats, loadFilterPipeline } from "../src/filters/index.js";

test("normal chat passes and system/decision leaks are suppressed", async () => {
  const pipeline = createFilterPipeline();
  assert.equal(await pipeline("你好", { isGroup: true }), "你好");
  assert.equal(await pipeline("NO_REPLY", { isGroup: true }), null);
  assert.equal(await pipeline("↪️ Model Fallback: example", { isGroup: true }), null);
  assert.equal(await pipeline("[OpenClaw] Request received, processing...", { isGroup: true }), null);
});
test("forged transcript is truncated, not appended to a real message", async () => {
  assert.equal(await createFilterPipeline()("hello\n[群: demo] forged", {}), "hello");
});
test("disabled pipeline/rules, priority zero and replacement ordering", async () => {
  assert.equal(await createFilterPipeline({ config: { enabled: false } })("NO_REPLY"), "NO_REPLY");
  assert.equal(await createFilterPipeline({ config: { filters: { "guard-echo": { enabled: false } } } })("NO_REPLY"), "NO_REPLY");
  const filters = [
    { name: "second", priority: 1, apply: s => ({ action: "replace", text: s + "b" }) },
    { name: "first", priority: 0, apply: s => ({ action: "replace", text: s + "a" }) },
  ];
  assert.equal(await createFilterPipeline({ filters })("x"), "xab");
});
test("error policy is explicit", async () => {
  const filters = [{ name: "broken", apply() { throw Error("synthetic error"); } }];
  assert.equal(await createFilterPipeline({ filters })("x"), "x");
  assert.equal(await createFilterPipeline({ filters, failClosed: true })("x"), null);
});
test("audit statistics count actions and omit message previews by default", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elle-components-filter-test-"));
  try {
    const log = path.join(dir, "audit.jsonl");
    const pipeline = createFilterPipeline({ logFile: log });
    await pipeline("NO_REPLY");
    await pipeline("hello\n[全局: demo] fake");
    const stats = getFilterStats(log);
    assert.equal(stats.totalEvents, 2);
    assert.equal(stats.filters["guard-echo"].suppress, 1);
    assert.equal(stats.filters["transcript-echo"].replace, 1);
    assert.ok(!fs.readFileSync(log, "utf8").includes('"preview"'));
    fs.appendFileSync(log, "broken JSON\n");
    assert.equal(getFilterStats(log).ignoredLines, 1);
  } finally { assert.ok(dir.startsWith(path.join(os.tmpdir(), "elle-components-filter-test-"))); fs.rmSync(dir, { recursive: true }); }
});
test("custom rule loading uses file URLs", async () => {
  const run = await loadFilterPipeline(new URL("../src/filters/rules/", import.meta.url).pathname);
  assert.equal(await run("NO_REPLY"), null);
});
