#!/usr/bin/env python3
"""Quality gate for practice sets made by the practice-builder skill.

    python3 scripts/check_practice.py <ID> [--time 20] [--skills grammar,listening] [--online]

Checks the set in materials/generated/practice/<ID>.md against its key in answers/<ID>.md and
prints every problem. Exit code 0 = good to show, 1 = fix the problems and run it again.
The rules come from real failures: answers visible in the question "(hang)", too few and too easy
items, one task type only, links to home pages instead of the exercise itself.
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRACTICE = ROOT / "materials" / "generated" / "practice"
LINKS = ROOT / "resources" / "exercise-links.md"
MIN_ITEMS = {10: 12, 20: 20, 30: 28, 45: 36}  # scored items per time budget (minutes)
ID_RE = re.compile(r"^\d{4}-\d\d-\d\d-[a-z0-9]+(?:-[a-z0-9]+)*$")


def norm(s: str) -> str:
    s = s.lower().replace("’", "'").replace("*", "")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]+", " ", s)).strip()


def key_variants(exp: str) -> list[str]:
    e = re.split(r"\s+←", exp)[0]
    e = re.sub(r"^\(?[a-e]\)\s*", "", e.strip())  # "b) went" → "went"
    e = re.sub(r"\([^)]*\)", "", e)
    return [norm(v) for v in re.split(r"\s+/\s+", e) if norm(v)]


def parse_set(text: str):
    """Scored items {n: text}, production headings outside practice sections, task headings, listen scripts."""
    items, tasks, scripts, stray_turns, lines = {}, set(), [], [], text.splitlines()
    in_ex = in_prod = fence = False
    buf: list[str] = []
    sections: list[tuple[str, list[int]]] = []  # practice "###" sections and their item numbers
    for line in lines:
        if line.startswith("```"):
            if fence:
                scripts.append("\n".join(buf))
            fence, buf = not fence, []
            continue
        if fence:
            buf.append(line)
            continue
        if line.startswith("## "):
            in_ex, in_prod = bool(re.search(r"practi|exerc", line, re.I)), False
            if in_ex:
                sections.append((line[3:].strip(), []))
        elif line.startswith("### "):
            is_turn = bool(re.search(r"your turn|produ", line, re.I))
            if is_turn and not in_ex:
                stray_turns.append(line.strip())
            if in_ex:
                in_prod = is_turn
                if not is_turn:
                    tasks.add(norm(line[4:]))
                    sections.append((line[4:].strip(), []))
        elif in_ex and not in_prod:
            m = re.match(r"^(\d+)\.\s+(.+)$", line)
            if m:
                items[int(m.group(1))] = m.group(2).strip()
                if sections:
                    sections[-1][1].append(int(m.group(1)))
    return items, tasks, scripts, stray_turns, sections


def parse_key(text: str) -> dict[int, str]:
    out = {}
    for line in text.splitlines():
        m = re.match(r"^\s*(\d+)\.\s+(.+)$", line)
        if m and int(m.group(1)) not in out:
            out[int(m.group(1))] = m.group(2).strip()
    return out


def has_options(item: str) -> bool:
    """Multiple choice: '(go / went / goes)' or 'a) … b) …'."""
    return bool(re.search(r"\([^)]*\s/\s[^)]*\)", item) or re.search(r"\ba\)\s.+\bb\)\s", item))


def allowed_links() -> set[str]:
    text = LINKS.read_text(encoding="utf-8") if LINKS.is_file() else ""
    return {u.rstrip(").,|") for u in re.findall(r"https?://[^\s|)]+", text)}


def check(pid: str, minutes: int | None, skills: set[str], online: bool) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    if not ID_RE.match(pid):
        return [f"ID '{pid}' must look like 2026-11-26-past-simple-housing"], []
    f, kf = PRACTICE / f"{pid}.md", PRACTICE / "answers" / f"{pid}.md"
    if not f.is_file():
        return [f"missing {f.relative_to(ROOT)}"], []
    if not kf.is_file():
        return [f"missing answer key {kf.relative_to(ROOT)}"], []
    text = f.read_text(encoding="utf-8")
    items, tasks, scripts, stray, sections = parse_set(text)
    key = parse_key(kf.read_text(encoding="utf-8"))

    # 1. items ↔ key, numbering
    if set(items) != set(key):
        errors.append(f"items and key differ: items without key {sorted(set(items) - set(key))}, key without item {sorted(set(key) - set(items))}")
    if sorted(items) != list(range(1, len(items) + 1)):
        errors.append("number the scored items 1..N with no gaps across the whole file")
    if stray:
        errors.append(f"'Your turn' must be a ### heading inside a '## … Practice …' section: {stray}")

    # 2. answers visible in the question
    for n, it in items.items():
        if n not in key:
            continue
        variants = key_variants(key[n])
        hints = [norm(h) for h in re.findall(r"\(([^)/]*)\)", it)]
        leak = [v for v in variants if v in hints]
        if leak and not has_options(it):
            errors.append(f"item {n}: the answer '{leak[0]}' is given in the brackets. Give a meaning, a context or options instead")
        if it.count("___") > 1:
            warnings.append(f"item {n}: more than one ___ gap (the app grades one answer per item)")

    # 3. size and variety
    scored = len(items)
    if minutes:
        need = MIN_ITEMS.get(minutes) or max(v for k, v in MIN_ITEMS.items() if k <= max(minutes, 10))
        if scored < need:
            errors.append(f"only {scored} scored items for {minutes} min: write at least {need}")
    if scored >= 12 and len(tasks) < 3:
        errors.append(f"only {len(tasks)} task type(s): use at least 3 different kinds of task (see the template)")
    base_hint = sum(1 for it in items.values() if re.search(r"\(\s*[A-Za-z']+\s*\)", it) and not has_options(it))
    if scored and base_hint / scored > 0.4:
        errors.append(f"{base_hint} of {scored} items just give a word in brackets: max 40%. Use contexts, choices, transformations, errors, meaning")
    for title, nums in sections:
        if len(nums) > 10:
            warnings.append(f"section '{title}' has {len(nums)} items: split it or vary the task")

    # 4. listening
    words = [len(re.findall(r"[A-Za-z']+", re.sub(r"(?im)^\s*voices\s*:.*$", "", s))) for s in scripts]
    esl = re.findall(r"https?://www\.esl-lab\.com/[^\s)]+", text)
    if "listening" in skills and not scripts and not esl:
        errors.append("listening was chosen: add a ```listen script and/or an ESL Lab audio from resources/exercise-links.md, with questions")
    short = 120 if (minutes or 20) >= 20 else 80
    for i, w in enumerate(words, 1):
        if w < short:
            errors.append(f"listening script {i} has {w} words: write at least {short} (real speech, with details to catch)")

    # 5. links: only direct exercise pages from resources/exercise-links.md
    ok = allowed_links()
    for url in re.findall(r"\]\((https?://[^)\s]+)\)", text):
        if url.rstrip("/") not in {u.rstrip("/") for u in ok}:
            errors.append(f"link not in resources/exercise-links.md (direct exercise pages only): {url}")
        elif online:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120"})
                with urllib.request.urlopen(req, timeout=20) as r:
                    if r.status != 200:
                        errors.append(f"link answers HTTP {r.status}: {url}")
            except Exception as e:  # noqa: BLE001
                warnings.append(f"could not open {url}: {e}")
    if "## Extra" not in text and "## extra" not in text.lower():
        warnings.append("no '## Extra materials' section with direct links")
    return errors, warnings


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("id")
    ap.add_argument("--time", type=int, default=None, help="minutes chosen on the Practice page")
    ap.add_argument("--skills", default="", help="comma list, e.g. grammar,listening")
    ap.add_argument("--online", action="store_true", help="also open every link")
    a = ap.parse_args(argv)
    pid = Path(a.id).stem
    errors, warnings = check(pid, a.time, {s.strip() for s in a.skills.split(",") if s.strip()}, a.online)
    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"ERROR: {e}")
    print("OK: ready to show" if not errors else f"{len(errors)} problem(s): fix them and run the check again")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
