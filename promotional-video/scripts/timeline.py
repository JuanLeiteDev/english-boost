"""Compute the scene timeline from the narration clips -> src/data/timeline.json.

Each scene lasts: lead-in + spoken part of its clip(s) + tail. Music and SFX are aligned
to these cut times; the Remotion compositions read the same file.
Run after narration.py:  .venv/bin/python scripts/timeline.py
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NARR = json.loads((ROOT / "src" / "data" / "narration.json").read_text(encoding="utf-8"))
CLIPS = {c["key"]: c for c in NARR["clips"]}
FPS = 60


def spoken(key):  # end of the last word, i.e. without the clip's trailing silence
    return CLIPS[key]["words"][-1]["end"]


def dur(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                                capture_output=True, text=True, check=True).stdout)


LEARNER = dur(str(ROOT / "public" / "speaking" / "learner-en.mp3"))

# (scene id, title, lead-in seconds, [clips], tail seconds)
PLAN = [
    ("s1", "Necessidade", 0.8, ["s1"], 0.35),
    ("s2", "Iniciativa", 0.2, ["s2"], 0.4),
    ("s3", "Fundamentação", 0.2, ["s3"], 0.45),
    ("s4", "Plano diário", 0.2, ["s4"], 0.8),
    ("s5", "Listening Cambridge", 0.2, ["s5"], 1.1),
    ("s6", "Speaking", 0.2, ["s6a", "learner", "s6b"], 0.8),
    ("s7", "Progresso", 0.2, ["s7"], 0.9),
    ("s8", "Objetivo", 0.3, ["s8"], 1.5),
]


def main():
    t, scenes = 0.0, []
    for sid, title, lead, clips, tail in PLAN:
        at, items = lead, []
        for k in clips:
            if k == "learner":
                items.append({"key": "learner", "file": "speaking/learner-en.mp3", "at": round(at + 0.15, 3)})
                at += 0.15 + LEARNER + 0.2
            else:
                items.append({"key": k, "file": CLIPS[k]["file"], "at": round(at, 3)})
                at += spoken(k) + 0.25
        d = round(at - 0.25 + tail, 3)
        frames = round(d * FPS)
        scenes.append({"id": sid, "title": title, "start": round(t, 3), "duration": round(frames / FPS, 3),
                       "startFrame": round(t * FPS), "durationInFrames": frames, "audio": items})
        t += frames / FPS
    out = {"fps": FPS, "width": 1920, "height": 1080, "duration": round(t, 3),
           "durationInFrames": round(t * FPS), "scenes": scenes}
    (ROOT / "src" / "data" / "timeline.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    for s in scenes:
        print(f"{s['id']} {s['title']:<20} start {s['start']:6.2f}s  dur {s['duration']:5.2f}s")
    print(f"total {t:.2f}s")


if __name__ == "__main__":
    main()
