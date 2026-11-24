"""Shared helpers: a throw-away copy of the project, a running server, HTTP calls."""
from __future__ import annotations

import http.client
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FAKES = Path(__file__).resolve().parent / "fake_agents"
COPY = ["app", "scripts", "plan", "materials/grammar", "progress", "assessments", "resources", "research", "docs",
        "AGENTS.md", "README.md", ".gitignore"]


def make_sandbox() -> Path:
    """Copy the parts of the project the app uses into a temp dir (never touches the real repo)."""
    root = Path(tempfile.mkdtemp(prefix="eb-test-"))
    for item in COPY:
        src = REPO / item
        dst = root / item
        if src.is_dir():
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("state", "__pycache__", "*.pyc"))
        elif src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
    (root / "app" / "state").mkdir(parents=True, exist_ok=True)
    return root


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class AppServer:
    """Start app/server.py from a sandbox with fake agents; stop it on close()."""

    def __init__(self, root: Path, port: int | None = None, env: dict | None = None):
        self.root, self.port = root, port or free_port()
        self.log = root / "fake.log"
        e = {**os.environ, "CLAUDE_BIN": str(FAKES / "fake_claude.py"), "CODEX_BIN": str(FAKES / "fake_codex.py"),
             "FAKE_LOG": str(self.log), "PYTHONIOENCODING": "utf-8", "AGENT_TIMEOUT": "60"}
        e.pop("CODEX_SANDBOX", None)
        e.update(env or {})
        self.proc = subprocess.Popen([sys.executable, str(root / "app" / "server.py"), "--port", str(self.port), "--no-browser"],
                                     cwd=root, env=e, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                     encoding="utf-8", errors="replace")
        deadline = time.time() + 15
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError("server exited: " + self.proc.stderr.read())
            try:
                if self.get("/api/health")[0] == 200:
                    break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("server did not start")
        self.token = self.get_json("/api/token")["token"]

    # -- HTTP helpers
    def request(self, method, path, body=None, headers=None, timeout=30):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=timeout)
        h = {"Host": f"127.0.0.1:{self.port}", **(headers or {})}
        data = None
        if body is not None:
            data = body if isinstance(body, (bytes, str)) else json.dumps(body)
            h.setdefault("Content-Type", "application/json")
        c.request(method, path, body=data, headers=h)
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r.status, raw

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def get_json(self, path):
        st, raw = self.get(path)
        assert st == 200, (st, raw[:200])
        return json.loads(raw)

    def post(self, path, body=None, token=True, **kw):
        headers = kw.pop("headers", {})
        if token:
            headers["X-Token"] = self.token
        st, raw = self.request("POST", path, body=body if body is not None else {}, headers=headers, **kw)
        try:
            return st, json.loads(raw)
        except ValueError:
            return st, raw

    def chat(self, agent, text, timeout=60):
        """Send a chat message; return the list of streamed events (or (status, body) on error)."""
        st, raw = self.request("POST", "/api/chat/send", body={"agent": agent, "text": text},
                               headers={"X-Token": self.token}, timeout=timeout)
        if st != 200:
            return st, json.loads(raw)
        return [json.loads(l) for l in raw.decode("utf-8").splitlines() if l.strip()]

    def calls(self):
        if not self.log.exists():
            return []
        return [json.loads(l) for l in self.log.read_text(encoding="utf-8").splitlines() if l.strip()]

    def close(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        for s in (self.proc.stdout, self.proc.stderr):
            if s:
                s.close()


def text_of(events) -> str:
    return "".join(e["v"] for e in events if e.get("t") == "text")


def kinds(events, t) -> list:
    return [e["v"] for e in events if e.get("t") == t]
