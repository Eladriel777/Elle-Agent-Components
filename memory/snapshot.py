#!/usr/bin/env python3
"""Elle memory system — snapshot generation"""
import re
import argparse
import json, os, sys, time
from datetime import datetime, timezone, timedelta
from pathlib import Path

SESSIONS_DIR = Path()
WORKSPACE = Path()
MEMORY_DIR = Path()
STATE_PATH = Path()
TZ = timezone(timedelta(hours=8))
WHITELIST = {}

def configure_cli():
    global SESSIONS_DIR, WORKSPACE, MEMORY_DIR, STATE_PATH, WHITELIST
    parser = argparse.ArgumentParser(description="Save new OpenClaw group messages as snapshots")
    parser.add_argument("--sessions-dir", required=True)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--group", action="append", required=True, help="Group ID; repeat for multiple groups")
    args = parser.parse_args()
    if any(not re.fullmatch(r"[0-9]+", group) for group in args.group):
        parser.error("group IDs must be numeric")
    SESSIONS_DIR = Path(args.sessions_dir).resolve()
    WORKSPACE = Path(args.workspace).resolve()
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    MEMORY_DIR = WORKSPACE / "memory"
    STATE_PATH = WORKSPACE / "memory_system_state.json"
    WHITELIST = {group: (group, group) for group in args.group}


def log(msg):
    ts = datetime.now(TZ).strftime("%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def read_jsonl(path):
    if not Path(path).exists():
        return []
    items = []
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return items

def load_state():
    if not STATE_PATH.exists():
        return None
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except Exception:
        return None

def save_state(state):
    tmp = str(STATE_PATH) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    os.replace(tmp, STATE_PATH)

def get_group_sessions():
    sj = SESSIONS_DIR / "sessions.json"
    if not sj.exists():
        return None
    try:
        with open(sj) as f:
            sessions = json.load(f)
    except Exception:
        return None
    result = {}
    for key, val in sessions.items():
        if "qqbot:group:" not in key and "onebot:group:" not in key:
            continue
        gid = key.split("qqbot:group:")[1].lower() if "qqbot:group:" in key else key.split("onebot:group:")[1].replace("group:", "").lower()
        if gid not in WHITELIST:
            continue
        if isinstance(val, dict) and "sessionId" in val:
            result[gid] = val["sessionId"]
    return result

def format_iso(ts_str):
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt.astimezone(TZ).strftime("%H:%M:%S")
    except Exception:
        return ""

def extract_messages(session_path, start_line=0):
    items = read_jsonl(session_path)
    msgs = []
    for item in items[start_line:]:
        if item.get("type") != "message":
            continue
        msg = item.get("message", {})
        role = msg.get("role", "")
        if role not in ("user", "assistant", "toolResult"):
            continue
        msgs.append({
            "role": role,
            "content": msg.get("content", ""),
            "timestamp": item.get("timestamp", ""),
            "id": item.get("id", ""),
        })
    return msgs

def strip_transcript_echo(text):
    if not isinstance(text, str) or not text:
        return text
    cut = -1
    for marker in ("Conversation info (untrusted metadata)", "Sender (untrusted metadata)"):
        i = text.find(marker)
        if i != -1 and (cut == -1 or i < cut):
            cut = i
    for rx in (_ENVELOPE_LINE, _OLD_ECHO, _TS_LINE):
        mo = rx.search(text)
        if mo and (cut == -1 or mo.start() < cut):
            cut = mo.start()
    if cut == -1:
        return text
    kept = text[:cut]
    kept = re.sub(r"\n?[ \t]*\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[^\]\n]{0,60}GMT[+-]\d+\][ \t]*$", "", kept)
    return kept.rstrip()

_ENVELOPE_LINE = re.compile(r"(?:^|\n)[ \t]*\[(?:全局|群):")
_OLD_ECHO = re.compile(r"(?:^|\n)[ \t]*(?:user|assistant|system)\[[^\]\n]{0,120}GMT[+-]\d+\]")
_TS_LINE = re.compile(r"(?:^|\n)[ \t]*\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[^\]\n]{0,80}GMT[+-]\d+\]")

def clean_cq(text):
    t = re.sub(r"\[CQ:image,[^\]]+\]", "[图片]", text)
    t = re.sub(r"\[CQ:face,id=(\d+)]", r"[表情:\1]", t)
    t = re.sub(r"\[CQ:video,[^\]]+\]", "[视频]", t)
    t = re.sub(r"\[CQ:at,qq=(\d+)]", r"@\1", t)
    return t

_CTX = re.compile(
    r"\[群:\s*(.+?)\s*\((\d+)\)\]\s*\[全局:\s*(.+?)\s*\|\s*群:\s*(.*?)\s*\|\s*QQ:\s*(\d+)\]\s*\n?")

def fmt_entry(msg, group_label):
    role = msg["role"]
    ts = format_iso(msg["timestamp"])
    content = msg["content"]

    if role == "user":
        c = content if isinstance(content, str) else str(content)
        # Skip warm-up/system-injected prompts (plain string or list format)
        if isinstance(c, str) and ("系统提示:群聊已经至少沉默了" in c):
            return ""
        m = _CTX.match(c)
        if m:
            gname, gid, global_n, card, qq = m.group(1), m.group(2), m.group(3), m.group(4).strip(), m.group(5)
            name = card if card else global_n
            body = strip_transcript_echo(clean_cq(c[m.end():].strip()))
            sender = f"[全局: {global_n} | 群: {card} | QQ: {qq}]" if card else f"[全局: {global_n} | QQ: {qq}]"
            return f"[{ts}] [{gname}({gid})] {sender}: {body}"
        return f"[{ts}] [{group_label}] user: {clean_cq(c)}"

    if role == "assistant":
        lines = []
        has_thinking = False
        if isinstance(content, list):
            for part in content:
                if not isinstance(part, dict): continue
                if part.get("type") == "thinking":
                    t = strip_transcript_echo(part.get("thinking", ""))
                    if t:
                        for tl in t.strip().split("\n"):
                            lines.append(f"  > {tl}")
                        has_thinking = True
                elif part.get("type") == "text":
                    txt = strip_transcript_echo(part.get("text", ""))
                    if txt == "NO_REPLY":
                        lines.append("assistant: NO_REPLY")
                    elif txt:
                        lines.append(f"assistant: {txt}")
            sep = "\n"
            return sep.join(lines)
        elif isinstance(content, str):
            return f"assistant: {content}"
        return ""

    if role == "toolResult":
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    return f"          result: {part.get('text', '')[:300]}"
        return ""

    return ""

def generate_snapshot(all_msgs):
    now = datetime.now(TZ)
    fname = now.strftime("%Y-%m-%d-%H%M")
    lines = [
        f"# Session: {now.strftime('%Y-%m-%d %H:%M:%S')} GMT+8",
        "- Source: self-built-memory-system",
        f"- Session ID: self-built-{now.strftime('%Y%m%d-%H%M')}",
        "",
        "## Conversation Summary",
        "",
    ]
    for msg in all_msgs:
        gid = msg.get("_group", "")
        label = WHITELIST.get(gid, ("??",))[0]
        entry = fmt_entry(msg, label)
        if entry:
            lines.append(entry)
    text = "\n".join(lines)
    snap_path = MEMORY_DIR / f"{fname}.md"
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    # Keep both batches when multiple runs happen within the same minute.
    with open(snap_path, "a", encoding="utf-8") as f:
        if f.tell():
            f.write("\n\n")
        f.write(text)
    log(f"Snapshot: {snap_path.name}")
    return text

def main():
    log("=== Snapshot Start ===")
    gs = get_group_sessions()
    if gs is None:
        log("sessions.json unavailable, skip")
        return
    state = load_state()
    is_first = state is None
    if is_first:
        state = {"groups": {}, "last_run": datetime.now(TZ).isoformat()}

    all_msgs = []
    new_groups = {}
    for gid, csid in gs.items():
        label = WHITELIST[gid][0]
        old = state.get("groups", {}).get(gid, {})
        osid = old.get("session_id", "")
        oline = old.get("last_line", 0)
        gmsgs = []
        nline = oline
        nsid = csid

        if osid != csid and not is_first:
            log(f"[{label}] rotated {osid[:20]} -> {csid[:20]}")
            opath = SESSIONS_DIR / f"{osid}.jsonl"
            if opath.exists():
                tmsgs = extract_messages(str(opath), oline)
                for m in tmsgs:
                    m["_group"] = gid
                gmsgs.extend(tmsgs)
                log(f"[{label}] old tail: {len(tmsgs)}")
            npath = SESSIONS_DIR / f"{csid}.jsonl"
            amsgs = extract_messages(str(npath), 0)
            for m in amsgs:
                m["_group"] = gid
            gmsgs.extend(amsgs)
            nline = len(read_jsonl(str(npath)))
            log(f"[{label}] new full: {len(amsgs)}")
        else:
            spath = SESSIONS_DIR / f"{csid}.jsonl"
            all_lines = read_jsonl(str(spath))
            tl = len(all_lines)
            if tl > oline:
                nmsgs = extract_messages(str(spath), oline)
                for m in nmsgs:
                    m["_group"] = gid
                gmsgs = nmsgs
                nline = tl
                log(f"[{label}] {len(nmsgs)} new (line {oline+1}-{tl})")
            else:
                log(f"[{label}] no new ({oline}/{tl})")

        if is_first and gmsgs:
            cutoff = datetime.now(TZ) - timedelta(minutes=30)
            filtered = []
            for m in gmsgs:
                ts = m.get("timestamp", "")
                if ts:
                    try:
                        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        if dt >= cutoff:
                            filtered.append(m)
                    except Exception:
                        filtered.append(m)
            gmsgs = filtered
            log(f"[{label}] first run: {len(gmsgs)} msgs (filtered to last 30min)")

        all_msgs.extend(gmsgs)
        new_groups[gid] = {"session_id": nsid, "last_line": nline}

    all_msgs.sort(key=lambda m: m.get("timestamp", ""))

    if all_msgs:
        log(f"Total: {len(all_msgs)} msgs")
        generate_snapshot(all_msgs)
    else:
        log("No new messages")

    state["groups"] = new_groups
    state["last_run"] = datetime.now(TZ).isoformat()
    save_state(state)
    log("=== Snapshot Done ===")

if __name__ == "__main__":
    configure_cli()
    main()
