// SPDX-License-Identifier: MIT
export async function callOneBot(account, action, payload = {}) {
  if (!account?.httpUrl) throw new Error("OneBot httpUrl is required");
  const base = new URL(account.httpUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Use an HTTP(S) endpoint without credentials in its URL");
  const headers = { "Content-Type": "application/json" };
  if (account.accessToken) headers.Authorization = `Bearer ${account.accessToken}`;
  const response = await fetch(`${account.httpUrl.replace(/\/$/, "")}/${action}`, {
    method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(account.timeoutMs ?? 20000),
  });
  if (!response.ok) throw new Error(`OneBot ${action}: HTTP ${response.status}`);
  const result = await response.json();
  if (result.retcode !== 0 || result.status === "failed") throw new Error(result.message || result.wording || `OneBot ${action} failed`);
  return result.data ?? {};
}

export async function pokeTarget(account, { userId, groupId } = {}) {
  const uid = Number(userId);
  const gid = groupId == null ? null : Number(groupId);
  if (!Number.isSafeInteger(uid) || uid <= 0 || (gid !== null && (!Number.isSafeInteger(gid) || gid <= 0))) return { ok: false, error: "Invalid userId/groupId" };
  try {
    await callOneBot(account, gid ? "group_poke" : "friend_poke", gid ? { user_id: uid, group_id: gid } : { user_id: uid });
    return { ok: true, user_id: uid, group_id: gid };
  } catch (error) { return { ok: false, error: error.message }; }
}
