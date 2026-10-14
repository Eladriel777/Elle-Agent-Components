#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Check/install an explicit replay hook in a compatible OpenClaw provider file."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ANCHOR = "function convertMessages(model, context, compat, options = {}) {"
MARKER = "/* elle-agent-components:replay-hook */"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True, help="Explicit provider JavaScript file")
    parser.add_argument("--apply", action="store_true", help="Install after backing up; default is check only")
    args = parser.parse_args()
    target = Path(args.target).resolve()
    module = Path(__file__).resolve().parents[2] / "src/replay/prepare.js"
    if not target.is_file() or target.suffix not in (".js", ".mjs") or not module.is_file():
        parser.error("choose an existing provider JS file and complete component checkout")
    source = target.read_text(encoding="utf-8")
    if source.count(ANCHOR) != 1:
        print("Unsupported function signature; no changes made")
        return 1
    import_line = "import { prepareReplay as ellePrepareReplay } from " + json.dumps(module.as_uri()) + ";"
    hook = "\n\t" + MARKER + "\n\tcontext = { ...context, messages: ellePrepareReplay(context.messages) };"
    if MARKER in source:
        if import_line not in source or hook not in source:
            print("Hook marker exists but configuration differs; inspect manually")
            return 1
        print("Replay hook is installed")
        return 0
    if not args.apply:
        print("Replay hook is not installed (check only)")
        return 2
    replacement = import_line + "\n" + source.replace(ANCHOR, ANCHOR + hook, 1)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    backup = target.with_name(target.name + ".bak-" + stamp + "-elle-components")
    shutil.copy2(target, backup)
    with target.open("w", encoding="utf-8", newline="") as file:
        file.write(replacement)
    try:
        check = subprocess.run(["node", "--check", str(target)], capture_output=True, text=True)
    except OSError:
        shutil.copy2(backup, target)
        print("Node verification unavailable; restored backup")
        return 1
    if check.returncode:
        shutil.copy2(backup, target)
        print("Syntax verification failed; restored backup")
        return 1
    print("Replay hook installed; backup SHA256:", hashlib.sha256(backup.read_bytes()).hexdigest())
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
