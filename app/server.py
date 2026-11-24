#!/usr/bin/env python3
"""English Boost: local web app.

Run:   ./estudar.sh | estudar.bat | docker compose up -d   (or: python3 app/server.py [--port 8765])
Open:  http://127.0.0.1:8765

Python standard library only. The chat runs the locally installed Claude Code and Codex
CLIs headless; they use your own subscriptions (no API keys). The server listens on
127.0.0.1 (Docker: 0.0.0.0 inside the container, published on 127.0.0.1 only), checks the
Host header, and every POST needs the per-run token embedded in the page.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import errno
import glob
import json
import os
import platform
import re
import secrets
import shutil
import signal
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "app" / "static"


def _state_dir() -> Path:
    """app/state, or a per-user fallback when the project folder is read-only (e.g. a
    Docker bind mount owned by another UID): the app keeps working instead of crashing."""
    for cand in (os.environ.get("EB_STATE_DIR"), ROOT / "app" / "state", Path.home() / ".english-boost" / "state"):
        if not cand:
            continue
        try:
            d = Path(cand)
            d.mkdir(parents=True, exist_ok=True)
            probe = d / ".write-test"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
            return d
        except OSError:
            continue
    raise SystemExit("Sem nenhuma pasta com permissão de escrita para o estado da app (define EB_STATE_DIR).")


STATE = _state_dir()
sys.path.insert(0, str(ROOT / "scripts"))
import build_dashboard as bd  # noqa: E402  (reuse the dashboard parsers)

TOKEN = secrets.token_urlsafe(24)
PORT = 8765
IS_WIN = os.name == "nt"
ENV_ID = "docker" if Path("/.dockerenv").exists() else f"native:{platform.node()}"
AGENT_TIMEOUT = int(os.environ.get("AGENT_TIMEOUT", "1800"))  # seconds; a hung agent is killed
MAX_MESSAGES = 400          # per agent, kept in app/state/chats.json
MAX_BODY = 2 * 1024 * 1024  # bytes per request

CHAT_LOCK = threading.Lock()   # app/state/chats.json
FILE_LOCK = threading.Lock()   # project files written by the app (log, spine, dashboard)
GIT_LOCK = threading.Lock()
SLOTS_LOCK = threading.Lock()  # RUNNING
RUNNING: dict[str, subprocess.Popen | None] = {}  # agent -> process (None while starting)
STOPPED: set[str] = set()

DOC_ALLOWED = ("plan/", "research/", "resources/", "materials/grammar/", "materials/generated/",
               "assessments/", "progress/", "speaking/", "writing/", "README.md", "AGENTS.md")
LISTENING_LINKS = [
    (r"voa.*let'?s learn", "https://learningenglish.voanews.com/p/5644.html"),
    (r"\bvoa\b", "https://learningenglish.voanews.com"),
    (r"esl ?lab", "https://www.esl-lab.com/easy/"),
    (r"elllo", "https://www.elllo.org"),
    (r"bbc", "https://www.bbc.co.uk/learningenglish"),
    (r"all ears", "https://www.allearsenglish.com"),
    (r"\bted\b", "https://ed.ted.com"),
    (r"statquest", "https://www.youtube.com/@statquest"),
    (r"news in levels", "https://www.newsinlevels.com"),
]
RESUME_FAILED = re.compile(r"no conversation found|no rollout found|could not find (?:the )?(?:session|thread|conversation)"
                           r"|(?:session|thread|conversation)[^\n]{0,40}not found|failed to resume|unknown (?:session|thread)", re.I)

APP_CONTEXT = """Contexto: estás a falar com o Juan através da app web local "English Boost", não do VS Code.
- Respostas curtas e bem estruturadas. Explicações em português (PT); prática em inglês. Segue AGENTS.md e usa as skills do projeto.
- A app tem um painel lateral. Para abrir material, escreve numa linha sozinha um marcador: [[abrir:hoje]] (plano do dia), [[abrir:P1-02]] (unidade de gramática interativa), [[abrir:doc:caminho/ficheiro.md]] (documento) ou [[abrir:url:https://...]] (link externo).
- Quando o Juan pedir o estudo do dia, abre [[abrir:hoje]] e a unidade de gramática do dia, e guia-o bloco a bloco.
- Os exercícios de gramática são corrigidos na app. O fecho da sessão (log, espinha, dashboard) e o commit são feitos pelos botões da app: não faças isso tu e não peças comandos de terminal. Atualiza só o progress/error-log.md quando houver erros recorrentes."""

CLAUDE_TOOLS = ",".join([
    "Read", "Write", "Edit", "Glob", "Grep", "Skill", "WebSearch", "WebFetch", "TodoWrite",
    "Bash(date*)", "Bash(ls*)", "Bash(cat*)", "Bash(pdftotext*)", "Bash(curl -s*)",
    "Bash(python3 scripts/build_dashboard.py*)", "Bash(python scripts/build_dashboard.py*)",
    "Bash(git status*)", "Bash(git log*)", "Bash(git diff*)",
])


class BadRequest(Exception):
    """Client error: becomes a 400 with the message."""


# ---------------------------------------------------------------- small helpers
def jload(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def atomic_write(path: Path, text: str) -> None:
    """Write via a temp file + rename so a crash or a concurrent reader never sees half a file."""
    tmp = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    for attempt in range(5):  # Windows: the target can be briefly locked by an editor/indexer
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.1)


def jsave(path: Path, data) -> None:
    atomic_write(path, json.dumps(data, ensure_ascii=False, indent=1))


_CACHE: dict[str, tuple[float, object]] = {}


def cached(key: str, ttl: float, fn):
    now = time.monotonic()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    val = fn()
    _CACHE[key] = (now, val)
    return val


def settings() -> dict:
    s = {"codex_model": "gpt-6-sol", "claude_model": "", "claude_bin": "", "codex_bin": ""}
    data = jload(STATE / "settings.json", {})
    if isinstance(data, dict):
        s.update({k: str(v) for k, v in data.items() if k in s})
    return s


def to_int(v, name: str, lo: int, hi: int, default=None) -> int | None:
    if v in (None, ""):
        return default
    try:
        n = int(float(str(v).strip().rstrip("%")))
    except ValueError:
        raise BadRequest(f"{name} inválido") from None
    return max(lo, min(hi, n))


# ---------------------------------------------------------------- agent discovery
def _ver(path: str):
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", path)
    return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)


def _usable(p: str | None) -> bool:
    # Windows .cmd/.bat shims (npm) mangle multi-line arguments; we only accept real .exe files
    # (or .py scripts, run with this Python, which the test-suite uses as fake agents).
    if not p or not os.path.isfile(p):
        return False
    if p.lower().endswith(".py"):
        return True
    if IS_WIN:
        return p.lower().endswith(".exe")
    return os.access(p, os.X_OK)


def _first(cands: list[str]) -> str | None:
    found = []
    for pat in cands:
        found += [p for p in glob.glob(os.path.expanduser(os.path.expandvars(pat)), recursive=True) if _usable(p)]
    return sorted(found, key=_ver)[-1] if found else None


def _which(name: str) -> str | None:
    for n in ([name + ".exe", name] if IS_WIN else [name]):
        p = shutil.which(n)
        if p and _usable(p):
            return p
    return None


def _find_claude() -> str | None:
    for p in (os.environ.get("CLAUDE_BIN"), settings().get("claude_bin")):
        if _usable(p):
            return p
    return _which("claude") or _first([
        "~/.local/bin/claude", "~/.local/bin/claude.exe", "~/.claude/local/claude",
        "~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude*",
        "~/.vscode-insiders/extensions/anthropic.claude-code-*/resources/native-binary/claude*",
        "~/.cursor/extensions/anthropic.claude-code-*/resources/native-binary/claude*",
        "%APPDATA%/npm/node_modules/@anthropic-ai/claude-code*/**/claude.exe",
    ])


def _find_codex() -> str | None:
    for p in (os.environ.get("CODEX_BIN"), settings().get("codex_bin")):
        if _usable(p):
            return p
    return _which("codex") or _first([
        "/usr/lib/chatgpt/resources/codex", "/Applications/Codex.app/Contents/Resources/codex",
        "~/.local/bin/codex", "~/.local/bin/codex.exe",
        "%LOCALAPPDATA%/Programs/*/resources/codex.exe",
        "%APPDATA%/npm/node_modules/@openai/codex*/**/codex.exe",
        "/usr/local/lib/node_modules/@openai/codex*/**/codex", "/usr/lib/node_modules/@openai/codex*/**/codex",
    ])


def find_claude() -> str | None:
    return cached("claude_bin", 30, _find_claude)


def find_codex() -> str | None:
    return cached("codex_bin", 30, _find_codex)


def launcher(path: str) -> list[str]:
    return [sys.executable, path] if path.lower().endswith(".py") else [path]


def codex_models() -> list[str]:
    home = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
    data = jload(home / "models_cache.json", {})
    models = data.get("models", []) if isinstance(data, dict) else []
    return [m.get("slug") for m in models if isinstance(m, dict) and m.get("visibility") == "list" and m.get("slug")]


# ---------------------------------------------------------------- project files
def rel(p: str) -> str:
    try:
        return Path(p).resolve().relative_to(ROOT).as_posix()
    except Exception:
        return str(p)


def safe_doc(path: str) -> Path | None:
    path = (path or "").replace("\\", "/").lstrip("/")
    if not path or ".." in path.split("/") or ":" in path or "answers/" in path or not path.endswith(".md"):
        return None
    if not any(path == a or path.startswith(a) for a in DOC_ALLOWED):
        return None
    full = (ROOT / path).resolve()
    return full if full.is_file() and ROOT.resolve() in full.parents else None


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
    cells = (p["cells"] + ["", "", "", ""])[:4]
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
    plan = plan_for(today)
    if not plan:  # show the next planned day (e.g. before the start date)
        for i in range(1, 15):
            plan = plan_for(today + dt.timedelta(i))
            if plan:
                break
    log, spine = bd.load_log(), bd.load_spine()
    claude, codex = find_claude(), find_codex()
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
        "agents": {"claude": bool(claude), "codex": bool(codex)},
        "paths": {"claude": claude or "", "codex": codex or ""}, "os": os.name, "env": ENV_ID,
        "settings": settings(), "codex_models": cached("codex_models", 60, codex_models),
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
    reviews = [p.relative_to(ROOT).as_posix() for p in sorted((ROOT / "progress" / "weekly").glob("*.md"))]
    return {
        "minutes": sum(by_day.values()), "planned": planned, "streak": streak, "sessions": len(by_day),
        "days_left": max((bd.END - today).days, 0), "days": days, "spine": spine,
        "errors": errors[:12],
        "recent": [{**r, "date": r["date"].isoformat()} for r in sorted(log, key=lambda r: r["date"], reverse=True)[:10]],
        "checkpoints": [{"date": k.isoformat(), "name": v, "past": k < today} for k, v in bd.CHECKPOINTS.items()],
        "results": results, "reviews": reviews,
    }


def cell(s) -> str:
    return re.sub(r"\s+", " ", str(s if s is not None else "").replace("|", "/")).strip()[:300]


def update_spine(uid: str, pct: int) -> str | None:
    p = ROOT / "plan" / "grammar-spine.md"
    status = "✅" if pct >= 90 else ("☑️" if pct >= 70 else "🔄")
    with FILE_LOCK:
        lines = p.read_text(encoding="utf-8").splitlines()
        found = False
        for i, line in enumerate(lines):
            if line.startswith(f"| {uid} |"):
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if len(cells) >= 7:
                    cells[5], cells[6] = status, f"{pct}%"
                    lines[i] = "| " + " | ".join(cells) + " |"
                    found = True
        if not found:
            return None
        atomic_write(p, "\n".join(lines) + "\n")
    return status


LOG_HEADER = ("# Registo de sessões\n\n| Data | Min | Gramática | % | Listening | Output | Palavras novas | Notas |\n"
              "|---|---|---|---|---|---|---|---|\n")


def rebuild_dashboard() -> bool:
    try:
        (ROOT / "dashboard").mkdir(exist_ok=True)
        atomic_write(ROOT / "dashboard" / "index.html", bd.build(dt.date.today()))
        return True
    except Exception:
        traceback.print_exc()
        return False


def close_session(d: dict) -> dict:
    day = str(d.get("date") or dt.date.today().isoformat())
    try:
        dt.date.fromisoformat(day)
    except ValueError:
        raise BadRequest("data inválida") from None
    minutes = to_int(d.get("minutes"), "minutos", 0, 600, 0)
    pct = to_int(d.get("pct"), "percentagem", 0, 100, None)
    words = to_int(d.get("words"), "palavras", 0, 500, 0)
    row = "| " + " | ".join(cell(x) for x in [
        day, minutes, d.get("grammar"), f"{pct}%" if pct is not None else "—",
        d.get("listening"), d.get("output"), words, d.get("notes")]) + " |"
    log = ROOT / "progress" / "log.md"
    with FILE_LOCK:
        text = log.read_text(encoding="utf-8") if log.exists() else LOG_HEADER
        atomic_write(log, text.rstrip("\n") + "\n" + row + "\n")
        dash = rebuild_dashboard()
    return {"ok": True, "row": row, "dashboard": dash}


# ---------------------------------------------------------------- git
def _git(*args, timeout=90, env=None):
    e = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never", **(env or {})}
    try:
        r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout, env=e, stdin=subprocess.DEVNULL)
        return r.returncode, (r.stdout + r.stderr).strip()
    except FileNotFoundError:
        return 127, "git não está instalado"
    except subprocess.TimeoutExpired:
        return 124, "o git demorou demasiado (rede ou credenciais?)"


def _git_identity() -> list[str]:
    """`-c user.name=… -c user.email=…` when git has no identity (e.g. a fresh container)."""
    name = _git("config", "user.name")[1] if _git("config", "user.name")[0] == 0 else ""
    email = _git("config", "user.email")[1] if _git("config", "user.email")[0] == 0 else ""
    if name and email:
        return []
    if shutil.which("gh"):
        try:
            r = subprocess.run(["gh", "api", "user", "--jq", '[.login, (.id|tostring), (.name // "")] | join("\\n")'],
                               capture_output=True, text=True, timeout=20, stdin=subprocess.DEVNULL)
            parts = r.stdout.strip().split("\n") if r.returncode == 0 else []
            if len(parts) >= 2 and parts[0]:
                name = name or (parts[2] if len(parts) > 2 and parts[2] else parts[0])
                email = email or f"{parts[1]}+{parts[0]}@users.noreply.github.com"
        except (OSError, subprocess.TimeoutExpired):
            pass
    return ["-c", f"user.name={name or 'English Boost'}", "-c", f"user.email={email or 'english-boost@localhost'}"]


def git_save() -> dict:
    with GIT_LOCK:
        code, msg = _git("rev-parse", "--is-inside-work-tree")
        if code != 0:
            return {"ok": False, "msg": "Esta pasta não é um repositório Git."}
        code, msg = _git("add", "-A")
        if code != 0:
            return {"ok": False, "msg": msg[-600:]}
        if _git("diff", "--cached", "--quiet")[0] == 0:
            out = ["Nada de novo para guardar."]
        else:
            code, msg = _git(*_git_identity(), "commit", "-m", f"study: {dt.date.today().isoformat()} (app)")
            if code != 0:
                return {"ok": False, "msg": msg[-600:]}
            out = ["Commit feito."]
        if not _git("remote")[1]:
            out.append("Sem repositório remoto (o push fica para quando o configurares).")
            return {"ok": True, "msg": " ".join(out)}
        has_upstream = _git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")[0] == 0
        if has_upstream:
            code, ahead = _git("rev-list", "--count", "@{u}..HEAD")
            if code == 0 and ahead.strip() == "0":
                out.append("O GitHub já está atualizado.")
                return {"ok": True, "msg": " ".join(out)}
        code, msg = _git("push") if has_upstream else _git("push", "-u", "origin", "HEAD")
        out.append("Enviado para o GitHub." if code == 0 else f"Push falhou: {msg[-300:]}")
        return {"ok": code == 0, "msg": " ".join(out)}


# ---------------------------------------------------------------- chat
def _empty_conv() -> dict:
    return {"session": None, "env": ENV_ID, "gen": 0, "messages": []}


def chats() -> dict:
    data = jload(STATE / "chats.json", {})
    data = data if isinstance(data, dict) else {}
    for a in ("claude", "codex"):
        if not isinstance(data.get(a), dict):
            data[a] = _empty_conv()
        data[a].setdefault("messages", [])
        data[a].setdefault("gen", 0)
    return data


def save_chat(agent: str, conv: dict, only_if_gen: int | None = None) -> bool:
    with CHAT_LOCK:
        all_ = chats()
        if only_if_gen is not None and all_[agent].get("gen", 0) != only_if_gen:
            return False  # the conversation was reset while the agent was answering
        conv["messages"] = conv.get("messages", [])[-MAX_MESSAGES:]
        all_[agent] = conv
        jsave(STATE / "chats.json", all_)
        return True


def reset_chat(agent: str) -> None:
    with CHAT_LOCK:
        all_ = chats()
        gen = all_[agent].get("gen", 0) + 1
        all_[agent] = {**_empty_conv(), "gen": gen}
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


def kill_tree(proc: subprocess.Popen) -> None:
    """Stop the agent and everything it started (shell commands, sub-agents)."""
    if proc.poll() is not None:
        return
    try:
        if IS_WIN:
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True, timeout=15)
        else:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=4)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
    except (OSError, subprocess.SubprocessError):
        try:
            proc.kill()
        except OSError:
            pass


def build_cmd(agent: str, conv: dict) -> tuple[list[str] | None, str, str]:
    """Return (command, stdin_prefix, error). The user's text goes through stdin, never argv:
    no option injection, no Windows 32K command-line limit."""
    s = settings()
    if agent == "claude":
        binp = find_claude()
        if not binp:
            return None, "", "Não encontrei o Claude Code (extensão do VS Code ou CLI). Vê ⚙ Definições."
        cmd = launcher(binp) + ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
                                "--permission-mode", "acceptEdits", "--allowedTools", CLAUDE_TOOLS,
                                "--append-system-prompt", APP_CONTEXT]
        if s.get("claude_model"):
            cmd += ["--model", s["claude_model"]]
        if conv.get("session"):
            cmd += ["--resume", conv["session"]]
        return cmd, "", ""
    binp = find_codex()
    if not binp:
        return None, "", "Não encontrei o Codex CLI. Vê ⚙ Definições."
    model = s.get("codex_model") or "gpt-6-sol"
    # In Docker the container is the sandbox (Codex's own sandbox needs kernel features
    # containers usually lack), so compose.yaml sets CODEX_SANDBOX=danger-full-access.
    sandbox = os.environ.get("CODEX_SANDBOX", "workspace-write")
    if conv.get("session"):
        cmd = launcher(binp) + ["exec", "resume", conv["session"], "--json", "-m", model,
                                "-c", f'sandbox_mode="{sandbox}"', "--skip-git-repo-check", "-"]
        return cmd, "", ""
    cmd = launcher(binp) + ["exec", "--json", "-m", model, "-s", sandbox, "--skip-git-repo-check", "-"]
    return cmd, APP_CONTEXT + "\n\n---\n\n", ""


def _attempt(agent: str, cmd: list[str], stdin_text: str, conv: dict, reply: dict, emit) -> dict:
    """Run one agent process and translate its JSON events. Returns a summary dict."""
    errors: list[str] = []
    res = {"errors": errors, "code": None, "stderr": "", "output": False, "timeout": False}
    kw = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if IS_WIN else {"start_new_session": True}
    try:
        proc = subprocess.Popen(cmd, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8", errors="replace", bufsize=1, **kw)
    except OSError as e:
        errors.append(f"Falha ao iniciar o agente: {e}")
        return res
    with SLOTS_LOCK:
        RUNNING[agent] = proc
        stop_now = agent in STOPPED  # "Parar" pressed while the process was starting
    if stop_now:
        kill_tree(proc)
    stderr_tail: collections.deque[str] = collections.deque(maxlen=60)

    def drain_stderr():  # without this, a chatty agent fills the pipe and both sides block
        for line in proc.stderr:
            stderr_tail.append(line.rstrip())

    def feed_stdin():
        try:
            proc.stdin.write(stdin_text)
            proc.stdin.close()
        except (OSError, ValueError):
            pass

    threading.Thread(target=drain_stderr, daemon=True).start()
    threading.Thread(target=feed_stdin, daemon=True).start()

    def on_timeout():
        res["timeout"] = True
        kill_tree(proc)
    watchdog = threading.Timer(AGENT_TIMEOUT, on_timeout)
    watchdog.daemon = True
    watchdog.start()

    def add_text(v: str):
        if v:
            res["output"] = True
            reply["text"] += v
            emit({"t": "text", "v": v})

    def add_tool(v: str):
        res["output"] = True
        reply["tools"].append(v)
        emit({"t": "tool", "v": v})

    streamed = False  # Claude: did this message arrive as deltas? (fallback for CLIs without partials)
    try:
        for line in proc.stdout:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if not isinstance(e, dict):
                continue
            et = e.get("type")
            if agent == "claude":
                if et == "system" and e.get("session_id"):
                    conv["session"] = e["session_id"]
                elif et == "stream_event":
                    ev = e.get("event") or {}
                    if ev.get("type") == "message_start":
                        streamed = False
                        if reply["text"] and not reply["text"].endswith("\n\n"):
                            add_text("\n\n")
                    elif ev.get("type") == "content_block_delta" and (ev.get("delta") or {}).get("type") == "text_delta":
                        streamed = True
                        add_text(ev["delta"].get("text", ""))
                elif et == "assistant":
                    for b in (e.get("message") or {}).get("content") or []:
                        if b.get("type") == "tool_use":
                            add_tool(claude_tool(b.get("name", ""), b.get("input") or {}))
                        elif b.get("type") == "text" and not streamed:
                            if reply["text"] and not reply["text"].endswith("\n\n"):
                                add_text("\n\n")
                            add_text(b.get("text", ""))
                elif et == "result":
                    if e.get("session_id"):
                        conv["session"] = e["session_id"]
                    if e.get("is_error"):
                        errors.append(short(e.get("result") or "Erro do Claude", 400))
                    elif not reply["text"] and e.get("result"):
                        add_text(str(e["result"]))
            else:
                if et == "thread.started":
                    conv["session"] = e.get("thread_id") or conv.get("session")
                elif et in ("item.started", "item.completed"):
                    it = e.get("item") or {}
                    ty = it.get("type")
                    if et == "item.completed" and ty == "agent_message":
                        if reply["text"]:
                            add_text("\n\n")
                        add_text(it.get("text", ""))
                    elif et == "item.started" and ty == "command_execution":
                        add_tool(f"Comando: {short(it.get('command', ''))}")
                    elif et == "item.completed" and ty == "file_change":
                        for ch in it.get("changes") or []:
                            add_tool(f"Editar {rel(ch.get('path', ''))}")
                    elif et == "item.completed" and ty == "web_search":
                        add_tool(f"Web: {short(it.get('query', ''))}")
                elif et in ("turn.failed", "error"):
                    msg = e.get("message") or (e.get("error") or {}).get("message") or json.dumps(e)[:300]
                    errors.append(short(msg, 400))
        proc.wait()
    finally:
        watchdog.cancel()
        if proc.poll() is None:
            kill_tree(proc)
        res["code"] = proc.returncode
        time.sleep(0.05)  # let the stderr thread catch the last lines
        res["stderr"] = "\n".join(l for l in stderr_tail if "rmcp" not in l and "mcp" not in l.lower())
    return res


def run_agent(agent: str, text: str, emit) -> None:
    """Run one chat turn. The caller must have reserved the agent slot (reserve())."""
    conv = chats()[agent]
    gen = conv.get("gen", 0)
    notice = None
    if conv.get("session") and conv.get("env") != ENV_ID:
        conv["session"] = None  # sessions live in each environment's own CLI store (native vs Docker)
        notice = "Nova conversa neste ambiente (o histórico anterior continua visível)."
    conv["env"] = ENV_ID
    conv["messages"].append({"role": "user", "text": text, "ts": dt.datetime.now().isoformat(timespec="seconds")})
    reply = {"role": "assistant", "text": "", "tools": [], "agent": agent,
             "ts": dt.datetime.now().isoformat(timespec="seconds")}
    if notice:
        reply["tools"].append(notice)
        emit({"t": "tool", "v": notice})
    try:
        for attempt in range(2):
            cmd, prefix, err = build_cmd(agent, conv)
            if not cmd:
                emit({"t": "error", "v": err})
                return
            had_session = bool(conv.get("session"))
            res = _attempt(agent, cmd, prefix + text, conv, reply, emit)
            failed = res["code"] not in (0, None) or res["errors"]
            blob = "\n".join(res["errors"]) + "\n" + res["stderr"]
            if (attempt == 0 and failed and had_session and not res["output"] and agent not in STOPPED
                    and not res["timeout"] and RESUME_FAILED.search(blob)):
                conv["session"] = None  # stale session id: start a fresh conversation once
                note = "A conversa anterior já não existe neste agente; comecei uma nova."
                reply["tools"].append(note)
                emit({"t": "tool", "v": note})
                continue
            break
        if agent in STOPPED:
            emit({"t": "tool", "v": "Parado."})
        elif res["timeout"]:
            emit({"t": "error", "v": f"O agente excedeu o tempo limite ({AGENT_TIMEOUT // 60} min) e foi parado."})
        else:
            for m in res["errors"]:
                emit({"t": "error", "v": m})
            if res["code"] not in (0, None) and not reply["text"] and not res["errors"]:
                tail = res["stderr"].strip().splitlines()[-3:]
                emit({"t": "error", "v": short(" ".join(tail) or f"O agente terminou com código {res['code']}", 400)})
    finally:
        if reply["text"] or len(reply["tools"]) > (1 if notice else 0):
            conv["messages"].append(reply)
        conv["gen"] = gen
        save_chat(agent, conv, only_if_gen=gen)
        release(agent)
        emit({"t": "done", "session": conv.get("session")})


def reserve(agent: str) -> bool:
    with SLOTS_LOCK:
        if agent in RUNNING:
            return False
        RUNNING[agent] = None
        STOPPED.discard(agent)
        return True


def release(agent: str) -> None:
    with SLOTS_LOCK:
        RUNNING.pop(agent, None)


def stop_agent(agent: str) -> bool:
    with SLOTS_LOCK:
        proc = RUNNING.get(agent)
        if agent in RUNNING:
            STOPPED.add(agent)
    if proc:
        kill_tree(proc)
    return proc is not None


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "EnglishBoost/1.1"

    def log_message(self, fmt, *args):  # quieter console: only non-API requests
        if args and "/api/" in str(args[0]):
            return
        sys.stderr.write("%s\n" % (fmt % args))

    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").strip().lower()
        if host.startswith("["):
            host = host[: host.find("]") + 1]
        else:
            host = host.split(":")[0]
        return host in ("127.0.0.1", "localhost", "[::1]")

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)
        self._sent = True

    def _json(self, data, code: int = 200):
        self._send(code, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _body(self) -> dict:
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise BadRequest("Content-Length inválido") from None
        if n < 0 or n > MAX_BODY:
            raise BadRequest("pedido demasiado grande")
        raw = self.rfile.read(n) if n else b""
        if not raw:
            return {}
        try:
            d = json.loads(raw)
        except ValueError:
            raise BadRequest("JSON inválido") from None
        if not isinstance(d, dict):
            raise BadRequest("JSON inválido")
        return d

    def _safely(self, fn):
        self._sent = False
        try:
            fn()
        except BadRequest as e:
            if not self._sent:
                self._json({"error": str(e)}, 400)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # never leave the browser with a dropped connection
            traceback.print_exc()
            if not self._sent:
                try:
                    self._json({"error": f"erro interno: {type(e).__name__}: {e}"}, 500)
                except OSError:
                    pass

    def do_GET(self):
        self._safely(self._get)

    def do_POST(self):
        self._safely(self._post)

    def _get(self):
        if not self._host_ok():
            return self._send(403, b"forbidden", "text/plain")
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        p = u.path
        if p in ("/", "/index.html"):
            html = (STATIC / "index.html").read_text(encoding="utf-8").replace("__TOKEN__", TOKEN)
            return self._send(200, html.encode(), "text/html; charset=utf-8")
        if p in ("/guia", "/guia.html"):
            f = ROOT / "docs" / "guia.html"
            return self._send(200, f.read_bytes(), "text/html; charset=utf-8") if f.is_file() else self._send(404, b"not found", "text/plain")
        if p.startswith("/static/"):
            f = (STATIC / p[len("/static/"):]).resolve()
            if STATIC.resolve() in f.parents and f.is_file():
                ct = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml"}.get(f.suffix, "application/octet-stream")
                return self._send(200, f.read_bytes(), ct + "; charset=utf-8")
            return self._send(404, b"not found", "text/plain")
        if p == "/api/health":
            return self._json({"ok": True, "env": ENV_ID, "agents": {"claude": bool(find_claude()), "codex": bool(find_codex())}})
        if p == "/api/token":  # same-origin only (no CORS headers): lets an open tab recover after a restart
            return self._json({"token": TOKEN})
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
                if m and m.group(1) not in key:
                    key[m.group(1)] = m.group(2).strip()
            return self._json({"key": key})
        if p == "/api/doc":
            f = safe_doc(q.get("path", ""))
            if not f:
                return self._json({"error": "not allowed"}, 404)
            return self._json({"path": rel(str(f)), "md": f.read_text(encoding="utf-8")})
        if p == "/api/chat/history":
            agent = q.get("agent", "claude")
            if agent not in ("claude", "codex"):
                raise BadRequest("agente inválido")
            c = chats()[agent]
            return self._json({"messages": c.get("messages", [])[-80:], "running": agent in RUNNING})
        return self._send(404, b"not found", "text/plain")

    def _post(self):
        if not self._host_ok() or self.headers.get("X-Token") != TOKEN:
            return self._send(403, b"forbidden", "text/plain")
        p = urlparse(self.path).path
        d = self._body()
        if p == "/api/chat/send":
            agent = d.get("agent") if d.get("agent") in ("claude", "codex") else "claude"
            text = str(d.get("text") or "").strip()
            if not text:
                raise BadRequest("mensagem vazia")
            if not reserve(agent):
                return self._json({"error": "O agente ainda está a responder."}, 409)
            try:
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Connection", "close")
                self.end_headers()
                self._sent = True
            except OSError:
                release(agent)
                return
            alive = {"ok": True}

            def emit(obj):
                if not alive["ok"]:
                    return
                try:
                    self.wfile.write((json.dumps(obj, ensure_ascii=False) + "\n").encode())
                    self.wfile.flush()
                except OSError:
                    alive["ok"] = False  # browser closed; keep running so the reply is saved
            run_agent(agent, text, emit)  # releases the slot itself
            return
        if p == "/api/chat/stop":
            return self._json({"ok": True, "stopped": stop_agent(str(d.get("agent")))})
        if p == "/api/chat/reset":
            agent = d.get("agent")
            if agent not in ("claude", "codex"):
                raise BadRequest("agente inválido")
            stop_agent(agent)
            reset_chat(agent)
            return self._json({"ok": True})
        if p == "/api/unit/result":
            uid = str(d.get("id", ""))
            if not unit_path(uid):
                return self._json({"error": "missing"}, 404)
            pct = to_int(d.get("pct"), "percentagem", 0, 100, None)
            if pct is None:
                raise BadRequest("percentagem em falta")
            status = update_spine(uid, pct)
            if status is None:
                return self._json({"error": f"{uid} não está na espinha"}, 404)
            out = ROOT / "progress" / "exercises"
            out.mkdir(parents=True, exist_ok=True)
            items = d.get("items") if isinstance(d.get("items"), list) else []
            jsave(out / f"{uid}-{dt.date.today().isoformat()}.json",
                  {"id": uid, "date": dt.date.today().isoformat(), "pct": pct,
                   "score": d.get("score"), "total": d.get("total"), "items": items[:200]})
            return self._json({"ok": True, "status": status})
        if p == "/api/session/close":
            return self._json(close_session(d))
        if p == "/api/settings":
            s = settings()
            for k in ("codex_model", "claude_model", "claude_bin", "codex_bin"):
                if k in d:
                    s[k] = str(d[k]).strip().strip('"')[:400]
            jsave(STATE / "settings.json", s)
            _CACHE.clear()  # paths/models may have changed
            return self._json(s)
        if p == "/api/git/save":
            return self._json(git_save())
        return self._send(404, b"not found", "text/plain")


class Server(ThreadingHTTPServer):
    daemon_threads = True               # Ctrl+C never waits for a streaming reply
    allow_reuse_address = not IS_WIN    # on Windows SO_REUSEADDR would let two servers share a port


def main():
    for stream in (sys.stdout, sys.stderr):  # Windows consoles/redirects may not be UTF-8
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="English Boost web app")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", PORT)))
    ap.add_argument("--host", default="127.0.0.1", help="0.0.0.0 only inside Docker (compose publishes it on 127.0.0.1)")
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    try:
        srv = Server((a.host, a.port), Handler)
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, 10048, 10013):
            print(f"A porta {a.port} já está ocupada (a app já está aberta, ou o Docker está ligado?).\n"
                  f"Abre http://127.0.0.1:{a.port} ou usa outra porta: --port {a.port + 1}", file=sys.stderr)
            sys.exit(2)
        raise
    url = f"http://127.0.0.1:{a.port}"
    print(f"English Boost a correr em {url}  (Ctrl+C para sair)", flush=True)
    if STATE != ROOT / "app" / "state":
        print(f"  ⚠ O projeto não tem permissão de escrita: o histórico do chat fica em {STATE}; "
              "registar sessões e guardar exercícios vai falhar até corrigires as permissões.", flush=True)
    print(f"  Claude: {find_claude() or 'não encontrado'}")
    print(f"  Codex:  {find_codex() or 'não encontrado'}", flush=True)
    if not a.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nAté amanhã! 👋")
    finally:
        for agent in list(RUNNING):
            stop_agent(agent)
        srv.server_close()


if __name__ == "__main__":
    main()
