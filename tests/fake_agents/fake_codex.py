"""Stand-in for `codex exec --json` used by the test-suite (prompt from stdin via `-`).

Behaviour switches (words in the prompt): SLEEP, STDERR_FLOOD.
`exec resume missing-session -` simulates a thread that does not exist.
Every call is appended to $FAKE_LOG as JSON (argv + stdin).
"""
import json
import os
import sys
import time
import uuid

args = sys.argv[1:]
prompt = sys.stdin.read() if args and args[-1] == "-" else (args[-1] if args else "")
log = os.environ.get("FAKE_LOG")
if log:
    with open(log, "a", encoding="utf-8") as f:
        f.write(json.dumps({"agent": "codex", "argv": args, "stdin": prompt}, ensure_ascii=False) + "\n")


def out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


resuming = args[:2] == ["exec", "resume"]
sid = args[2] if resuming else "thread-" + uuid.uuid4().hex[:8]
if resuming and sid == "missing-session":
    sys.stderr.write("Error: no rollout found for thread id missing-session\n")
    sys.exit(1)
if "STDERR_FLOOD" in prompt:
    for _ in range(4000):
        sys.stderr.write("2026-11-24T00:00:00Z WARN codex_core: " + "y" * 80 + "\n")
    sys.stderr.flush()
if "SLEEP" in prompt:
    time.sleep(60)

if not resuming:
    out({"type": "thread.started", "thread_id": sid})
out({"type": "turn.started"})
out({"type": "item.completed", "item": {"id": "item_0", "type": "error", "message": "harmless warning"}})
out({"type": "item.started", "item": {"id": "item_1", "type": "command_execution", "command": "/bin/bash -lc 'ls plan'"}})
out({"type": "item.completed", "item": {"id": "item_1", "type": "command_execution", "command": "ls plan", "exit_code": 0}})
last = prompt.strip().splitlines()[-1] if prompt.strip() else ""
out({"type": "item.completed", "item": {"id": "item_2", "type": "agent_message", "text": "Codex: " + last[:40]}})
out({"type": "turn.completed", "usage": {"input_tokens": 1, "output_tokens": 1}})
