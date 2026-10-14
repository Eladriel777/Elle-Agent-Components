import test from "node:test";
import assert from "node:assert/strict";
import plugin from "../adapters/openclaw/plugin.js";
import { fetchForward, fetchGroupNotice, fetchMemberInfo, sendReaction, pokeTarget, fetchAvatar, createQQTools, parseAtMarkers, summarizeCardFields, summarizeKeyboardButtons, formatMemberTags, summarizeReaction, transcribeVoiceWithRetry } from "../src/qq/index.js";
const account = { httpUrl: "http://onebot.test", accessToken: "demo" };
async function mockFetch(fn, action) { const saved = globalThis.fetch; globalThis.fetch = fn; try { return await action(); } finally { globalThis.fetch = saved; } }
const response = data => new Response(JSON.stringify({ status: "ok", retcode: 0, data }), { headers: { "Content-Type": "application/json" } });

test("nested forwarding returns 50/50/15 records and offsets", async () => {
  const content = Array.from({ length: 114 }, (_, i) => ({ time: 1, sender: { nickname: "demo", user_id: 1 }, message: [{ type: "text", data: { text: "record " + i } }] }));
  const messages = [{ time: 1, sender: { nickname: "demo", user_id: 1 }, message: [{ type: "forward", data: { content } }] }];
  await mockFetch(async () => response({ messages }), async () => {
    const pages = await Promise.all([0, 50, 100].map(offset => fetchForward(account, { id: "11", offset })));
    assert.deepEqual(pages.map(p => p.shown), [50, 50, 15]);
    assert.deepEqual(pages.map(p => p.total), [115, 115, 115]);
    assert.equal(pages[0].next_offset, 50); assert.equal(pages[1].next_offset, 100);
    assert.equal(pages[2].next_offset, undefined); assert.ok(pages[0].messages[1].includes("↪"));
    assert.equal((await fetchForward(account, { id: "11", offset: 999 })).shown, 0);
  });
});
test("forward ID cycle terminates and invalid IDs fail without fetching", async () => {
  let calls = 0;
  await mockFetch(async (_url, options) => {
    calls++; const id = JSON.parse(options.body).message_id;
    return response({ messages: [{ message: [{ type: "forward", data: { id: id === "11" ? "22" : "11" } }] }] });
  }, async () => { assert.equal((await fetchForward(account, { id: "11" })).total, 2); assert.equal(calls, 2); assert.equal((await fetchForward(account, { id: "bad" })).ok, false); assert.equal(calls, 2); });
});
test("group notices expose inst pin, ordinary notices and next page without exposing cookies", async () => {
  await mockFetch(async (url, options) => {
    if (String(url).endsWith("get_cookies")) return response({ cookies: "skey=demo;", bkn: "1" });
    assert.ok(options.headers.Cookie); const parsed = new URL(url); assert.equal(parsed.searchParams.get("s"), "10");
    return new Response(JSON.stringify({ ec: 0, inst: [{ settings: { inst_no_pinned: 0 }, msg: { text: "rules&#10;line" }, pubt: 1 }], feeds: Array.from({ length: 10 }, () => ({ msg: { text: "notice&amp;text" }, u: 1, pubt: 1 })), ui: { 1: { n: "demo" } } }));
  }, async () => {
    const result = await fetchGroupNotice(account, { groupId: "10001", offset: 10 });
    assert.equal(result.ok, true); assert.equal(result.new_member_notice.pinned, true);
    assert.equal(result.new_member_notice.text, "rules\nline"); assert.equal(result.notices[0].sender, "demo");
    assert.equal(result.notices[0].index, 11); assert.equal(result.page.next_offset, 20);
    assert.ok(!JSON.stringify(result).includes("skey="));
    assert.equal(result.notices[0].pinned, undefined);
  });
});
test("self member lookup, authenticated reactions and group/private pokes", async () => {
  const seen = [];
  await mockFetch(async (url, options) => {
    seen.push({ url: String(url), body: JSON.parse(options.body), token: options.headers.Authorization });
    if (String(url).endsWith("get_login_info")) return response({ user_id: 10002 });
    if (String(url).endsWith("get_group_member_info")) return response({ role: "admin", is_robot: true, title: "demo" });
    return response({});
  }, async () => {
    const member = await fetchMemberInfo(account, { groupId: "10001" }); assert.equal(member.user_id, 10002); assert.equal(member.role_label, "管理员");
    assert.equal((await sendReaction(account, { messageId: "10003", emojiId: "76" })).ok, true);
    assert.equal((await pokeTarget(account, { userId: "10002", groupId: "10001" })).ok, true);
    assert.equal((await pokeTarget(account, { userId: "10002" })).ok, true);
    assert.ok(seen.every(x => x.token === "Bearer demo"));
    assert.ok(seen.some(x => x.url.endsWith("friend_poke"))); assert.ok(seen.some(x => x.url.endsWith("group_poke")));
  });
});
test("avatar download failure preserves usable URL", async () => {
  await mockFetch(async () => new Response("missing", { status: 404 }), async () => {
    const avatar = await fetchAvatar({ userId: "10002" }); assert.equal(avatar.ok, true); assert.equal(avatar.path, null); assert.ok(avatar.url.includes("10002"));
  });
});
test("voice retry uses token and returns ready text", async () => {
  let attempt = 0;
  await mockFetch(async (_url, options) => { assert.equal(options.headers.Authorization, "Bearer demo"); attempt++; return attempt === 1 ? response({ text: "" }) : response({ text: "synthetic speech" }); }, async () => {
    assert.equal((await transcribeVoiceWithRetry(account, 10003, null, { retries: 2, intervalMs: 0 })).text, "synthetic speech");
    assert.equal(attempt, 2);
  });
});
test("cards, command buttons, member tags, true at and reaction excerpts", () => {
  assert.ok(summarizeCardFields({ prompt: "a".repeat(200), url: "https://example.com/video" }).endsWith("https://example.com/video"));
  const buttons = summarizeKeyboardButtons({ senderUin: "10002", elements: [{ inlineKeyboardElement: { rows: [{ buttons: [{ label: "menu", data: "/menu", type: 2 }] }] } }] });
  assert.ok(buttons.includes("/menu")); assert.ok(buttons.includes("[CQ:at,qq=10002]"));
  assert.equal(formatMemberTags({ role: "member", is_robot: false }), ""); assert.ok(formatMemberTags({ role: "admin", is_robot: true, title: "demo" }).includes("官方机器人"));
  assert.equal(parseAtMarkers("hello [CQ:at,qq=10002]")[1].type, "at");
  assert.equal(parseAtMarkers("[CQ:at,qq=all]")[0].type, "text");
  assert.equal(parseAtMarkers("[CQ:at,qq=10002]", { isGroup: false })[0].type, "text");
  assert.equal(summarizeReaction({ isAdd: false }), null); assert.equal(summarizeReaction({ isOwnActor: true }), null);
  const reaction = summarizeReaction({ actorName: "demo", targetIsSelf: true, messageText: "x".repeat(40), emojiId: 424 });
  assert.ok(reaction.includes("你的消息")); assert.ok(reaction.includes("…")); assert.ok(reaction.includes("(424)"));
});
test("QQ adapter declares exactly six callable tools", () => {
  const names = createQQTools(account).map(tool => tool.name);
  assert.deepEqual(names, ["qq_poke", "qq_avatar", "qq_forward", "qq_notice", "qq_member", "qq_reaction"]);
});
test("OpenClaw entry registers six tools and honors configured account", async () => {
  const registered = [];
  const saved = process.env.ONEBOT_ACCESS_TOKEN;
  delete process.env.ONEBOT_ACCESS_TOKEN;
  try {
    plugin.register({ pluginConfig: account, registerTool: (tool, options) => registered.push({ tool, options }) });
    assert.equal(registered.length, 6);
    assert.ok(registered.every(item => item.options.name === item.tool.name));
    await mockFetch(async (url, options) => {
      assert.equal(String(url), "http://onebot.test/friend_poke");
      assert.equal(options.headers.Authorization, "Bearer demo");
      return response({});
    }, async () => {
      const value = await registered[0].tool.execute("synthetic-call", { user_id: "10002" });
      assert.equal(value.details.ok, true);
      assert.equal(JSON.parse(value.content[0].text).ok, true);
    });
  } finally {
    if (saved === undefined) delete process.env.ONEBOT_ACCESS_TOKEN;
    else process.env.ONEBOT_ACCESS_TOKEN = saved;
  }
});
