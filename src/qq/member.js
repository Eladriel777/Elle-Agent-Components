// SPDX-License-Identifier: MIT

const MEMBER_API_TIMEOUT_MS = 10000;

function normalizeId(value) {
    const cleaned = String(value ?? "").trim();
    return /^\d+$/.test(cleaned) ? cleaned : "";
}

function roleLabel(role) {
    if (role === "owner") return "群主";
    if (role === "admin") return "管理员";
    if (role === "member") return "普通成员";
    return role ? String(role) : "";
}

async function callOneBot(account, action, payload) {
    const headers = { "Content-Type": "application/json" };
    if (account.accessToken) {
        headers.Authorization = `Bearer ${account.accessToken}`;
    }
    const resp = await fetch(`${account.httpUrl}/${action}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(MEMBER_API_TIMEOUT_MS),
    });
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
    }
    const result = await resp.json();
    if (result.retcode !== 0 || result.status === "failed") {
        throw new Error(`${action} failed: ${result.retcode} ${result.message ?? result.wording ?? ""}`.trim());
    }
    return result;
}

export async function fetchMemberInfo(account, { groupId, userId }) {
    const gid = normalizeId(groupId);
    if (!gid) {
        return { ok: false, error: "missing group_id" };
    }
    let uid = normalizeId(userId);
    try {
        if (!uid) {
            const login = await callOneBot(account, "get_login_info", {});
            uid = normalizeId(login?.data?.user_id ?? login?.user_id ?? "");
        }
        if (!uid) {
            return { ok: false, error: "cannot resolve user_id (no login info)" };
        }
        const result = await callOneBot(account, "get_group_member_info", {
            group_id: Number(gid),
            user_id: Number(uid),
            no_cache: true,
        });
        const d = (result && typeof result.data === "object" && result.data) || {};
        return {
            ok: true,
            group_id: Number(gid),
            user_id: Number(uid),
            nickname: d.nickname ?? "",
            card: d.card ?? "",
            role: d.role ?? "",
            role_label: roleLabel(d.role),
            title: d.title ?? "",
            is_robot: d.is_robot === true,
            level: d.level ?? "",
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
    }
}
