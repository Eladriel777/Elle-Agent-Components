// SPDX-License-Identifier: MIT
import { pokeTarget } from "./client.js";
import { fetchAvatar } from "./avatar.js";
import { fetchForward } from "./forward.js";
import { fetchGroupNotice } from "./notice.js";
import { fetchMemberInfo } from "./member.js";
import { sendReaction } from "./reaction.js";

const id = description => ({ anyOf: [{ type: "string" }, { type: "number" }], description });
const params = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const result = value => ({ content: [{ type: "text", text: JSON.stringify(value) }], details: value });

export function createQQTools(account) {
  const definitions = [
    ["qq_poke", "戳一戳指定QQ用户；填group_id在群里戳，否则为私聊。", params({ user_id: id("QQ号"), group_id: id("群号，可选") }, ["user_id"]), p => pokeTarget(account, { userId: p.user_id, groupId: p.group_id })],
    ["qq_avatar", "读取用户或群的头像，返回下载路径或URL。", params({ user_id: id("用户QQ号"), group_id: id("群号") }), p => fetchAvatar({ userId: p.user_id, groupId: p.group_id })],
    ["qq_forward", "按需展开嵌套合并转发，每次返回50条；用next_offset继续阅读。", params({ id: id("转发编号，长编号使用字符串"), offset: id("返回记录的偏移量") }, ["id"]), p => fetchForward(account, { id: p.id, offset: p.offset })],
    ["qq_notice", "读取普通公告和发给新成员公告，每页10条；图片可下载。", params({ group_id: id("群号"), offset: id("翻页偏移") }, ["group_id"]), p => fetchGroupNotice(account, { groupId: p.group_id, offset: p.offset })],
    ["qq_member", "实时查成员身份、头衔和官方机器人标记；不填user_id查自己。", params({ group_id: id("群号"), user_id: id("用户QQ号，可选") }, ["group_id"]), p => fetchMemberInfo(account, { groupId: p.group_id, userId: p.user_id })],
    ["qq_reaction", "给指定消息贴表情；emoji_id填QQ表情编号。", params({ message_id: id("消息编号"), emoji_id: id("表情编号") }, ["message_id", "emoji_id"]), p => sendReaction(account, { messageId: p.message_id, emojiId: p.emoji_id })],
  ];
  return definitions.map(([name, description, parameters, execute]) => ({
    name, label: name, description, promptSnippet: `${name}: ${description}`, parameters,
    async execute(_callId, input) {
      try { return result(await execute(input ?? {})); } catch (error) { return result({ ok: false, error: error.message }); }
    },
  }));
}
