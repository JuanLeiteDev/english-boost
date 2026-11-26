"""Run the DEMO copy of the app (promotional-video/demo-workspace) with a simulated date.

- "today" is DEMO_TODAY for the server (the app code itself is not changed);
- local Whisper works with the installed PyAV (audio decoded with the system ffmpeg);
- the tutor is scripts/mock_agent.py (set in the demo state by setup_demo.py).

Run:  .venv/bin/python scripts/demo_server.py [--port 8790]
"""
import datetime as _dt
import os
import runpy
import sys
from pathlib import Path

PV = Path(__file__).resolve().parent.parent
DEMO = PV / "demo-workspace"
DEMO_TODAY = _dt.date.fromisoformat(os.environ.get("DEMO_TODAY", "2026-12-07"))


class _DemoDate(_dt.date):
    @classmethod
    def today(cls):
        return cls(DEMO_TODAY.year, DEMO_TODAY.month, DEMO_TODAY.day)


_dt.date = _DemoDate  # the server and dashboard parsers use `datetime.date.today()`

# faster-whisper's own decoder does not work with the installed PyAV: use ffmpeg instead
sys.path.insert(0, str(PV / "scripts"))
from audio_util import load_16k  # noqa: E402
import faster_whisper.transcribe as _fwt  # noqa: E402

_orig = _fwt.decode_audio
_fwt.decode_audio = lambda f, sampling_rate=16000, **k: load_16k(f) if isinstance(f, str) else _orig(f, sampling_rate, **k)

os.environ.setdefault("STT_MODELS_DIR", str(PV / ".tools" / "whisper"))
port = sys.argv[sys.argv.index("--port") + 1] if "--port" in sys.argv else "8790"
sys.argv = [str(DEMO / "app" / "server.py"), "--port", port, "--no-browser"]
runpy.run_path(str(DEMO / "app" / "server.py"), run_name="__main__")
