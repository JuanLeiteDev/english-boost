"""Runs the browser-side JS tests (grading.test.js, md.test.js) with Node when available."""
import os
import shutil
import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
NODE = os.environ.get("NODE") or shutil.which("node") or next(
    (p for p in ("/usr/lib/chatgpt/resources/cua_node/bin/node",) if os.access(p, os.X_OK)), None)


@unittest.skipUnless(NODE, "Node.js not found (set NODE=/path/to/node to run the JS grading tests)")
class TestGradingJS(unittest.TestCase):
    def run_js(self, name, expect):
        r = subprocess.run([NODE, str(HERE / name)], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn(expect, r.stdout)

    def test_grading(self):
        self.run_js("grading.test.js", "grading ok")

    def test_markdown_renderer(self):
        self.run_js("md.test.js", "md ok")


if __name__ == "__main__":
    unittest.main()
