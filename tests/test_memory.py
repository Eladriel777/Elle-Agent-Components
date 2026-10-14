import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


class MemoryTests(unittest.TestCase):
    def test_snapshot_incremental_rotation_and_same_minute(self):
        snap = module("snapshot", "memory/snapshot.py")
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            snap.SESSIONS_DIR = base / "sessions"
            snap.SESSIONS_DIR.mkdir()
            snap.WORKSPACE = base
            snap.MEMORY_DIR = base / "memory"
            snap.STATE_PATH = base / "state.json"
            snap.WHITELIST = {"10001": ("example", "10001")}
            registry = snap.SESSIONS_DIR / "sessions.json"
            def select(session):
                registry.write_text(json.dumps({"agent:qq:onebot:group:10001": {"sessionId": session}}))
            def append(session, text):
                row = {"type": "message", "timestamp": datetime.now(snap.TZ).isoformat(),
                       "message": {"role": "user", "content": text}}
                with (snap.SESSIONS_DIR / (session + ".jsonl")).open("a") as file:
                    file.write(json.dumps(row) + "\n")
            select("first")
            append("first", "initial synthetic message")
            snap.main()
            before = {p.name: p.read_bytes() for p in snap.MEMORY_DIR.iterdir()}
            snap.main()
            self.assertEqual(before, {p.name: p.read_bytes() for p in snap.MEMORY_DIR.iterdir()})
            append("first", "old session tail")
            select("second")
            append("second", "new session message")
            snap.main()
            all_text = "\n".join(p.read_text() for p in snap.MEMORY_DIR.iterdir())
            for text in ("initial synthetic message", "old session tail", "new session message"):
                self.assertEqual(all_text.count(text), 1)
            state = json.loads(snap.STATE_PATH.read_text())
            self.assertEqual(state["groups"]["10001"], {"session_id": "second", "last_line": 1})

    def test_summary_boundary_and_catchup(self):
        summary = module("summary", "memory/summary.py")
        with tempfile.TemporaryDirectory() as directory:
            summary.MEMORY_DIR = Path(directory)
            summary.DRY_RUN = False
            day = datetime.now(summary.TZ).date() - timedelta(days=4)
            following = day + timedelta(days=1)
            files = [(day, "0315", "start"), (day, "0330", "former-gap"),
                     (following, "0314", "late-night"), (following, "0315", "next-window")]
            for date, hm, text in files:
                (summary.MEMORY_DIR / f"{date}-{hm}.md").write_text(text)
            with patch.object(summary, "load_conf", return_value=("dummy", "https://api.example.invalid/v1")), \
                 patch.object(summary, "call_reasoner", side_effect=["first summary", "second summary"]) as call:
                summary.main()
                self.assertEqual(call.call_count, 2)
                self.assertEqual(call.call_args_list[0].args[0], "start\n\nformer-gap\n\nlate-night")
                self.assertEqual(call.call_args_list[1].args[0], "next-window")
                summary.main()
                self.assertEqual(call.call_count, 2)

    def test_summary_dry_run_no_network_no_write(self):
        summary = module("summary_dry", "memory/summary.py")
        with tempfile.TemporaryDirectory() as directory:
            summary.MEMORY_DIR = Path(directory)
            summary.DRY_RUN = True
            date = datetime.now(summary.TZ).date() - timedelta(days=4)
            (summary.MEMORY_DIR / f"{date}-0400.md").write_text("synthetic")
            before = list(summary.MEMORY_DIR.iterdir())
            with patch.object(summary.request, "urlopen", side_effect=AssertionError("network forbidden")):
                summary.main()
            self.assertEqual(before, list(summary.MEMORY_DIR.iterdir()))

    def test_summary_empty_response_does_not_mark_complete(self):
        summary = module("summary_empty", "memory/summary.py")
        with tempfile.TemporaryDirectory() as directory:
            summary.MEMORY_DIR = Path(directory)
            date = datetime.now(summary.TZ).date() - timedelta(days=4)
            (summary.MEMORY_DIR / f"{date}-0400.md").write_text("synthetic")
            with patch.object(summary, "load_conf", return_value=("dummy", "https://api.example.invalid/v1")), \
                 patch.object(summary, "call_reasoner", return_value=""):
                summary.main()
            self.assertFalse((summary.MEMORY_DIR / f"{date}.md").exists())
            self.assertTrue((summary.MEMORY_DIR / "_failed.txt").exists())

    def test_index_incremental_and_exit_status(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            stub = base / "openclaw-stub"
            stub.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$*" > "$ELLE_MEMORY_INDEX_DIR/args"\nexit 7\n')
            stub.chmod(0o700)
            env = {**os.environ, "ELLE_MEMORY_INDEX_DIR": str(base), "OPENCLAW_BIN": str(stub)}
            result = subprocess.run(["bash", str(ROOT / "memory/index_memory.sh")], env=env)
            self.assertEqual(result.returncode, 7)
            self.assertEqual((base / "args").read_text().strip(), "memory index --agent qqgroup")
            self.assertIn("rc=7", (base / "index_rebuild.log").read_text())


class HookTests(unittest.TestCase):
    def test_check_install_idempotence_and_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "provider.mjs"
            original = 'export function convertMessages(model, context, compat, options = {}) { return context.messages; }\n'
            target.write_text(original)
            command = ["python3", str(ROOT / "adapters/openclaw/replay_hook.py"), "--target", str(target)]
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 2)
            self.assertEqual(target.read_text(), original)
            self.assertEqual(subprocess.run(command + ["--apply"], capture_output=True).returncode, 0)
            installed = target.read_bytes()
            self.assertEqual(subprocess.run(command + ["--apply"], capture_output=True).returncode, 0)
            self.assertEqual(target.read_bytes(), installed)
            self.assertEqual(len(list(Path(directory).glob("*.bak-*"))), 1)
            script = f'import {{convertMessages}} from {json.dumps(target.as_uri())}; const x=convertMessages(null,{{messages:[{{role:"assistant",reasoning_content:"Hmm ".repeat(10)+"evidence ".repeat(100),content:"answer"}}]}}); if(/\\bh+m+\\b/i.test(x[0].reasoning_content)) process.exit(1);'
            self.assertEqual(subprocess.run(["node", "--input-type=module", "-e", script]).returncode, 0)

    def test_unsupported_target_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "provider.mjs"
            target.write_text("export const unsupported = true;\n")
            command = ["python3", str(ROOT / "adapters/openclaw/replay_hook.py"), "--target", str(target), "--apply"]
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 1)
            self.assertEqual(target.read_text(), "export const unsupported = true;\n")
            self.assertEqual(len(list(Path(directory).glob("*.bak-*"))), 0)


if __name__ == "__main__":
    unittest.main()
