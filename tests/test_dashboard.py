"""Unit tests for scripts/build_dashboard.py (the markdown parsers the app is built on)."""
import datetime as dt
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))
import build_dashboard as bd  # noqa: E402


class TestParsers(unittest.TestCase):
    def test_md_tables_and_cache_invalidation(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "t.md"
            f.write_text("# x\n\n| a | b |\n|---|:-:|\n| 1 | 2 |\n| 3 | 4 |\n\ntext\n\n| c |\n|---|\n| 5 |\n", encoding="utf-8")
            self.assertEqual(bd.md_tables(f), [[["1", "2"], ["3", "4"]], [["5"]]])
            res = bd.md_tables(f)
            res[0][0][0] = "mutated"  # callers must not be able to corrupt the cache
            self.assertEqual(bd.md_tables(f)[0][0][0], "1")
            time.sleep(0.01)
            f.write_text("| a |\n|---|\n| 9 |\n", encoding="utf-8")
            os.utime(f, (time.time() + 5, time.time() + 5))
            self.assertEqual(bd.md_tables(f), [[["9"]]])
        self.assertEqual(bd.md_tables(Path(d) / "missing.md"), [])

    def test_phase_info(self):
        self.assertEqual(bd.phase_info(dt.date(2026, 11, 24))[0], "Antes do início")
        self.assertEqual(bd.phase_info(dt.date(2026, 11, 25))[1:], (1, 1))
        self.assertEqual(bd.phase_info(dt.date(2026, 12, 1))[1:], (1, 7))
        self.assertIn("Fase 1", bd.phase_info(dt.date(2027, 1, 2))[0])
        self.assertIn("Fase 2", bd.phase_info(dt.date(2027, 1, 3))[0])
        self.assertEqual(bd.phase_info(dt.date(2027, 2, 1))[2], 69)
        self.assertIn("Erasmus", bd.phase_info(dt.date(2027, 2, 2))[0])

    def test_today_plan(self):
        p = bd.today_plan(dt.date(2026, 11, 26))
        self.assertIn("P1-01", p["cells"][0])
        self.assertNotIn("*", p["week"])
        self.assertIsNone(bd.today_plan(dt.date(2030, 1, 1)))

    def test_build_renders_every_unit(self):
        html = bd.build(dt.date(2026, 11, 26))
        self.assertEqual(html.count('class="unit '), 45)
        self.assertIn("P1-01", html)


if __name__ == "__main__":
    unittest.main()
