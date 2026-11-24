"""End-to-end tests of app/server.py with fake Claude/Codex agents (no network, no subscription)."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from util import AppServer, kinds, make_sandbox, text_of  # noqa: E402


class ServerTestCase(unittest.TestCase):
    env: dict = {}

    @classmethod
    def setUpClass(cls):
        cls.root = make_sandbox()
        cls.srv = AppServer(cls.root, env=cls.env)

    @classmethod
    def tearDownClass(cls):
        cls.srv.close()
        shutil.rmtree(cls.root, ignore_errors=True)

    def reset(self, agent):
        self.srv.post("/api/chat/reset", {"agent": agent})


class TestBasics(ServerTestCase):
    def test_index_has_token_and_scripts(self):
        st, raw = self.srv.get("/")
        html = raw.decode()
        self.assertEqual(st, 200)
        self.assertIn(self.srv.token, html)
        self.assertNotIn("__TOKEN__", html)
        for js in ("md.js", "grading.js", "app.js"):
            self.assertEqual(self.srv.get(f"/static/{js}")[0], 200, js)

    def test_health_state_progress_spine(self):
        self.assertTrue(self.srv.get_json("/api/health")["ok"])
        st = self.srv.get_json("/api/state")
        for k in ("today", "plan", "agents", "settings", "days_left", "env"):
            self.assertIn(k, st)
        self.assertTrue(st["agents"]["claude"] and st["agents"]["codex"])
        self.assertEqual(len(st["plan"]["blocks"]), 4)
        pr = self.srv.get_json("/api/progress")
        self.assertEqual(len(pr["days"]), 69)
        spine = self.srv.get_json("/api/spine")
        self.assertEqual(len(spine), 45)
        self.assertTrue(next(u for u in spine if u["id"] == "P1-01")["exists"])

    def test_unit_and_key(self):
        u = self.srv.get_json("/api/unit?id=P1-02")
        self.assertIn("Present simple", u["md"])
        key = self.srv.get_json("/api/unit/key?id=P1-02")["key"]
        self.assertEqual(key["1"], "watches")
        self.assertEqual(self.srv.get("/api/unit?id=P9-99")[0], 404)
        self.assertEqual(self.srv.get("/api/unit?id=../../etc")[0], 404)

    def test_guide_served(self):
        st, raw = self.srv.get("/guia")
        self.assertEqual(st, 200)
        self.assertIn(b"<html", raw)


class TestSecurity(ServerTestCase):
    def test_post_requires_token(self):
        st, _ = self.srv.post("/api/settings", {"codex_model": "x"}, token=False)
        self.assertEqual(st, 403)
        st, _ = self.srv.post("/api/settings", {}, headers={"X-Token": "wrong"}, token=False)
        self.assertEqual(st, 403)

    def test_host_header_checked(self):
        self.assertEqual(self.srv.get("/api/state", headers={"Host": "evil.example:80"})[0], 403)
        self.assertEqual(self.srv.get("/api/state", headers={"Host": "localhost:1"})[0], 200)
        self.assertEqual(self.srv.get("/api/state", headers={"Host": "[::1]:8765"})[0], 200)

    def test_doc_viewer_restrictions(self):
        ok = self.srv.get("/api/doc?path=plan/master-plan.md")
        self.assertEqual(ok[0], 200)
        for bad in ("materials/grammar/answers/P1-01.md", "../README.md", "plan/../../x.md", "/etc/passwd",
                    "app/server.py", "plan\\..\\..\\x.md", "C:/Windows/win.ini", "materials\\grammar\\answers\\P1-01.md", ""):
            self.assertEqual(self.srv.get("/api/doc?path=" + bad)[0], 404, bad)

    def test_static_traversal(self):
        for bad in ("/static/../server.py", "/static/..%2fserver.py", "/static/../../AGENTS.md"):
            self.assertEqual(self.srv.get(bad)[0], 404, bad)


class TestBadInput(ServerTestCase):
    def test_malformed_requests_get_400_not_500(self):
        st, raw = self.srv.request("POST", "/api/settings", body="{not json", headers={"X-Token": self.srv.token})
        self.assertEqual(st, 400)
        st, raw = self.srv.request("POST", "/api/settings", body="[1,2]", headers={"X-Token": self.srv.token})
        self.assertEqual(st, 400)
        st, raw = self.srv.request("POST", "/api/session/close", body="{}",
                                   headers={"X-Token": self.srv.token, "Content-Length": "abc"})
        self.assertIn(st, (400,))
        st, body = self.srv.post("/api/unit/result", {"id": "P1-01", "pct": "abc"})
        self.assertEqual(st, 400)
        st, body = self.srv.post("/api/session/close", {"minutes": "lots"})
        self.assertEqual(st, 400)
        st, body = self.srv.post("/api/session/close", {"date": "yesterday"})
        self.assertEqual(st, 400)
        st, body = self.srv.post("/api/chat/send", {"agent": "claude", "text": "   "})
        self.assertEqual(st, 400)
        self.assertEqual(self.srv.get("/api/chat/history?agent=nope")[0], 400)
        # the server is still healthy afterwards
        self.assertTrue(self.srv.get_json("/api/health")["ok"])


class TestWrites(ServerTestCase):
    def test_unit_result_updates_spine(self):
        st, body = self.srv.post("/api/unit/result", {"id": "P1-03", "pct": 65, "score": 15, "total": 23, "items": [{"n": "1"}]})
        self.assertEqual(st, 200)
        self.assertEqual(body["status"], "🔄")
        spine = (self.root / "plan" / "grammar-spine.md").read_text(encoding="utf-8")
        row = next(l for l in spine.splitlines() if l.startswith("| P1-03 |"))
        self.assertIn("🔄", row)
        self.assertIn("65%", row)
        st, body = self.srv.post("/api/unit/result", {"id": "P1-03", "pct": "95%"})
        self.assertEqual(body["status"], "✅")
        u = next(x for x in self.srv.get_json("/api/spine") if x["id"] == "P1-03")
        self.assertEqual(u["status"], "done")
        saved = list((self.root / "progress" / "exercises").glob("P1-03-*.json"))
        self.assertTrue(saved)

    def test_close_session_appends_sanitised_row(self):
        st, body = self.srv.post("/api/session/close", {"minutes": "55", "grammar": "P1-01", "pct": 91,
                                                        "listening": "VOA | L1\nline2", "output": "speaking", "words": 8,
                                                        "notes": "a|b"})
        self.assertEqual(st, 200, body)
        log = (self.root / "progress" / "log.md").read_text(encoding="utf-8")
        last = log.strip().splitlines()[-1]
        self.assertEqual(last.count("|"), 9)  # 8 columns
        self.assertIn("| 55 | P1-01 | 91% | VOA / L1 line2 | speaking | 8 | a/b |", last)
        self.assertTrue((self.root / "dashboard" / "index.html").exists())
        self.assertGreaterEqual(self.srv.get_json("/api/progress")["minutes"], 55)

    def test_concurrent_closes_do_not_lose_rows(self):
        before = (self.root / "progress" / "log.md").read_text(encoding="utf-8").count("\n")
        threads = [threading.Thread(target=self.srv.post, args=("/api/session/close", {"minutes": i, "notes": f"c{i}"}))
                   for i in range(8)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        text = (self.root / "progress" / "log.md").read_text(encoding="utf-8")
        self.assertEqual(text.count("\n") - before, 8)
        for i in range(8):
            self.assertIn(f"| c{i} |", text)

    def test_settings_roundtrip(self):
        st, s = self.srv.post("/api/settings", {"codex_model": " gpt-x ", "claude_model": "sonnet", "evil": "1"})
        self.assertEqual(st, 200)
        self.assertEqual(s["codex_model"], "gpt-x")
        self.assertNotIn("evil", s)
        self.assertEqual(self.srv.get_json("/api/state")["settings"]["claude_model"], "sonnet")
        self.srv.post("/api/settings", {"codex_model": "gpt-6-sol", "claude_model": ""})


class TestChat(ServerTestCase):
    def test_claude_streams_text_tools_and_markers(self):
        self.reset("claude")
        ev = self.srv.chat("claude", "-x olá: começa por hífen")
        self.assertIsInstance(ev, list, ev)
        self.assertEqual(ev[-1]["t"], "done")
        text = text_of(ev)
        self.assertIn("Echo: -x olá", text)
        self.assertEqual(text.count("Echo:"), 1, "assistant text duplicated after deltas")
        self.assertIn("[[abrir:P1-01]]", text)
        self.assertIn("Ler plan/master-plan.md", kinds(ev, "tool"))
        self.assertFalse(kinds(ev, "error"))
        call = self.srv.calls()[-1]
        self.assertEqual(call["stdin"], "-x olá: começa por hífen")  # via stdin, not argv
        self.assertNotIn("-x olá: começa por hífen", call["argv"])
        sid = ev[-1]["session"]
        self.assertTrue(sid.startswith("sess-claude-"))
        # second turn resumes the same session
        ev2 = self.srv.chat("claude", "segunda mensagem")
        call = self.srv.calls()[-1]
        self.assertIn("--resume", call["argv"])
        self.assertEqual(call["argv"][call["argv"].index("--resume") + 1], sid)
        hist = self.srv.get_json("/api/chat/history?agent=claude")["messages"]
        self.assertEqual([m["role"] for m in hist], ["user", "assistant", "user", "assistant"])

    def test_codex_context_once_then_resume(self):
        self.reset("codex")
        ev = self.srv.chat("codex", "primeira")
        self.assertIn("Codex: primeira", text_of(ev))
        self.assertIn("Comando: /bin/bash -lc 'ls plan'", kinds(ev, "tool"))
        self.assertFalse(kinds(ev, "error"), "harmless item errors must not reach the user")
        c1 = self.srv.calls()[-1]
        self.assertEqual(c1["argv"][:1], ["exec"])
        self.assertEqual(c1["argv"][-1], "-")
        self.assertIn("English Boost", c1["stdin"])  # app context on the first turn
        sid = ev[-1]["session"]
        self.srv.chat("codex", "segunda")
        c2 = self.srv.calls()[-1]
        self.assertEqual(c2["argv"][:3], ["exec", "resume", sid])
        self.assertEqual(c2["stdin"], "segunda")

    def test_stderr_flood_does_not_deadlock(self):
        for agent in ("claude", "codex"):
            self.reset(agent)
            t = time.time()
            ev = self.srv.chat(agent, "STDERR_FLOOD please", timeout=30)
            self.assertIsInstance(ev, list)
            self.assertEqual(ev[-1]["t"], "done")
            self.assertTrue(text_of(ev))
            self.assertLess(time.time() - t, 20, agent)

    def test_claude_without_partial_messages(self):
        self.reset("claude")
        ev = self.srv.chat("claude", "NOSTREAM")
        self.assertIn("no-stream reply", text_of(ev))

    def _set_session(self, agent, session, env=None):
        state = self.root / "app" / "state" / "chats.json"
        data = json.loads(state.read_text(encoding="utf-8")) if state.exists() else {}
        cur_env = self.srv.get_json("/api/state")["env"]
        data[agent] = {"session": session, "env": env or cur_env, "gen": data.get(agent, {}).get("gen", 0), "messages": []}
        state.write_text(json.dumps(data), encoding="utf-8")

    def test_stale_session_is_replaced_once(self):
        for agent in ("claude", "codex"):
            self.reset(agent)
            self._set_session(agent, "missing-session")
            ev = self.srv.chat(agent, "olá de novo")
            self.assertTrue(text_of(ev), (agent, ev))
            self.assertFalse(kinds(ev, "error"), (agent, ev))
            self.assertTrue(any("nova" in t for t in kinds(ev, "tool")), ev)
            self.assertNotEqual(ev[-1]["session"], "missing-session")

    def test_other_environment_session_not_resumed(self):
        self.reset("claude")
        self._set_session("claude", "sess-from-elsewhere", env="docker-or-other-pc")
        ev = self.srv.chat("claude", "mudei de ambiente")
        self.assertNotIn("--resume", self.srv.calls()[-1]["argv"])
        self.assertTrue(any("ambiente" in t for t in kinds(ev, "tool")))

    def test_busy_stop_and_reset(self):
        self.reset("claude")
        box = {}
        th = threading.Thread(target=lambda: box.setdefault("ev", self.srv.chat("claude", "SLEEP long task", timeout=40)))
        th.start()
        for _ in range(100):
            if self.srv.get_json("/api/chat/history?agent=claude")["running"]:
                break
            time.sleep(0.05)
        st, body = self.srv.post("/api/chat/send", {"agent": "claude", "text": "outra"})
        self.assertEqual(st, 409)
        time.sleep(0.5)
        t = time.time()
        self.srv.post("/api/chat/reset", {"agent": "claude"})  # reset also stops
        th.join(15)
        self.assertFalse(th.is_alive())
        self.assertLess(time.time() - t, 12)
        self.assertEqual(box["ev"][-1]["t"], "done")
        self.assertIn("Parado.", kinds(box["ev"], "tool"))
        # the reset wins: the stopped turn is not written back into the history
        self.assertEqual(self.srv.get_json("/api/chat/history?agent=claude")["messages"], [])
        # and the agent is free again
        self.assertIsInstance(self.srv.chat("claude", "depois do reset"), list)


class TestTimeout(ServerTestCase):
    env = {"AGENT_TIMEOUT": "2"}

    def test_hung_agent_is_killed(self):
        t = time.time()
        ev = self.srv.chat("codex", "SLEEP forever", timeout=30)
        self.assertLess(time.time() - t, 15)
        self.assertTrue(any("tempo limite" in e for e in kinds(ev, "error")), ev)
        self.assertFalse(self.srv.get_json("/api/chat/history?agent=codex")["running"])


class TestMissingAgents(ServerTestCase):
    env = {"CLAUDE_BIN": "/nonexistent/claude", "CODEX_BIN": "/nonexistent/codex"}

    def test_clear_error_when_agent_missing(self):
        st = self.srv.get_json("/api/state")
        if st["agents"]["claude"]:
            self.skipTest("a real Claude CLI is installed in a default location on this machine")
        ev = self.srv.chat("claude", "olá")
        self.assertTrue(kinds(ev, "error"))
        self.assertEqual(ev[-1]["t"], "done")


@unittest.skipUnless(shutil.which("git"), "git not installed")
class TestGitSave(ServerTestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = make_sandbox()
        home = Path(tempfile.mkdtemp(prefix="eb-home-"))  # outside the repo: gh/git may write here
        empty_cfg = home / "gitconfig"
        empty_cfg.write_text("", encoding="utf-8")
        cls.genv = {"HOME": str(home), "USERPROFILE": str(home), "GIT_CONFIG_GLOBAL": str(empty_cfg),
                    "GIT_CONFIG_NOSYSTEM": "1", "GH_TOKEN": "", "GH_CONFIG_DIR": str(home / "gh")}
        def git(*a, cwd=cls.root):
            return subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True,
                                  env={**__import__("os").environ, **cls.genv})
        cls.git = staticmethod(git)
        git("init", "-q", "-b", "main")
        git("-c", "user.name=t", "-c", "user.email=t@t", "add", "-A")
        git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
        cls.srv = AppServer(cls.root, env=cls.genv)

    def test_save_without_identity_then_push(self):
        (self.root / "writing" / "x.md").parent.mkdir(exist_ok=True)
        (self.root / "writing" / "x.md").write_text("hello", encoding="utf-8")
        st, r = self.srv.post("/api/git/save", {})
        self.assertTrue(r["ok"], r)
        self.assertIn("Commit feito", r["msg"])
        self.assertIn("Sem repositório remoto", r["msg"])
        st, r = self.srv.post("/api/git/save", {})
        self.assertIn("Nada de novo", r["msg"])
        # with a remote and no upstream: push -u
        bare = self.root.parent / (self.root.name + "-remote.git")
        self.git("init", "-q", "--bare", str(bare), cwd=self.root.parent)
        self.git("remote", "add", "origin", str(bare))
        (self.root / "writing" / "y.md").write_text("again", encoding="utf-8")
        st, r = self.srv.post("/api/git/save", {})
        self.assertTrue(r["ok"], r)
        self.assertIn("Enviado", r["msg"])
        st, r = self.srv.post("/api/git/save", {})
        self.assertIn("já está atualizado", r["msg"])
        shutil.rmtree(bare, ignore_errors=True)


@unittest.skipIf(os.name == "nt" or (hasattr(os, "geteuid") and os.geteuid() == 0), "needs POSIX permissions as non-root")
class TestReadOnlyProject(unittest.TestCase):
    """A project folder the app cannot write to (e.g. Docker bind mount with another UID) must not crash it."""

    def test_starts_and_chats_with_fallback_state(self):
        root = make_sandbox()
        home = Path(tempfile.mkdtemp(prefix="eb-home-"))
        state = root / "app" / "state"
        os.chmod(state, 0o555)
        srv = None
        try:
            srv = AppServer(root, env={"HOME": str(home)})
            self.assertTrue(srv.get_json("/api/health")["ok"])
            ev = srv.chat("claude", "olá")
            self.assertEqual(ev[-1]["t"], "done")
            self.assertTrue((home / ".english-boost" / "state" / "chats.json").exists())
            self.assertFalse((state / "chats.json").exists())
        finally:
            if srv:
                srv.close()
            os.chmod(state, 0o755)
            shutil.rmtree(root, ignore_errors=True)
            shutil.rmtree(home, ignore_errors=True)


class TestPortInUse(ServerTestCase):
    def test_second_instance_fails_cleanly(self):
        p = subprocess.run([sys.executable, str(self.root / "app" / "server.py"), "--port", str(self.srv.port), "--no-browser"],
                           capture_output=True, text=True, timeout=20, encoding="utf-8", errors="replace")
        self.assertEqual(p.returncode, 2, p.stderr)
        self.assertIn("ocupada", p.stderr)
        self.assertNotIn("Traceback", p.stderr)


if __name__ == "__main__":
    unittest.main()
