"""Integrity of the study content and project files: catches broken units, keys, plans and skills."""
import datetime as dt
import json
import re
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))
import build_dashboard as bd  # noqa: E402

GRAMMAR = REPO / "materials" / "grammar"
ALLOWED_FRONTMATTER = {"name", "description", "license", "allowed-tools", "metadata", "compatibility"}


def unit_ids():
    return sorted(p.stem for p in GRAMMAR.glob("P[12]-[0-9][0-9].md"))


def key_items(uid):
    out = {}
    for line in (GRAMMAR / "answers" / f"{uid}.md").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*(\d+)\.\s+(.+)$", line)
        if m:
            out[int(m.group(1))] = m.group(2)
    return out


def exercise_items(uid):
    """Numbered items in section '4. Exercícios', split into scored and production items."""
    scored, production, in_ex, in_prod = set(), set(), False, False
    for line in (GRAMMAR / f"{uid}.md").read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            in_ex = "Practice" in line or "Exerc" in line
            in_prod = False
        elif line.startswith("### ") and in_ex:
            in_prod = "Your turn" in line or "Produ" in line
        elif in_ex:
            m = re.match(r"^(\d+)\.\s+", line)
            if m:
                (production if in_prod else scored).add(int(m.group(1)))
    return scored, production


class TestGrammarUnits(unittest.TestCase):
    def test_every_unit_has_a_key_and_vice_versa(self):
        units = set(unit_ids())
        keys = {p.stem for p in (GRAMMAR / "answers").glob("P[12]-[0-9][0-9].md")}
        self.assertTrue(units)
        self.assertEqual(units, keys)

    def test_units_follow_the_template(self):
        for uid in unit_ids():
            text = (GRAMMAR / f"{uid}.md").read_text(encoding="utf-8")
            self.assertTrue(text.startswith(f"# {uid} "), uid)
            for section in ("## 1. Look", "## 2. Rule", "## 3. Watch out", "## 4. Practice", "### Your turn", "## 5. Say it"):
                self.assertIn(section, text, f"{uid}: missing {section}")
            self.assertLess(len(text), 4500, f"{uid}: too long, keep units short")
            self.assertNotRegex(text, r"[ãõçâê]", f"{uid}: units must be in English")

    def test_scored_items_match_the_key(self):
        for uid in unit_ids():
            scored, production = exercise_items(uid)
            key = key_items(uid)
            self.assertTrue(scored, uid)
            self.assertEqual(scored, set(key), f"{uid}: itens sem gabarito ou gabarito sem item")
            self.assertFalse(production & set(key), f"{uid}: itens de produção com gabarito")
            nums = sorted(scored)
            self.assertEqual(nums, list(range(1, len(nums) + 1)), f"{uid}: numeração com falhas")
            self.assertFalse([n for n, v in key.items() if not v.strip()], uid)


class TestPracticeSets(unittest.TestCase):
    """Sets made by practice-builder: every scored item has a key line, numbered 1..N, keys stay hidden in answers/."""
    DIR = REPO / "materials" / "generated" / "practice"

    def test_practice_sets_match_their_keys(self):
        for f in sorted(self.DIR.glob("*.md")):
            pid = f.stem
            self.assertRegex(pid, r"^\d{4}-\d\d-\d\d-[a-z0-9]+(-[a-z0-9]+)*$", pid)
            keyf = self.DIR / "answers" / f"{pid}.md"
            self.assertTrue(keyf.is_file(), f"{pid}: missing answer key")
            scored, in_ex, in_prod, fence = set(), False, False, False
            for line in f.read_text(encoding="utf-8").splitlines():
                if line.startswith("```"):
                    fence = not fence
                if fence:
                    continue
                if line.startswith("## "):
                    in_ex, in_prod = bool(re.search(r"practi|exerc", line, re.I)), False
                elif line.startswith("### ") and in_ex:
                    in_prod = bool(re.search(r"your turn|produ", line, re.I))
                elif in_ex and not in_prod:
                    m = re.match(r"^(\d+)\.\s+", line)
                    if m:
                        scored.add(int(m.group(1)))
            key = {int(m.group(1)) for m in re.finditer(r"^\s*(\d+)\.\s+\S", keyf.read_text(encoding="utf-8"), re.M)}
            self.assertEqual(scored, key, f"{pid}: items and key differ")
            self.assertEqual(sorted(scored), list(range(1, len(scored) + 1)), f"{pid}: numbering gaps")


class TestPracticeChecker(unittest.TestCase):
    """scripts/check_practice.py: the gold example passes; a weak set (answer in brackets, few items, home-page link) fails."""

    def setUp(self):
        import tempfile
        import check_practice as cp
        self.cp, self.old = cp, cp.PRACTICE
        self.tmp = Path(tempfile.mkdtemp(prefix="eb-practice-"))
        (self.tmp / "answers").mkdir()
        cp.PRACTICE = self.tmp

    def tearDown(self):
        import shutil
        self.cp.PRACTICE = self.old
        shutil.rmtree(self.tmp, ignore_errors=True)

    def put(self, pid, md, key):
        (self.tmp / f"{pid}.md").write_text(md, encoding="utf-8")
        (self.tmp / "answers" / f"{pid}.md").write_text(key, encoding="utf-8")

    def test_gold_example_passes(self):
        ref = REPO / ".agents" / "skills" / "practice-builder" / "references"
        self.put("2026-11-27-gold", (ref / "example-set.md").read_text(encoding="utf-8"), (ref / "example-key.md").read_text(encoding="utf-8"))
        errors, _ = self.cp.check("2026-11-27-gold", 20, {"vocabulary", "listening"}, online=False)
        self.assertEqual(errors, [])

    def test_weak_set_fails(self):
        md = ("# Weak\n\n## 2. Practice · Vocabulary\n### A · Fill\n1. Do you want to ___ out? (hang)\n2. I ___ up for the club. (sign)\n"
              "### B · Choose\n3. I ___ friends. (make / do / take)\n\n## 3. Practice · Listening\n```listen\nMia: Hi! Party on Saturday?\nJack: Yes!\n```\n"
              "4. What day is the party?\n\n## Extra materials\n- [News](https://breakingnewsenglish.com/)\n")
        self.put("2026-11-27-weak", md, "1. hang\n2. sign\n3. make\n4. Saturday\n")
        errors, _ = self.cp.check("2026-11-27-weak", 20, {"vocabulary", "listening"}, online=False)
        text = "\n".join(errors)
        for must in ("item 1: the answer 'hang'", "item 2: the answer 'sign'", "only 4 scored items", "listening script 1 has",
                     "link not in resources/exercise-links.md", "item 3: options in brackets", "no explanation link"):
            self.assertIn(must, text)

    def test_choices_and_learn_section(self):
        learn = ("## 1. Learn it\n**Read first:** [Make or do](https://www.perfect-english-grammar.com/make-or-do.html)\n"
                 "**Partners:** make friends · do homework · have a party · take a photo · make noise\n\n")
        md = (f"# Set\n\n{learn}## 2. Practice · Vocabulary\n### A · Choose\n1. I ___ friends. a) make b) do c) take\n"
              "2. I ___ homework. a) make b) do c) take d) have\n3. Let's ___ a break. a) take b) make c) do d) go\n")
        self.put("2026-11-27-mc", md, "1. a) make\n2. do\n3. a) take\n")
        errors, _ = self.cp.check("2026-11-27-mc", None, {"vocabulary"}, online=False)
        text = "\n".join(errors)
        for must in ("item 1: 3 options", "item 2: the key of a multiple-choice item must start with the letter",
                     "'Learn it' section has only", "a list of 5 points on one line"):
            self.assertIn(must, text)
        self.assertNotIn("item 3:", text)
        self.assertNotIn("no explanation link", text)
        self.assertFalse(self.cp.bracket_options("I ___ it. (= start to work / run)"))
        self.assertTrue(self.cp.explanation_links())

    def test_exercise_links_are_direct(self):
        urls = self.cp.allowed_links()
        self.assertGreater(len(urls), 60)
        for u in urls:
            self.assertRegex(u, r"^https://[^/]+/.+", f"{u}: a home page is not a direct exercise link")


class TestPlan(unittest.TestCase):
    def test_grammar_spine(self):
        spine = bd.load_spine()
        ids = [u["id"] for u in spine]
        self.assertEqual(len(ids), 45)
        self.assertEqual(len(set(ids)), 45)
        self.assertEqual(ids, sorted(ids))
        dates = [dt.date.fromisoformat(u["date"]) for u in spine]
        self.assertEqual(dates, sorted(dates), "datas da espinha fora de ordem")
        self.assertTrue(all(bd.START <= d <= bd.END for d in dates))
        for uid in unit_ids():
            self.assertIn(uid, ids)

    def test_week_files_cover_seven_consecutive_days(self):
        for f in sorted((REPO / "plan" / "weeks").glob("semana-*.md")):
            days = []
            for table in bd.md_tables(f):
                for r in table:
                    m = re.search(r"\d{4}-\d\d-\d\d", r[1]) if len(r) > 1 else None
                    if m:
                        days.append(dt.date.fromisoformat(m.group(0)))
            self.assertEqual(len(days), 7, f.name)
            self.assertEqual([(b - a).days for a, b in zip(days, days[1:])], [1] * 6, f.name)
            for d in days:
                p = bd.today_plan(d)
                self.assertIsNotNone(p, d)
                self.assertEqual(len(p["cells"]), 4, d)

    def test_week1_units_exist(self):
        for d in range(26, 31):
            p = bd.today_plan(dt.date(2026, 11, d))
            m = re.search(r"P1-\d\d", p["cells"][0])
            self.assertTrue(m and (GRAMMAR / f"{m.group(0)}.md").exists(), d)

    def test_progress_files_parse(self):
        self.assertIsInstance(bd.load_log(), list)
        self.assertIsInstance(bd.load_errors(), list)
        json.loads((REPO / "Language-Tutor" / "learner-data" / "english" / "profile.json").read_text(encoding="utf-8"))


class TestSkills(unittest.TestCase):
    def frontmatter(self, path):
        text = path.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("---\n"), path)
        block = text.split("---", 2)[1]
        keys, fields = set(), {}
        for line in block.splitlines():
            m = re.match(r"^([A-Za-z][\w-]*):\s*(.*)$", line)
            if m:
                keys.add(m.group(1))
                fields[m.group(1)] = m.group(2).strip().strip('"')
        return keys, fields

    def test_all_skills_valid_for_claude_and_codex(self):
        skills = sorted((REPO / ".agents" / "skills").glob("*/SKILL.md"))
        self.assertEqual(len(skills), 22)
        for s in skills:
            keys, f = self.frontmatter(s)
            self.assertEqual(f.get("name"), s.parent.name, s)
            self.assertTrue(0 < len(f.get("description", "")) <= 1024, s)
            self.assertLessEqual(keys, ALLOWED_FRONTMATTER, f"{s}: {keys - ALLOWED_FRONTMATTER}")

    def test_custom_skills_documented(self):
        agents = (REPO / "AGENTS.md").read_text(encoding="utf-8")
        for name in ("daily-study-planner", "english-examiner", "speaking-coach", "practice-builder"):
            self.assertIn(name, agents)
            evals = REPO / ".agents" / "skills" / name / "evals" / "evals.json"
            self.assertTrue(json.loads(evals.read_text(encoding="utf-8"))["evals"])

    def test_claude_skills_link(self):
        link = REPO / ".claude" / "skills"
        if link.is_symlink() or link.is_dir():
            self.assertTrue((link / "daily-study-planner" / "SKILL.md").exists())
        else:  # Windows checkout without symlinks: setup-windows.ps1 / Docker handle it
            self.assertEqual(link.read_text().strip(), "../.agents/skills")


class _Balance(HTMLParser):
    VOID = {"meta", "link", "br", "hr", "img", "input", "path", "rect", "line", "circle", "source"}

    def __init__(self):
        super().__init__()
        self.stack, self.errors = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        else:
            self.errors.append((tag, self.getpos()))


class TestProjectFiles(unittest.TestCase):
    def test_html_well_formed(self):
        for f in (REPO / "docs" / "guia.html", REPO / "app" / "static" / "index.html"):
            p = _Balance()
            p.feed(f.read_text(encoding="utf-8"))
            self.assertEqual((p.stack, p.errors), ([], []), f)

    def test_line_endings(self):
        for f in list(REPO.glob("*.sh")) + list((REPO / "scripts").glob("*.sh")) + [REPO / "docker" / "entrypoint.sh"]:
            self.assertNotIn(b"\r\n", f.read_bytes(), f)
        self.assertIn("eol=lf", (REPO / ".gitattributes").read_text())

    def test_compose_only_publishes_on_localhost(self):
        compose = (REPO / "compose.yaml").read_text(encoding="utf-8")
        ports = re.findall(r'-\s*"([^"]+:\d+)"', compose)
        self.assertTrue(ports)
        self.assertTrue(all(p.startswith("127.0.0.1:") for p in ports), ports)

    def test_private_or_copyrighted_paths_ignored(self):
        ignore = (REPO / ".gitignore").read_text(encoding="utf-8")
        for p in ("app/state/", "materials/official/", ".venv/", ".env"):
            self.assertIn(p, ignore)

    def test_catalog_links_well_formed(self):
        text = (REPO / "resources" / "catalog.md").read_text(encoding="utf-8")
        links = re.findall(r"\]\((https?://[^)\s]+)\)", text)
        self.assertGreater(len(links), 20)
        self.assertFalse([u for u in links if " " in u or u.endswith(".")])


if __name__ == "__main__":
    unittest.main()
