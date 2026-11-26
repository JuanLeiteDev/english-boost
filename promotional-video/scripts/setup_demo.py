"""Build an isolated copy of the app with demo data, for the screen recordings.

The real project (learning data, chat history, settings) is only READ, never written.
Everything goes to promotional-video/demo-workspace/ (git-ignored), which is rebuilt from
scratch on every run.

Demo story: today is 2026-12-07 (day 13, week 2). ~12 days of sessions are simulated
from the real plan and the real C0 errors. The video labels this scene "dados de demonstração".

Run:  .venv/bin/python scripts/setup_demo.py
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

PV = Path(__file__).resolve().parent.parent          # promotional-video/
SRC = PV.parent                                       # the real project
DEMO = PV / "demo-workspace"
DEMO_TODAY = "2026-12-07"

EXCLUDE = [".git", "promotional-video", "app/state", ".venv", "materials/official", "node_modules",
           "__pycache__", "*-workspace", ".claude/settings.local.json", "PROMPT.md"]

LOG = [  # date, min, grammar, %, listening, output, words, notes
    ("2026-11-25", 66, "", "71%", "Cambridge A2 Key + B1 Preliminary, Part 1", "checkpoint", 8, "C0 diagnostic"),
    ("2026-11-26", 62, "P1-01", "92%", "VOA Let's Learn English, lesson 1", "speaking", 8, ""),
    ("2026-11-27", 58, "P1-02", "85%", "VOA lesson 2", "writing", 8, ""),
    ("2026-11-28", 64, "P1-03", "78%", "ESL Lab: daily routine", "speaking", 8, ""),
    ("2026-11-29", 47, "P1-04", "88%", "VOA lesson 3", "writing", 8, ""),
    ("2026-11-30", 61, "P1-05", "64%", "ELLLO: short interview", "speaking", 8, "repeat wh- questions"),
    ("2026-12-01", 72, "review", "80%", "VOA lesson 1, no transcript", "review", 0, "weekly review"),
    ("2026-12-02", 63, "P1-06", "91%", "VOA lesson 4", "speaking", 8, ""),
    ("2026-12-03", 55, "P1-07", "81%", "Cambridge B1 Listening, Part 2", "writing", 8, ""),
    ("2026-12-04", 35, "P1-08", "76%", "ESL Lab: at the supermarket", "speaking", 6, "short day"),
    ("2026-12-05", 66, "P1-09", "73%", "ELLLO: cities", "speaking", 8, ""),
    ("2026-12-06", 60, "P1-10", "84%", "VOA lesson 5", "writing", 8, ""),
]

SPINE = {"P1-01": ("✅", "92%"), "P1-02": ("☑️", "85%"), "P1-03": ("☑️", "78%"), "P1-04": ("☑️", "88%"),
         "P1-05": ("🔄", "64%"), "P1-06": ("✅", "91%"), "P1-07": ("☑️", "81%"), "P1-08": ("☑️", "76%"),
         "P1-09": ("☑️", "73%"), "P1-10": ("☑️", "84%")}

ERRORS = [  # from the real C0 answers and transcripts
    ("E01", "gramática", "“Who **did call** you this morning?”", "“Who **called** you this morning?”", "P1-05", 3, "2026-11-24", "2026-11-30", "aberto"),
    ("E02", "gramática", "“There **are** some milk”", "“There **is** some milk”", "P1-08", 2, "2026-11-24", "2026-12-04", "a melhorar"),
    ("E03", "gramática", "“I'm going to Belgium **on** two months”", "“… **in** two months”", "P1-12", 2, "2026-11-25", "2026-12-05", "aberto"),
    ("E04", "gramática", "“a good opportunity **to me**”", "“a good opportunity **for me**”", "—", 2, "2026-11-25", "2026-12-03", "a melhorar"),
    ("E05", "ortografia", "“AI **Engeneering**”", "“AI **Engineering**”", "—", 2, "2026-11-25", "2026-12-02", "a melhorar"),
]

WEEK2 = """# Week 2: 2026-12-02 → 2026-12-08 · Theme: My routine, home, city and shopping

**Phase 1 · 1 h a day** · Grammar P1-06 to P1-11 · **Goal:** describe your day and your city for 2 minutes.

| Day | Date | Grammar (22 min) | Listening (15 min) | Output (15 min) | Vocabulary (8 min) |
|---|---|---|---|---|---|
| 8 · Wed | 2026-12-02 | P1-06 present continuous | VOA *Let's Learn English* 1, lesson 4 + shadowing | Speaking: describe what people are doing in a photo | 8 words: house, rooms |
| 9 · Thu | 2026-12-03 | P1-07 present simple vs continuous | Cambridge B1 Preliminary listening, Part 2 | Writing: *A message to your flatmate* (60 words) | 8 words: city places |
| 10 · Fri | 2026-12-04 | P1-08 plurals · there is / there are | ESL Lab *Easy*: at the supermarket | Speaking: describe your street | 8 words: food, shopping |
| 11 · Sat | 2026-12-05 | P1-09 some / any / much / many | ELLLO: one interview about cities | Speaking: role-play *at the market* | 8 words: quantities |
| 12 · Sun | 2026-12-06 | P1-10 a / an / the | VOA lesson 5 + shadowing | Writing: *My new city* (100 words) | 8 words: transport |
| 13 · Mon | 2026-12-07 | P1-11 possessive 's · this / that · object pronouns | **Cambridge B1 Preliminary listening, Part 1** | Speaking: *Why I'm going to Belgium* (1 min, with the mic) | 8 words: Erasmus, university |
| 14 · Tue | 2026-12-08 | **Weekly review:** mixed quiz P1-06 to P1-11 | Replay one VOA lesson without the transcript | Speaking: 4/3/2 *My routine in Belgium* | Old cards · weekly report |

**Extra (optional):** 10–20 minutes of a series with English subtitles.
"""


def copy_project():
    if DEMO.exists():
        shutil.rmtree(DEMO)
    args = ["rsync", "-a"] + [f"--exclude={e}" for e in EXCLUDE] + [f"{SRC}/", f"{DEMO}/"]
    subprocess.run(args, check=True)


def write_log():
    p = DEMO / "progress" / "log.md"
    head = p.read_text(encoding="utf-8").split("| Data |")[0]
    rows = ["| Data | Min | Gramática | % | Listening | Output | Palavras novas | Notas |",
            "|---|---|---|---|---|---|---|---|"]
    rows += ["| " + " | ".join(str(x) for x in r) + " |" for r in LOG]
    p.write_text(head + "\n".join(rows) + "\n", encoding="utf-8")


def write_spine():
    p = DEMO / "plan" / "grammar-spine.md"
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\| (P1-\d\d) \|", line)
        if m and m.group(1) in SPINE:
            cells = line.split("|")
            icon, pct = SPINE[m.group(1)]
            cells[6], cells[7] = f" {icon} ", f" {pct} "
            line = "|".join(cells)
        out.append(line)
    p.write_text("\n".join(out) + "\n", encoding="utf-8")


def write_errors():
    p = DEMO / "progress" / "error-log.md"
    text = p.read_text(encoding="utf-8").rstrip("\n")
    text += "\n" + "\n".join("| " + " | ".join(str(x) for x in e) + " |" for e in ERRORS) + "\n"
    p.write_text(text, encoding="utf-8")


def write_state():
    st = DEMO / "app" / "state"
    st.mkdir(parents=True, exist_ok=True)
    settings = {"codex_model": "gpt-6.1-terra", "claude_model": "", "codex_bin": "",
                "claude_bin": str(PV / "scripts" / "mock_agent.py")}
    (st / "settings.json").write_text(json.dumps(settings, indent=1), encoding="utf-8")
    empty = {"messages": [], "session": None, "gen": 0}
    (st / "chats.json").write_text(json.dumps({"claude": empty, "codex": dict(empty)}, indent=1), encoding="utf-8")


def main():
    copy_project()
    write_log()
    write_spine()
    write_errors()
    (DEMO / "plan" / "weeks" / "semana-02.md").write_text(WEEK2, encoding="utf-8")
    write_state()
    subprocess.run(["python3", "scripts/build_dashboard.py", "--today", DEMO_TODAY], cwd=DEMO,
                   check=False, capture_output=True)
    print(f"demo workspace ready: {DEMO}  (today = {DEMO_TODAY})")


if __name__ == "__main__":
    main()
