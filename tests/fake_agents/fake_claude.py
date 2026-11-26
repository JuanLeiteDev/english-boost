"""Stand-in for `claude -p --output-format stream-json` used by the test-suite.

Reads the prompt from stdin (like the real CLI) and emits the same event shapes.
Behaviour switches (words in the prompt): SLEEP, STDERR_FLOOD, NOSTREAM.
`--resume missing-session` simulates a session that does not exist.
Every call is appended to $FAKE_LOG as JSON (argv + stdin) so tests can inspect it.
"""
import json
import os
import sys
import time
import uuid

args = sys.argv[1:]
if args[:2] == ["auth", "status"]:  # login check; FAKE_LOGGED_OUT=claude simulates a logged-out CLI (not logged)
    out_ = "claude" not in os.environ.get("FAKE_LOGGED_OUT", "")
    print(json.dumps({"loggedIn": out_, "authMethod": "claude.ai" if out_ else "none"}))
    sys.exit(0 if out_ else 1)
prompt = sys.stdin.read()
log = os.environ.get("FAKE_LOG")
if log:
    with open(log, "a", encoding="utf-8") as f:
        f.write(json.dumps({"agent": "claude", "argv": args, "stdin": prompt}, ensure_ascii=False) + "\n")


def out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


resume = args[args.index("--resume") + 1] if "--resume" in args else None
if resume == "missing-session":
    out({"type": "result", "subtype": "error_during_execution", "is_error": True,
         "result": "No conversation found with session ID: missing-session", "session_id": "missing-session"})
    sys.exit(1)
if "STDERR_FLOOD" in prompt:
    for _ in range(4000):  # ~400 KB, far more than a pipe buffer
        sys.stderr.write("warning: " + "x" * 90 + "\n")
    sys.stderr.flush()
if "SLEEP" in prompt:
    time.sleep(60)

sid = resume or "sess-claude-" + uuid.uuid4().hex[:8]
out({"type": "system", "subtype": "init", "session_id": sid, "apiKeySource": "none"})
if "NOSTREAM" in prompt:
    out({"type": "assistant", "message": {"content": [{"type": "text", "text": "no-stream reply"}]}})
else:
    first_line = prompt.strip().splitlines()[0] if prompt.strip() else ""
    out({"type": "stream_event", "event": {"type": "message_start"}})
    for chunk in ("Echo: ", first_line[:40]):
        out({"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": chunk}}})
    out({"type": "assistant", "message": {"content": [
        {"type": "text", "text": "Echo: " + first_line[:40]},  # duplicate of the deltas: must not be shown twice
        {"type": "tool_use", "name": "Read", "input": {"file_path": os.path.join(os.getcwd(), "plan", "master-plan.md")}}]}})
    out({"type": "stream_event", "event": {"type": "message_start"}})
    out({"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "[[abrir:P1-01]]"}}})
out({"type": "result", "subtype": "success", "is_error": False, "result": "ok", "session_id": sid})
