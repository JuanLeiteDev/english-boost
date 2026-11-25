#!/usr/bin/env python3
"""Build dashboard/index.html from the project's markdown files (stdlib only).

Usage:  python3 scripts/build_dashboard.py [--today YYYY-MM-DD]
Reads:  plan/grammar-spine.md, plan/weeks/*.md, progress/log.md,
        progress/error-log.md, assessments/*result*.md
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
START, END = dt.date(2026, 11, 25), dt.date(2027, 2, 1)
PHASE2 = dt.date(2027, 1, 3)
CHECKPOINTS = {dt.date(2026, 11, 25): "C0", dt.date(2027, 1, 2): "C1",
               dt.date(2027, 1, 16): "C2", dt.date(2027, 1, 31): "C3"}
STATUS = {"✅": ("done", "Dominada"), "☑️": ("ok", "Feita"), "☑": ("ok", "Feita"),
          "🔄": ("redo", "A repetir"), "⬜": ("todo", "Por fazer")}


_TABLE_CACHE: dict[str, tuple[tuple[int, int], list]] = {}


def md_tables(path: Path) -> list[list[list[str]]]:
    """Return every markdown table in a file as a list of rows (header excluded).
    Parsed tables are cached per file and re-read only when its mtime/size change."""
    try:
        st = path.stat()
    except OSError:
        return []
    sig = (st.st_mtime_ns, st.st_size)
    hit = _TABLE_CACHE.get(str(path))
    if hit and hit[0] == sig:
        return [[list(r) for r in t] for t in hit[1]]
    tables = _parse_tables(path.read_text(encoding="utf-8"))
    _TABLE_CACHE[str(path)] = (sig, tables)
    return [[list(r) for r in t] for t in tables]


def _parse_tables(text: str) -> list[list[list[str]]]:
    tables, cur = [], []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("|"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if all(re.fullmatch(r":?-+:?", c) for c in cells if c):
                continue
            cur.append(cells)
        elif cur:
            tables.append(cur[1:])
            cur = []
    if cur:
        tables.append(cur[1:])
    return tables


def strip_md(s: str) -> str:
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
    return re.sub(r"[*`]", "", s)


def load_spine():
    units = []
    for table in md_tables(ROOT / "plan/grammar-spine.md"):
        for r in table:
            if len(r) >= 7 and re.fullmatch(r"P[12]-\d\d", r[0]):
                emoji = next((e for e in STATUS if e in r[5]), "⬜")
                units.append({"id": r[0], "title": strip_md(r[1]), "cefr": r[2],
                              "date": r[4], "status": STATUS[emoji][0],
                              "label": STATUS[emoji][1], "pct": r[6]})
    return units


def load_log():
    rows = []
    for table in md_tables(ROOT / "progress/log.md"):
        for r in table:
            if r and re.fullmatch(r"\d{4}-\d\d-\d\d", r[0]):
                try:
                    minutes = int(re.sub(r"\D", "", r[1]) or 0)
                except ValueError:
                    minutes = 0
                rows.append({"date": dt.date.fromisoformat(r[0]), "min": minutes,
                             "grammar": r[2] if len(r) > 2 else "",
                             "pct": r[3] if len(r) > 3 else "",
                             "output": r[5] if len(r) > 5 else "",
                             "notes": r[7] if len(r) > 7 else ""})
    return rows


def load_errors():
    out = []
    for table in md_tables(ROOT / "progress/error-log.md"):
        for r in table:
            if len(r) >= 9 and r[0] and r[0] != "ID":
                try:
                    n = int(re.sub(r"\D", "", r[5]) or 0)
                except ValueError:
                    n = 0
                out.append({"cat": r[1], "err": strip_md(r[2]), "fix": strip_md(r[3]),
                            "unit": r[4], "n": n, "state": r[8]})
    open_ = [e for e in out if "resolvido" not in e["state"].lower()]
    return sorted(open_, key=lambda e: -e["n"])


def today_plan(today: dt.date):
    for f in sorted((ROOT / "plan/weeks").glob("semana-*.md")):
        text = f.read_text(encoding="utf-8")
        title = next((l.lstrip("# ").strip() for l in text.splitlines() if l.startswith("# ")), f.stem)
        for table in md_tables(f):
            for r in table:
                if len(r) >= 6 and today.isoformat() in r[1]:
                    return {"week": strip_md(title), "file": f.relative_to(ROOT).as_posix(),
                            "cells": [strip_md(c) for c in r[2:6]]}
    return None


def phase_info(today: dt.date):
    if today < START:
        return "Antes do início", 0, 0
    if today > END:
        return "Erasmus 🇧🇪", 11, 0
    day = (today - START).days + 1
    week = (day - 1) // 7 + 1
    return ("Fase 1 · Fundação" if today < PHASE2 else "Fase 2 · Intensivo Erasmus"), week, day


def build(today: dt.date) -> str:
    spine, log, errors = load_spine(), load_log(), load_errors()
    plan = today_plan(today)
    phase, week, day = phase_info(today)
    by_day: dict[dt.date, int] = {}
    for r in log:
        by_day[r["date"]] = by_day.get(r["date"], 0) + r["min"]

    total_min = sum(by_day.values())
    planned_min = sum((60 if d < PHASE2 else 150)
                      for d in (START + dt.timedelta(n) for n in range((min(today, END) - START).days + 1))
                      ) if today >= START else 0
    days_left = max((END - today).days, 0)
    streak, d = 0, today if today in by_day else today - dt.timedelta(1)
    while d in by_day and d >= START:
        streak, d = streak + 1, d - dt.timedelta(1)
    counts = {k: sum(1 for u in spine if u["status"] == k) for k in ("done", "ok", "redo", "todo")}

    # calendar
    cal = []
    first_monday = START - dt.timedelta(START.weekday())
    d = first_monday
    while d <= END:
        cls = "out" if d < START else ""
        m = by_day.get(d, 0)
        target = 60 if d < PHASE2 else 150
        if d >= START:
            cls = "p2" if d >= PHASE2 else "p1"
            if m:
                cls += " lvl3" if m >= target else (" lvl2" if m >= target * 0.6 else " lvl1")
            elif d < today:
                cls += " missed"
        if d == today:
            cls += " today"
        cp = CHECKPOINTS.get(d, "")
        tip = f"{d.isoformat()}: {m} min" + (f" · {cp}" if cp else "")
        cal.append(f'<div class="day {cls}" title="{tip}"><span>{d.day}</span>{f"<b>{cp}</b>" if cp else ""}</div>')
        d += dt.timedelta(1)

    spine_html = "".join(
        f'<div class="unit {u["status"]}" title="{html.escape(u["title"])} · {u["cefr"]} · {u["date"]} · {u["label"]}">'
        f'<span class="uid">{u["id"]}</span><span class="upct">{html.escape(u["pct"]) or "&nbsp;"}</span></div>'
        for u in spine)

    if plan:
        labels = ["Gramática", "Listening", "Output", "SRS"]
        today_html = (f'<p class="muted">{html.escape(plan["week"])}</p><ul class="plan">' +
                      "".join(f"<li><b>{l}</b><span>{html.escape(c)}</span></li>" for l, c in zip(labels, plan["cells"])) +
                      f'</ul><p class="muted">Diz ao Claude ou ao Codex: <code>vamos estudar</code> · ficheiro: <code>{plan["file"]}</code></p>')
    else:
        today_html = ('<p class="muted">Ainda não há plano para hoje. Diz <code>prepara a próxima semana</code> '
                      'ao Claude ou ao Codex (daily-study-planner).</p>')

    err_html = "".join(
        f'<tr><td>{html.escape(e["cat"])}</td><td>{html.escape(e["err"])}</td><td>{html.escape(e["fix"])}</td>'
        f'<td class="num">{e["n"]}</td></tr>' for e in errors[:8]) or \
        '<tr><td colspan="4" class="muted">Sem erros registados ainda.</td></tr>'

    recent = "".join(
        f'<tr><td>{r["date"].isoformat()}</td><td class="num">{r["min"]}</td><td>{html.escape(r["grammar"])}</td>'
        f'<td class="num">{html.escape(r["pct"])}</td><td>{html.escape(r["output"])}</td></tr>'
        for r in sorted(log, key=lambda r: r["date"], reverse=True)[:7]) or \
        '<tr><td colspan="5" class="muted">Nenhuma sessão registada ainda. A primeira é o diagnóstico C0 (2026-11-25).</td></tr>'

    results = sorted((ROOT / "assessments").glob("*result*.md"))
    res_html = "".join(f"<li><code>{p.relative_to(ROOT).as_posix()}</code></li>" for p in results) or \
        '<li class="muted">No checkpoint results yet.</li>'
    cp_html = "".join(
        f'<li class="{"past" if c < today else ""}"><b>{n}</b> {c.isoformat()}</li>' for c, n in CHECKPOINTS.items())

    pct_time = round(100 * total_min / planned_min) if planned_min else 0
    return TEMPLATE.format(
        today=today.isoformat(), phase=phase, week=week or "–", day=day or "–", days_left=days_left,
        hours=f"{total_min/60:.1f}", planned_h=f"{planned_min/60:.0f}", pct_time=pct_time, streak=streak,
        sessions=len(by_day), done=counts["done"], ok=counts["ok"], redo=counts["redo"],
        todo=counts["todo"], total_units=len(spine), today_html=today_html, calendar="".join(cal),
        spine=spine_html, errors=err_html, recent=recent, results=res_html, checkpoints=cp_html,
        generated=dt.datetime.now().strftime("%Y-%m-%d %H:%M"))


TEMPLATE = """<!doctype html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>English Boost</title>
<style>
:root {{ --bg:#f7f7f5; --card:#fff; --ink:#1d1d1f; --muted:#6b6b70; --line:#e4e4e0;
  --accent:#2f6fde; --done:#2e9e5b; --ok:#8cc9a3; --redo:#e0912f; --todo:#e9e9e6; --miss:#f3d4d4;
  --p1:#eef3fd; --p2:#f6effd; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#141416; --card:#1e1e21; --ink:#ececee;
  --muted:#9a9aa2; --line:#2e2e33; --accent:#6b9cff; --done:#3fb872; --ok:#2f6b47; --redo:#c27a22;
  --todo:#2a2a2f; --miss:#4a2a2a; --p1:#1b2233; --p2:#261c33; }} }}
:root[data-theme="dark"] {{ --bg:#141416; --card:#1e1e21; --ink:#ececee; --muted:#9a9aa2; --line:#2e2e33;
  --accent:#6b9cff; --done:#3fb872; --ok:#2f6b47; --redo:#c27a22; --todo:#2a2a2f; --miss:#4a2a2a; --p1:#1b2233; --p2:#261c33; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }}
main {{ max-width:1100px; margin:0 auto; padding:24px 16px 48px; }}
header {{ display:flex; flex-wrap:wrap; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:16px; }}
h1 {{ font-size:24px; margin:0; }} h2 {{ font-size:15px; margin:0 0 12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }}
.muted {{ color:var(--muted); }} code {{ font-size:13px; background:var(--todo); padding:1px 5px; border-radius:4px; }}
.grid {{ display:grid; gap:14px; grid-template-columns:repeat(12,1fr); }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; min-width:0; }}
.s12 {{ grid-column:span 12; }} .s8 {{ grid-column:span 8; }} .s6 {{ grid-column:span 6; }} .s4 {{ grid-column:span 4; }} .s3 {{ grid-column:span 3; }}
@media (max-width:820px) {{ .s8,.s6,.s4,.s3 {{ grid-column:span 12; }} }}
.kpi {{ font-size:30px; font-weight:650; font-variant-numeric:tabular-nums; }} .kpi small {{ font-size:14px; color:var(--muted); font-weight:400; }}
.plan {{ list-style:none; padding:0; margin:0; }} .plan li {{ display:grid; grid-template-columns:100px 1fr; gap:8px; padding:8px 0; border-top:1px solid var(--line); }}
.cal {{ display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }}
.cal .hd {{ font-size:12px; color:var(--muted); text-align:center; }}
.day {{ position:relative; aspect-ratio:1.4; border-radius:6px; font-size:12px; padding:3px 5px; background:var(--todo); }}
.day.out {{ background:transparent; }} .day.p1 {{ background:var(--p1); }} .day.p2 {{ background:var(--p2); }}
.day.lvl1 {{ background:var(--ok); }} .day.lvl2 {{ background:color-mix(in srgb,var(--done) 70%,var(--ok)); }} .day.lvl3 {{ background:var(--done); color:#fff; }}
.day.missed {{ background:var(--miss); }} .day.today {{ outline:2px solid var(--accent); outline-offset:1px; }}
.day b {{ position:absolute; right:4px; bottom:2px; font-size:10px; color:var(--accent); }}
.spine {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(62px,1fr)); gap:6px; }}
.unit {{ border-radius:8px; padding:6px; background:var(--todo); font-size:12px; display:flex; flex-direction:column; }}
.unit.done {{ background:var(--done); color:#fff; }} .unit.ok {{ background:var(--ok); }} .unit.redo {{ background:var(--redo); color:#fff; }}
.uid {{ font-weight:600; }} .upct {{ opacity:.85; }}
.legend {{ display:flex; flex-wrap:wrap; gap:12px; font-size:13px; color:var(--muted); margin-top:10px; }}
.legend i {{ display:inline-block; width:12px; height:12px; border-radius:3px; vertical-align:-1px; margin-right:4px; }}
table {{ width:100%; border-collapse:collapse; font-size:14px; }} td,th {{ text-align:left; padding:6px 4px; border-top:1px solid var(--line); vertical-align:top; }}
th {{ color:var(--muted); font-weight:500; font-size:13px; }} .num {{ text-align:right; font-variant-numeric:tabular-nums; }}
.tablewrap {{ overflow-x:auto; }}
ul.cp {{ list-style:none; padding:0; margin:0; }} ul.cp li {{ padding:4px 0; }} ul.cp li.past {{ color:var(--muted); text-decoration:line-through; }}
.bar {{ height:8px; background:var(--todo); border-radius:4px; overflow:hidden; margin-top:6px; }} .bar span {{ display:block; height:100%; background:var(--accent); }}
</style></head>
<body><main>
<header><h1>English Boost 🇺🇸 → 🇧🇪</h1><span class="muted">{today} · {phase} · semana {week} · dia {day}/69</span></header>
<div class="grid">
  <div class="card s3"><h2>Faltam</h2><div class="kpi">{days_left} <small>dias até 01/02</small></div></div>
  <div class="card s3"><h2>Horas estudadas</h2><div class="kpi">{hours} <small>/ {planned_h} h previstas</small></div><div class="bar"><span style="width:{pct_time}%"></span></div></div>
  <div class="card s3"><h2>Sequência</h2><div class="kpi">{streak} <small>dias seguidos · {sessions} sessões</small></div></div>
  <div class="card s3"><h2>Gramática</h2><div class="kpi">{done} <small>✅ · {ok} ☑️ · {redo} 🔄 / {total_units}</small></div></div>

  <div class="card s6"><h2>Hoje</h2>{today_html}</div>
  <div class="card s6"><h2>Calendário (25/11 → 01/02)</h2>
    <div class="cal"><div class="hd">S</div><div class="hd">T</div><div class="hd">Q</div><div class="hd">Q</div><div class="hd">S</div><div class="hd">S</div><div class="hd">D</div>{calendar}</div>
    <div class="legend"><span><i style="background:var(--p1)"></i>Fase 1 (1h)</span><span><i style="background:var(--p2)"></i>Fase 2 (2–3h)</span><span><i style="background:var(--done)"></i>meta cumprida</span><span><i style="background:var(--ok)"></i>parcial</span><span><i style="background:var(--miss)"></i>falhado</span></div></div>

  <div class="card s12"><h2>Espinha de gramática (P1-01 → P2-17)</h2><div class="spine">{spine}</div>
    <div class="legend"><span><i style="background:var(--done)"></i>dominada ≥ 90%</span><span><i style="background:var(--ok)"></i>feita 70–89%</span><span><i style="background:var(--redo)"></i>a repetir &lt; 70%</span><span><i style="background:var(--todo)"></i>por fazer</span></div></div>

  <div class="card s8"><h2>Erros recorrentes em aberto</h2><div class="tablewrap"><table><tr><th>Categoria</th><th>Erro</th><th>Correção</th><th class="num">×</th></tr>{errors}</table></div></div>
  <div class="card s4"><h2>Checkpoints</h2><ul class="cp">{checkpoints}</ul><h2 style="margin-top:14px">Resultados</h2><ul>{results}</ul></div>

  <div class="card s12"><h2>Últimas sessões</h2><div class="tablewrap"><table><tr><th>Data</th><th class="num">Min</th><th>Gramática</th><th class="num">%</th><th>Output</th></tr>{recent}</table></div></div>
</div>
<p class="muted" style="margin-top:16px">Gerado a {generated} por <code>scripts/build_dashboard.py</code>. Para atualizar, corre o script ou diz "terminei a sessão".</p>
</main></body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", help="override today's date (YYYY-MM-DD)")
    args = ap.parse_args()
    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    out = ROOT / "dashboard/index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(build(today), encoding="utf-8")
    print(f"Dashboard written to {out}")


if __name__ == "__main__":
    main()
