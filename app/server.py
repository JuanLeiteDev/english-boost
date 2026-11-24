#!/usr/bin/env python3
"""English Boost: local web app.

Run:   ./estudar.sh            (or: python3 app/server.py [--port 8765] [--no-browser])
Open:  http://127.0.0.1:8765

Python standard library only. The chat talks to the locally installed Claude Code and
Codex CLIs, which use your own subscriptions (no API keys). The server listens only on
127.0.0.1 and every POST needs the session token embedded in the page.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "app" / "static"
STATE = ROOT / "app" / "state"
sys.path.insert(0, str(ROOT / "scripts"))
import build_dashboard as bd  # noqa: E402  (reuse the dashboard parsers)

TOKEN = secrets.token_urlsafe(24)
PORT = 8765
STATE.mkdir(parents=True, exist_ok=True)
LOCK = threading.Lock()
RUNNING: dict[str, subprocess.Popen] = {}

DOC_ALLOWED = ("plan/", "research/", "resources/", "materials/grammar/", "materials/generated/",
               "assessments/", "progress/", "speaking/", "writing/", "README.md", "AGENTS.md")
LISTENING_LINKS = [
    (r"voa.*let'?s learn", "https://learningenglish.voanews.com/p/5644.html"),
    (r"\bvoa\b", "https://learningenglish.voanews.com"),
    (r"esl ?lab", "https://www.esl-lab.com/easy/"),
    (r"elllo", "https://www.elllo.org"),
    (r"bbc", "https://www.bbc.co.uk/learningenglish"),
    (r"all ears", "https://www.allearsenglish.com"),
    (r"ted", "https://ed.ted.com"),
    (r"statquest", "https://www.youtube.com/@statquest"),
    (r"news in levels", "https://www.newsinlevels.com"),
]

APP_CONTEXT = """Contexto: estás a falar com o Juan através da app web local "English Boost", não do VS Code.
- Respostas curtas e bem estruturadas. Explicações em português (PT); prática em inglês. Segue AGENTS.md e usa as skills do projeto.
- A app tem um painel lateral. Para abrir material, escreve numa linha sozinha um marcador: [[abrir:hoje]] (plano do dia), [[abrir:P1-02]] (unidade de gramática interativa), [[abrir:doc:caminho/ficheiro.md]] (documento) ou [[abrir:url:https://...]] (link externo).
- Quando o Juan pedir o estudo do dia, abre [[abrir:hoje]] e a unidade de gramática do dia, e guia-o bloco a bloco.
- Os exercícios de gramática são corrigidos na app. O fecho da sessão (log, espinha, dashboard) e o commit são feitos pelos botões da app: não faças isso tu e não peças comandos de terminal. Atualiza só o progress/error-log.md quando houver erros recorrentes."""

CLAUDE_TOOLS = ",".join([
    "Read", "Write", "Edit", "Glob", "Grep", "Skill", "WebSearch", "WebFetch", "TodoWrite",
    "Bash(date*)", "Bash(ls*)", "Bash(cat*)", "Bash(pdftotext*)", "Bash(curl -s*)",
    "Bash(python3 scripts/build_dashboard.py*)", "Bash(python scripts/build_dashboard.py*)", "Bash(git status*)", "Bash(git log*)", "Bash(git diff*)",
])


# ---------------------------------------------------------------- helpers
def jload(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def jsave(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def settings() -> dict:
    s = {"codex_model": "gpt-6-sol", "claude_model": "", "claude_bin": "", "codex_bin": ""}
    s.update(jload(STATE / "settings.json", {}))
    return s


IS_WIN = os.name == "nt"


def _ver(path: str):
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", path)
    return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)


def _usable(p: str) -> bool:
    # Windows .cmd/.bat shims (npm) can't safely receive multi-line prompts as arguments,
    # so only real executables are accepted.
    if not p or not os.path.isfile(p):
        return False
    if IS_WIN:
        return p.lower().endswith(".exe")
    return os.access(p, os.X_OK)


def _first(cands: list[str]) -> str | None:
    found = []
    for pat in cands:
        found += [p for p in glob.glob(os.path.expanduser(os.path.expandvars(pat)), recursive=True) if _usable(p)]
    return sorted(found, key=_ver)[-1] if found else None


def _which(name: str) -> str | None:
    p = shutil.which(name)
    if p and _usable(p):
        return p
    if IS_WIN:
        p = shutil.which(name + ".exe")
        return p if p and _usable(p) else None
    return None


def find_claude() -> str | None:
    for p in (os.environ.get("CLAUDE_BIN"), settings().get("claude_bin")):
        if p and _usable(p):
            return p
    return _which("claude") or _first([
        "~/.local/bin/claude", "~/.local/bin/claude.exe", "~/.claude/local/claude",
        "~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude*",
        "~/.vscode-insiders/extensions/anthropic.claude-code-*/resources/native-binary/claude*",
        "~/.cursor/extensions/anthropic.claude-code-*/resources/native-binary/claude*",
        "%APPDATA%/npm/node_modules/@anthropic-ai/claude-code*/**/claude.exe",
    ])


def find_codex() -> str | None:
    for p in (os.environ.get("CODEX_BIN"), settings().get("codex_bin")):
        if p and _usable(p):
            return p
    return _which("codex") or _first([
        "/usr/lib/chatgpt/resources/codex", "/Applications/Codex.app/Contents/Resources/codex",
        "~/.local/bin/codex", "~/.local/bin/codex.exe",
        "%LOCALAPPDATA%/Programs/*/resources/codex.exe",
        "%APPDATA%/npm/node_modules/@openai/codex*/**/codex.exe",
        "/usr/local/lib/node_modules/@openai/codex*/**/codex", "/usr/lib/node_modules/@openai/codex*/**/codex",
    ])


def codex_models() -> list[str]:
    data = jload(Path.home() / ".codex" / "models_cache.json", {})
    models = data.get("models", []) if isinstance(data, dict) else []
    return [m.get("slug") for m in models if isinstance(m, dict) and m.get("visibility") == "list" and m.get("slug")]


def rel(p: str) -> str:
    try:
        return str(Path(p).resolve().relative_to(ROOT))
    except Exception:
        return p


def safe_doc(path: str) -> Path | None:
    path = path.lstrip("/")
    if ".." in path or "answers/" in path or not path.endswith(".md"):
        return None
    if not any(path == a or path.startswith(a) for a in DOC_ALLOWED):
        return None
    full = (ROOT / path).resolve()
    return full if full.is_file() and ROOT in full.parents else None


def unit_path(uid: str, answers: bool = False) -> Path | None:
    if not re.fullmatch(r"P[12]-\d\d", uid or ""):
        return None
    p = ROOT / "materials" / "grammar" / ("answers" if answers else "") / f"{uid}.md"
    return p if p.is_file() else None


def listening_link(text: str) -> str | None:
    t = text.lower()
    for pat, url in LISTENING_LINKS:
        if re.search(pat, t):
            return url
    return None


def plan_for(day: dt.date):
    p = bd.today_plan(day)
    if not p:
        return None
    cells = p["cells"]
    m = re.search(r"P[12]-\d\d", cells[0])
    return {"date": day.isoformat(), "week": p["week"], "file": p["file"],
            "blocks": [
                {"key": "grammar", "label": "Gramática", "min": 22, "text": cells[0], "unit": m.group(0) if m else None},
                {"key": "listening", "label": "Listening", "min": 15, "text": cells[1], "url": listening_link(cells[1])},
                {"key": "output", "label": "Output", "min": 15, "text": cells[2],
                 "kind": "writing" if "escrita" in cells[2].lower() or "✍" in cells[2] else "speaking"},
                {"key": "srs", "label": "Vocabulário", "min": 8, "text": cells[3]},
            ]}


def state_payload() -> dict:
    today = dt.date.today()
    phase, week, day = bd.phase_info(today)
    plan, d = plan_for(today), today
    if not plan:  # show the next planned day (e.g. before the start date)
        for i in range(1, 15):
            d = today + dt.timedelta(i)
            plan = plan_for(d)
            if plan:
                break
    log = bd.load_log()
    spine = bd.load_spine()
    s = settings()
    return {
        "today": today.isoformat(), "phase": phase, "week": week, "day": day,
        "days_left": max((bd.END - today).days, 0),
        "plan": plan, "plan_is_today": bool(plan and plan["date"] == today.isoformat()),
        "is_review_day": bool(day and day % 7 == 0),
        "checkpoint": bd.CHECKPOINTS.get(today),
        "minutes_total": sum(r["min"] for r in log),
        "sessions": len({r["date"] for r in log}),
        "units_done": sum(1 for u in spine if u["status"] in ("done", "ok")),
        "units_total": len(spine),
        "agents": {"claude": bool(find_claude()), "codex": bool(find_codex())},
        "paths": {"claude": find_claude() or "", "codex": find_codex() or ""}, "os": os.name,
        "settings": s, "codex_models": codex_models(),
    }


def progress_payload() -> dict:
    today = dt.date.today()
    log, spine, errors = bd.load_log(), bd.load_spine(), bd.load_errors()
    by_day: dict[str, int] = {}
    for r in log:
        k = r["date"].isoformat()
        by_day[k] = by_day.get(k, 0) + r["min"]
    days, d = [], bd.START
    while d <= bd.END:
        days.append({"date": d.isoformat(), "min": by_day.get(d.isoformat(), 0),
                     "target": 60 if d < bd.PHASE2 else 150, "cp": bd.CHECKPOINTS.get(d, ""),
                     "past": d < today, "today": d == today, "dow": d.weekday()})
        d += dt.timedelta(1)
    streak, d = 0, today if today.isoformat() in by_day else today - dt.timedelta(1)
    while d.isoformat() in by_day:
        streak, d = streak + 1, d - dt.timedelta(1)
    planned = sum(x["target"] for x in days if x["date"] <= today.isoformat())
    results = [p.relative_to(ROOT).as_posix() for p in sorted((ROOT / "assessments").glob("*resultado*.md"))]
    reviews = [p.relative_to(ROOT).as_posix() for p in sorted((ROOT / "progress/weekly").glob("*.md"))]
    return {
        "minutes": sum(by_day.values()), "planned": planned, "streak": streak, "sessions": len(by_day),
        "days_left": max((bd.END - today).days, 0), "days": days, "spine": spine,
        "errors": errors[:12],
        "recent": [{**r, "date": r["date"].isoformat()} for r in sorted(log, key=lambda r: r["date"], reverse=True)[:10]],
        "checkpoints": [{"date": k.isoformat(), "name": v, "past": k < today} for k, v in bd.CHECKPOINTS.items()],
        "results": results, "reviews": reviews,
    }


def cell(s) -> str:
    return str(s if s is not None else "").replace("|", "/").replace("\n", " ").strip()


def update_spine(uid: str, pct: int) -> str:
    p = ROOT / "plan" / "grammar-spine.md"
    status = "✅" if pct >= 90 else ("☑️" if pct >= 70 else "🔄")
    lines = p.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        if line.startswith(f"| {uid} |"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 7:
                cells[5], cells[6] = status, f"{pct}%"
                lines[i] = "| " + " | ".join(cells) + " |"
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return status


def close_session(d: dict) -> dict:
    row = "| " + " | ".join(cell(x) for x in [
        d.get("date") or dt.date.today().isoformat(), int(d.get("minutes") or 0), d.get("grammar"),
        (f"{d['pct']}%" if str(d.get("pct", "")).strip() not in ("", "None") else "—"),
        d.get("listening"), d.get("output"), d.get("words") or 0, d.get("notes")]) + " |"
    log = ROOT / "progress" / "log.md"
    text = log.read_text(encoding="utf-8")
    log.write_text(text.rstrip("\n") + "\n" + row + "\n", encoding="utf-8")
    (ROOT / "dashboard").mkdir(exist_ok=True)
    (ROOT / "dashboard" / "index.html").write_text(bd.build(dt.date.today()), encoding="utf-8")
    return {"ok": True, "row": row}


def git_save() -> dict:
    def run(*a):
        r = subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
        return r.returncode, (r.stdout + r.stderr).strip()
    out = []
    run("add", "-A")
    code, msg = run("commit", "-m", f"study: {dt.date.today().isoformat()} (app)")
    if code != 0 and "nothing to commit" in msg:
        out.append("Nada de novo para guardar.")
    elif code != 0:
        return {"ok": False, "msg": msg[-600:]}
    else:
        out.append("Commit feito.")
    _, remotes = run("remote")
    if remotes:
        code, msg = run("push")
        out.append("Enviado para o GitHub." if code == 0 else f"Push falhou: {msg[-300:]}")
    else:
        out.append("Sem repositório remoto (o push fica para quando o configurares).")
    return {"ok": True, "msg": " ".join(out)}


# ---------------------------------------------------------------- chat
def chats() -> dict:
    return jload(STATE / "chats.json", {"claude": {"session": None, "messages": []},
                                         "codex": {"session": None, "messages": []}})


def save_chat(agent: str, conv: dict) -> None:
    with LOCK:
        all_ = chats()
        all_[agent] = conv
        jsave(STATE / "chats.json", all_)


def short(v, n=90) -> str:
    v = str(v).replace("\n", " ")
    return v if len(v) <= n else v[: n - 1] + "…"


def claude_tool(name: str, inp: dict) -> str:
    if name in ("Read", "Write", "Edit", "NotebookEdit"):
        verb = {"Read": "Ler", "Write": "Escrever", "Edit": "Editar"}.get(name, name)
        return f"{verb} {rel(inp.get('file_path', ''))}"
    if name == "Bash":
        return f"Comando: {short(inp.get('command', ''))}"
    if name == "Skill":
        return f"Skill: {inp.get('skill') or inp.get('name') or ''}"
    if name in ("WebSearch", "WebFetch"):
        return f"Web: {short(inp.get('query') or inp.get('url') or '')}"
    if name in ("Glob", "Grep"):
        return f"Procurar: {short(inp.get('pattern', ''))}"
    return name


def run_agent(agent: str, text: str, emit) -> None:
    conv = chats()[agent]
    first = not conv.get("session")
    s = settings()
    if agent == "claude":
        binp = find_claude()
        if not binp:
            emit({"t": "error", "v": "Não encontrei o Claude Code (extensão do VS Code ou CLI)."}); return
        cmd = [binp, "-p", text, "--output-format", "stream-json", "--verbose", "--include-partial-messages",
               "--permission-mode", "acceptEdits", "--allowedTools", CLAUDE_TOOLS,
               "--append-system-prompt", APP_CONTEXT]
        if s.get("claude_model"):
            cmd += ["--model", s["claude_model"]]
        if conv.get("session"):
            cmd += ["--resume", conv["session"]]
    else:
        binp = find_codex()
        if not binp:
            emit({"t": "error", "v": "Não encontrei o Codex CLI."}); return
        prompt = (APP_CONTEXT + "\n\n---\n\n" + text) if first else text
        model = s.get("codex_model") or "gpt-6-sol"
        # In Docker the container is the sandbox (Codex's own sandbox needs kernel features
        # containers usually lack), so compose.yaml sets CODEX_SANDBOX=danger-full-access.
        sandbox = os.environ.get("CODEX_SANDBOX", "workspace-write")
        if conv.get("session"):
            cmd = [binp, "exec", "resume", conv["session"], "--json", "-m", model,
                   "-c", f'sandbox_mode="{sandbox}"', "--skip-git-repo-check", prompt]
        else:
            cmd = [binp, "exec", "--json", "-m", model, "-s", sandbox, "--skip-git-repo-check", prompt]

    conv["messages"].append({"role": "user", "text": text, "ts": dt.datetime.now().isoformat(timespec="seconds")})
    reply = {"role": "assistant", "text": "", "tools": [], "agent": agent,
             "ts": dt.datetime.now().isoformat(timespec="seconds")}
    try:
        proc = subprocess.Popen(cmd, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace", bufsize=1)
    except OSError as e:
        emit({"t": "error", "v": f"Falha ao iniciar o agente: {e}"}); return
    RUNNING[agent] = proc
    got_text_in_msg = False

    def add_text(v: str):
        reply["text"] += v
        emit({"t": "text", "v": v})

    def add_tool(v: str):
        reply["tools"].append(v)
        emit({"t": "tool", "v": v})

    try:
        for line in proc.stdout:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            et = e.get("type")
            if agent == "claude":
                if et == "system" and e.get("session_id"):
                    conv["session"] = e["session_id"]
                elif et == "stream_event":
                    ev = e.get("event", {})
                    if ev.get("type") == "message_start":
                        if reply["text"] and not reply["text"].endswith("\n\n"):
                            add_text("\n\n")
                    elif ev.get("type") == "content_block_delta" and ev.get("delta", {}).get("type") == "text_delta":
                        add_text(ev["delta"]["text"])
                elif et == "assistant":
                    for b in e.get("message", {}).get("content", []):
                        if b.get("type") == "tool_use":
                            add_tool(claude_tool(b.get("name", ""), b.get("input") or {}))
                elif et == "result":
                    if e.get("session_id"):
                        conv["session"] = e["session_id"]
                    if e.get("is_error"):
                        emit({"t": "error", "v": short(e.get("result") or "Erro do Claude", 400)})
            else:
                if et == "thread.started":
                    conv["session"] = e.get("thread_id")
                elif et in ("item.started", "item.completed"):
                    it = e.get("item", {})
                    ty = it.get("type")
                    if et == "item.completed" and ty == "agent_message":
                        if reply["text"]:
                            add_text("\n\n")
                        add_text(it.get("text", ""))
                    elif et == "item.started" and ty == "command_execution":
                        add_tool(f"Comando: {short(it.get('command', ''))}")
                    elif et == "item.completed" and ty == "file_change":
                        for ch in it.get("changes", []):
                            add_tool(f"Editar {rel(ch.get('path', ''))}")
                    elif et == "item.completed" and ty == "web_search":
                        add_tool(f"Web: {short(it.get('query', ''))}")
                elif et in ("turn.failed", "error"):
                    msg = e.get("message") or (e.get("error") or {}).get("message") or json.dumps(e)[:300]
                    emit({"t": "error", "v": short(msg, 400)})
        proc.wait()
        if proc.returncode not in (0, None) and not reply["text"]:
            err = (proc.stderr.read() or "").strip().splitlines()
            tail = [l for l in err if "rmcp" not in l and "mcp" not in l.lower()][-3:]
            emit({"t": "error", "v": short(" ".join(tail) or f"O agente terminou com código {proc.returncode}", 400)})
    finally:
        RUNNING.pop(agent, None)
        if reply["text"] or reply["tools"]:
            conv["messages"].append(reply)
        save_chat(agent, conv)
        emit({"t": "done", "session": conv.get("session")})


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "EnglishBoost/1.0"

    def log_message(self, fmt, *args):  # quieter console
        if "/api/" in (args[0] if args else ""):
            return
        sys.stderr.write("%s\n" % (fmt % args))

    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").split(":")[0]
        return host in ("127.0.0.1", "localhost")

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, data, code: int = 200):
        self._send(code, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return {}

    def do_GET(self):
        if not self._host_ok():
            return self._send(403, b"forbidden", "text/plain")
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        p = u.path
        if p in ("/", "/index.html"):
            html = (STATIC / "index.html").read_text(encoding="utf-8").replace("__TOKEN__", TOKEN)
            return self._send(200, html.encode(), "text/html; charset=utf-8")
        if p.startswith("/static/"):
            f = (STATIC / p[len("/static/"):]).resolve()
            if STATIC in f.parents and f.is_file():
                ct = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml"}.get(f.suffix, "application/octet-stream")
                return self._send(200, f.read_bytes(), ct + "; charset=utf-8")
            return self._send(404, b"not found", "text/plain")
        if p == "/api/state":
            return self._json(state_payload())
        if p == "/api/progress":
            return self._json(progress_payload())
        if p == "/api/spine":
            units = bd.load_spine()
            for x in units:
                x["exists"] = bool(unit_path(x["id"]))
            return self._json(units)
        if p == "/api/unit":
            f = unit_path(q.get("id", ""))
            if not f:
                return self._json({"error": "missing"}, 404)
            return self._json({"id": q["id"], "md": f.read_text(encoding="utf-8"), "has_key": bool(unit_path(q["id"], True))})
        if p == "/api/unit/key":
            f = unit_path(q.get("id", ""), answers=True)
            if not f:
                return self._json({"error": "missing"}, 404)
            key = {}
            for line in f.read_text(encoding="utf-8").splitlines():
                m = re.match(r"^\s*(\d+)\.\s+(.+)$", line)
                if m:
                    key[m.group(1)] = m.group(2).strip()
            return self._json({"key": key})
        if p == "/api/doc":
            f = safe_doc(q.get("path", ""))
            if not f:
                return self._json({"error": "not allowed"}, 404)
            return self._json({"path": rel(str(f)), "md": f.read_text(encoding="utf-8")})
        if p == "/api/chat/history":
            agent = q.get("agent", "claude")
            c = chats().get(agent, {"messages": []})
            return self._json({"messages": c.get("messages", [])[-80:], "running": agent in RUNNING})
        return self._send(404, b"not found", "text/plain")

    def do_POST(self):
        if not self._host_ok() or self.headers.get("X-Token") != TOKEN:
            return self._send(403, b"forbidden", "text/plain")
        p = urlparse(self.path).path
        d = self._body()
        if p == "/api/chat/send":
            agent = d.get("agent") if d.get("agent") in ("claude", "codex") else "claude"
            text = (d.get("text") or "").strip()
            if not text:
                return self._json({"error": "empty"}, 400)
            if agent in RUNNING:
                return self._json({"error": "O agente ainda está a responder."}, 409)
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            alive = {"ok": True}

            def emit(obj):
                if not alive["ok"]:
                    return
                try:
                    self.wfile.write((json.dumps(obj, ensure_ascii=False) + "\n").encode())
                    self.wfile.flush()
                except OSError:
                    alive["ok"] = False  # browser closed; keep running so the reply is saved
            run_agent(agent, text, emit)
            return
        if p == "/api/chat/stop":
            proc = RUNNING.get(d.get("agent"))
            if proc:
                proc.terminate()
            return self._json({"ok": True})
        if p == "/api/chat/reset":
            agent = d.get("agent")
            if agent in ("claude", "codex"):
                save_chat(agent, {"session": None, "messages": []})
            return self._json({"ok": True})
        if p == "/api/unit/result":
            uid = d.get("id", "")
            if not unit_path(uid):
                return self._json({"error": "missing"}, 404)
            pct = max(0, min(100, int(d.get("pct", 0))))
            status = update_spine(uid, pct)
            out = ROOT / "progress" / "exercises"
            out.mkdir(parents=True, exist_ok=True)
            jsave(out / f"{uid}-{dt.date.today().isoformat()}.json",
                  {"id": uid, "date": dt.date.today().isoformat(), "pct": pct,
                   "score": d.get("score"), "total": d.get("total"), "items": d.get("items", [])})
            return self._json({"ok": True, "status": status})
        if p == "/api/session/close":
            return self._json(close_session(d))
        if p == "/api/settings":
            s = settings()
            for k in ("codex_model", "claude_model", "claude_bin", "codex_bin"):
                if k in d:
                    s[k] = str(d[k]).strip().strip('"')[:400]
            jsave(STATE / "settings.json", s)
            return self._json(s)
        if p == "/api/git/save":
            return self._json(git_save())
        return self._send(404, b"not found", "text/plain")


def main():
    for stream in (sys.stdout, sys.stderr):  # Windows consoles/redirects may not be UTF-8
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="English Boost web app")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--host", default="127.0.0.1", help="0.0.0.0 only inside Docker (compose publishes it on 127.0.0.1)")
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    url = f"http://127.0.0.1:{a.port}"
    print(f"English Boost a correr em {url}  (Ctrl+C para sair)")
    print(f"  Claude: {find_claude() or 'não encontrado'}")
    print(f"  Codex:  {find_codex() or 'não encontrado'}")
    if not a.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nAté amanhã! 👋")
    finally:
        for proc in list(RUNNING.values()):
            proc.terminate()


if __name__ == "__main__":
    main()
