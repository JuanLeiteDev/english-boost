"""ElevenLabs client + local cache shared by the audio scripts.

The API key is read from promotional-video/.env (git-ignored) and never printed.
Every generation is cached in .cache/elevenlabs/<sha256 of the request>.<ext>: the same
request is never sent twice, and Remotion only reads the files in public/ (no API calls
while rendering).
"""
import hashlib
import json
import os
from pathlib import Path

from dotenv import load_dotenv

PV = Path(__file__).resolve().parent.parent
CACHE = PV / ".cache" / "elevenlabs"
load_dotenv(PV / ".env")


def client():
    from elevenlabs.client import ElevenLabs

    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise SystemExit("Missing ELEVENLABS_API_KEY in promotional-video/.env")
    return ElevenLabs(api_key=key)


def key_of(kind: str, payload: dict) -> str:
    raw = json.dumps({"kind": kind, **payload}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def cached(kind: str, payload: dict, ext: str, make) -> tuple[Path, bool]:
    """Return (path, was_cached). `make()` returns bytes and is only called on a cache miss."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{kind}-{key_of(kind, payload)}.{ext}"
    if path.exists() and path.stat().st_size > 0:
        return path, True
    data = make()
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)
    (path.with_name(path.name + ".meta.json")).write_text(json.dumps({"kind": kind, **payload}, ensure_ascii=False, indent=1), encoding="utf-8")
    return path, False


def join(chunks) -> bytes:
    if isinstance(chunks, (bytes, bytearray)):
        return bytes(chunks)
    return b"".join(chunks)
