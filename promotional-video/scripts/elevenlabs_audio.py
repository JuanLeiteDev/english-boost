"""Generate cached ElevenLabs audio while preserving the Remotion file contract.

No API requests occur without --yes, except the free check/voices/estimate commands.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import wave
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent.parent
TEXTS = ROOT / "scripts/narration_text.json"
TIMELINE = ROOT / "src/data/timeline.json"
NARRATION_DATA = ROOT / "src/data/narration.json"
BACKUP = ROOT / "public/_free_backup"
SEED = 20261125
TTS_MODEL = "eleven_v4"
MUSIC_MODEL = "music_v2_5"
SFX_MODEL = "eleven_text_to_sound_v3"
SFX: dict[str, tuple[str, float, float]] = {
    "click": ("Single crisp, tiny premium interface click, dry and soft, no echo, no background.", .5, .06),
    "key": ("Single refined mechanical keyboard key tap, close and dry, no background.", .5, .16),
    "whoosh": ("Short airy digital interface transition whoosh, smooth and restrained, no impact.", 1., .9),
    "pop": ("Single soft rounded UI pop, warm and discreet, no echo.", .5, .22),
    "success": ("Elegant two note success chime, warm glassy synth, short decay, no background.", 1.2, 1.0),
    "rise": ("Smooth subtle electronic riser, clean upward motion, no crash or beat.", 1.5, 1.45),
    "tick": ("Single precise tiny clock tick for a modern interface, dry, no echo.", .5, .08),
    "rec": ("Single soft recording activation beep, warm and clean, no speech.", .6, .38),
}


def shared() -> tuple[Callable[..., Any], Callable[..., Any], Callable[..., Any]]:
    # Import only for live API work; el_client loads the local key itself.
    from el_client import client, cached, join
    return client, cached, join


def data(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def backup_once(path: Path) -> None:
    if path.exists():
        relative = path.relative_to(ROOT / "public") if path.is_relative_to(ROOT / "public") else Path("src/data") / path.name
        dest = BACKUP / relative
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), str(dest))


def install(source: Path, dest: Path) -> None:
    backup_once(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = dest.with_name(dest.name + ".tmp")
    shutil.copyfile(source, temp)
    temp.replace(dest)


def write_json(obj: Any, dest: Path) -> None:
    backup_once(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = dest.with_name(dest.name + ".tmp")
    temp.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    temp.replace(dest)


def restore_free() -> None:
    if not BACKUP.exists():
        raise RuntimeError("No free backup exists yet.")
    for source in BACKUP.rglob("*"):
        if source.is_file():
            rel = source.relative_to(BACKUP)
            dest = ROOT / "src/data" / rel.name if rel.parts[:2] == ("src", "data") else ROOT / "public" / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, dest)
            print(f"restored {dest.relative_to(ROOT)}")


def status_code(exc: Exception) -> int | None:
    return getattr(exc, "status_code", None) or getattr(exc, "status", None)


def api_message(exc: Exception) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        detail = body.get("detail", body)
        if isinstance(detail, dict):
            return str(detail.get("message", detail.get("detail", "API request failed")))
        return str(detail)
    return f"{type(exc).__name__}: API request failed"


def retry(fn: Callable[[], Any]) -> Any:
    for attempt in range(3):
        try:
            return fn()
        except Exception as exc:
            code = status_code(exc)
            if code in (401, 402, 403):
                raise RuntimeError(f"ElevenLabs {code} (key, plan or permissions): {api_message(exc)}") from None
            if code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError(f"ElevenLabs request failed ({code or 'unknown'}): {api_message(exc)}") from None
            time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def attributes(obj: Any) -> dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        return obj.model_dump(by_alias=True)
    return vars(obj)


def account(client: Any) -> dict[str, Any]:
    return attributes(retry(client.user.get))


def models(client: Any) -> list[dict[str, Any]]:
    return [attributes(m) for m in retry(client.models.list)]


def check() -> None:
    make_client, _, _ = shared()
    c = make_client()
    user = account(c)
    sub = attributes(retry(c.user.subscription.get))
    print(f"tier={sub.get('tier', 'unknown')} status={sub.get('status', 'unknown')} "
          f"characters={sub.get('character_count', 'unknown')}/{sub.get('character_limit', 'unknown')} "
          f"next_reset={sub.get('next_character_count_reset_unix', 'unknown')}")
    found = models(c)
    for m in found:
        langs = [attributes(x).get("language_id", "") for x in m.get("languages") or []]
        rate = m.get("model_rates") or {}
        print(f"{m['model_id']:30} tts={m.get('can_do_text_to_speech')} pt={'pt' in langs} "
              f"cost={rate or m.get('token_cost_factor', 'unknown')}")
    ids = {m["model_id"] for m in found}
    for wanted in (TTS_MODEL, MUSIC_MODEL, SFX_MODEL):
        print(f"{wanted}: {'available' if wanted in ids else 'not listed'}")
    if TTS_MODEL not in ids:
        print("TTS fallback:", next((x for x in ("eleven_v3", "eleven_multilingual_v2") if x in ids), "none listed"))


def voices() -> None:
    make_client, _, _ = shared()
    c = make_client()
    candidates: dict[str, dict[str, Any]] = {}
    for age in ("young", None):
        for use_case in ("narrative", "conversational"):
            token = None
            while True:
                result = attributes(retry(lambda: c.voices.search(language=["pt"], gender="male", age=age,
                    use_cases=[use_case], page_size=50, next_page_token=token)))
                for raw in result.get("voices", []):
                    v = attributes(raw)
                    candidates[v["voice_id"]] = {k: v.get(k) for k in
                        ("voice_id", "name", "labels", "description", "preview_url")}
                token = result.get("next_page_token")
                if not token:
                    break
    for raw in attributes(retry(c.voices.get_all)).get("voices", []):
        v = attributes(raw)
        candidates[v["voice_id"]] = {k: v.get(k) for k in
            ("voice_id", "name", "labels", "description", "preview_url")}
    rows = sorted(candidates.values(), key=lambda v: (not bool(re.search("brazil|brasil", str(v.get("labels")), re.I)), v.get("name") or ""))
    dest = ROOT / "narration/voice-candidates.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    previews = ROOT / "narration/voice-previews"
    previews.mkdir(parents=True, exist_ok=True)
    for v in rows:
        name = re.sub(r"[^a-z0-9]+", "-", (v.get("name") or "voice").lower()).strip("-")
        path = previews / f"{name}-{v['voice_id']}.mp3"
        if v.get("preview_url") and not path.exists():
            try:
                with urllib.request.urlopen(v["preview_url"], timeout=20) as response:
                    path.write_bytes(response.read())
            except Exception as exc:
                print(f"preview unavailable for {v['voice_id']}: {type(exc).__name__}")
        print(f"{v['voice_id']:24} {(v.get('name') or ''):22} {v.get('labels') or {}}")
    print(f"{len(rows)} voices; saved {dest.relative_to(ROOT)}")


def scene_groups(timeline: dict[str, Any]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for scene in timeline["scenes"]:
        item = {"ids": [scene["id"]], "duration": float(scene["duration"]), "title": scene.get("title", scene["id"])}
        if item["duration"] < 3 and groups:
            groups[-1]["ids"].append(item["ids"][0])
            groups[-1]["duration"] += item["duration"]
        else:
            groups.append(item)
    if len(groups) > 1 and groups[0]["duration"] < 3:
        first = groups.pop(0)
        groups[0]["ids"] = first["ids"] + groups[0]["ids"]
        groups[0]["duration"] += first["duration"]
    return groups


def composition_plan(timeline: dict[str, Any]) -> dict[str, Any]:
    phases = {
        "s1": "sparse, thoughtful analog synth intro",
        "s2": "discreet percussion enters, gentle digital pulse",
        "s3": "steady curious synth groove",
        "s4": "steady curious synth groove, light motion",
        "s5": "fuller brighter harmony, confident rhythmic lift",
        "s6": "fuller brighter harmony, warm momentum",
        "s7": "rising harmonic build, measured anticipation",
        "s8": "strong warm resolution, clear final hit and gentle decay",
    }
    negative = ["vocals", "lyrics", "choir", "aggressive drums", "distorted guitar", "busy lead melody", "harsh highs", "EDM drop"]
    groups = scene_groups(timeline)
    total_ms = round((float(timeline["duration"]) + 1) * 1000)
    lengths = [round(g["duration"] * 1000) for g in groups]
    lengths[-1] += total_ms - sum(lengths)
    sections = []
    for g, length in zip(groups, lengths):
        sections.append({"text": f"[{' + '.join(g['ids'])}: {g['title']}]", "duration_ms": length,
            "positive_styles": ["instrumental modern cinematic tech", "soft analog and digital synths",
                "subtle percussion", "space for spoken narration", phases[g["ids"][-1]]],
            "negative_styles": negative})
    return {"chunks": sections}


def costs(model: str = TTS_MODEL, *, show_account: bool = False) -> None:
    clips = data(TEXTS)
    counts = [(x["key"], len(x["text"])) for x in clips]
    total_chars = sum(n for _, n in counts)
    seconds = float(data(TIMELINE)["duration"]) + 1
    sfx_seconds = sum(x[1] for x in SFX.values())
    music_dollars = seconds / 60 * .15
    sfx_dollars = sfx_seconds * .002
    print("TTS characters:", ", ".join(f"{key}={n}" for key, n in counts), f"total={total_chars}")
    print(f"TTS base: {total_chars} credits at 1 credit/character (model {model})")
    print(f"Music: {seconds/60:.3f} min × $0.15 = ${music_dollars:.3f}")
    print(f"SFX: {sfx_seconds:.1f} s × $0.002 = ${sfx_dollars:.3f}")
    if show_account:
        make_client, _, _ = shared()
        c = make_client()
        sub = attributes(retry(c.user.subscription.get))
        model_info = next((m for m in models(c) if m["model_id"] == model), None)
        rate = (model_info or {}).get("model_rates") or {}
        multiplier = rate.get("character_cost_multiplier", 1)
        discount = rate.get("cost_discount_multiplier") or 1
        print(f"TTS model rate: {multiplier:g}×, discount: {discount:g}×; estimated {total_chars*multiplier*discount:g} credits")
        limit = sub.get("character_limit")
        used = sub.get("character_count")
        print("remaining characters:", limit - used if isinstance(limit, int) and isinstance(used, int) else "unknown")
    else:
        print("TTS model rate: check with `estimate` before purchase")
    print(f"Total: {total_chars} base TTS credits + ${music_dollars+sfx_dollars:.3f} music/SFX; "
          "TTS dollar value depends on the account plan")


def words_from_alignment(text: str, alignment: dict[str, Any]) -> list[dict[str, Any]]:
    chars = alignment["characters"]
    starts = alignment["character_start_times_seconds"]
    ends = alignment["character_end_times_seconds"]
    if not (len(chars) == len(starts) == len(ends)):
        raise ValueError("Character alignment arrays have different lengths")
    joined = "".join(chars)
    if joined != text:
        raise ValueError("Character alignment text differs from narration text")
    result = []
    for match in re.finditer(r"\S+", text):
        indices = [i for i in range(match.start(), match.end()) if not chars[i].isspace()]
        spoken = [i for i in indices if chars[i].isalnum()]
        active = spoken or indices
        result.append({"w": match.group(), "start": round(float(starts[active[0]]), 3),
                       "end": round(float(ends[active[-1]]), 3)})
    if not result or any(w["end"] < w["start"] for w in result):
        raise ValueError("Invalid word timings")
    return result


def forced_words(c: Any, audio: bytes, text: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    _, cached, _ = shared()
    path, _ = cached("forced-alignment", {**payload, "endpoint": "/v1/forced-alignment"}, "json",
        lambda: json.dumps(attributes(retry(lambda: c.forced_alignment.create(file=("clip.mp3", audio, "audio/mpeg"), text=text))),
            ensure_ascii=False).encode())
    aligned = data(path)
    words = [{"w": w["text"], "start": round(float(w["start"]), 3), "end": round(float(w["end"]), 3)}
             for w in aligned.get("words", [])]
    if not words:
        raise RuntimeError("Forced alignment returned no words")
    return words


def probe_duration(path: Path) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True)
    return float(p.stdout.strip())


def make_narration(voice: str, model: str, yes: bool) -> None:
    clips = data(TEXTS)
    if not yes:
        print(f"Would generate {len(clips)} pt-BR clips with voice={voice}, model={model}")
        costs(model)
        return
    make_client, cached, _ = shared()
    c = make_client()
    from elevenlabs.types import VoiceSettings
    outputs = []
    for i, item in enumerate(clips):
        settings = {"stability": .45, "similarity_boost": .8, "style": .25, "use_speaker_boost": True, "speed": 1.}
        payload = {"endpoint": "/v1/text-to-speech/with-timestamps", "voice": voice, "model": model,
                   "text": item["text"], "previous_text": clips[i-1]["text"] if i else None,
                   "next_text": clips[i+1]["text"] if i+1 < len(clips) else None,
                   "settings": settings, "seed": SEED}
        def generate() -> bytes:
            def invoke(config: dict[str, Any]) -> Any:
                return retry(lambda: c.text_to_speech.convert_with_timestamps(voice, text=item["text"],
                    model_id=model, language_code="pt", output_format="mp3_44100_128", seed=SEED,
                    previous_text=payload["previous_text"], next_text=payload["next_text"],
                    voice_settings=VoiceSettings(**config)))
            try:
                response = invoke(settings)
            except RuntimeError as exc:
                if "400" not in str(exc) and "422" not in str(exc):
                    raise
                response = invoke({"stability": .45, "similarity_boost": .8})
            value = attributes(response)
            return json.dumps(value, ensure_ascii=False).encode()
        response_path, hit = cached("tts", payload, "json", generate)
        response = data(response_path)
        audio = base64.b64decode(response["audio_base64"])
        dest = ROOT / "public/narration" / f"{item['key']}.mp3"
        temp = dest.with_suffix(".mp3.eleven.tmp")
        temp.parent.mkdir(parents=True, exist_ok=True)
        temp.write_bytes(audio)
        try:
            alignment = response.get("alignment") or response.get("normalized_alignment")
            try:
                words = words_from_alignment(item["text"], alignment) if alignment else []
            except (ValueError, KeyError, TypeError):
                words = []
            if not words:
                words = forced_words(c, audio, item["text"], payload)
            duration = round(probe_duration(temp), 3)
            if words[-1]["end"] > duration + .05:
                raise RuntimeError(f"Word alignment exceeds audio duration for {item['key']}")
            install(temp, dest)
            outputs.append({"key": item["key"], "file": f"narration/{item['key']}.mp3", "duration": duration, "words": words})
            print(f"{item['key']}: {duration:.2f}s, {len(words)} words ({'cached' if hit else 'new'})")
        finally:
            temp.unlink(missing_ok=True)
    write_json({"voice": voice, "model": model, "clips": outputs}, NARRATION_DATA)


def ffmpeg_convert(source: Path, dest: Path, filters: str, channels: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = dest.with_name(dest.stem + ".eleven.tmp.wav")
    try:
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-af", filters, "-ar", "48000", "-ac", str(channels), "-c:a", "pcm_s16le", str(temp)], check=True)
        install(temp, dest)
    finally:
        temp.unlink(missing_ok=True)


def make_music(yes: bool) -> None:
    timeline = data(TIMELINE)
    plan = composition_plan(timeline)
    seconds = float(timeline["duration"]) + 1
    if not yes:
        print(json.dumps(plan, ensure_ascii=False, indent=1))
        print(f"Would generate {seconds:.3f}s instrumental music; estimated ${seconds/60*.15:.3f}")
        return
    make_client, cached, join = shared()
    c = make_client()
    payload = {"endpoint": "/v1/music", "model": MUSIC_MODEL, "composition_plan": plan, "seed": SEED}
    def generate() -> bytes:
        try:
            return retry(lambda: join(c.music.compose(composition_plan=plan, model_id=MUSIC_MODEL,
                                                       seed=SEED)))
        except RuntimeError as exc:
            if "400" not in str(exc) and "422" not in str(exc):
                raise
            prompt = ("Instrumental modern cinematic technology soundtrack with soft analog and digital synths, "
                      "subtle percussion and space for narration. Sparse intro, growing groove, brighter highlights, "
                      "warm resolved final hit. No vocals, choir, aggressive drums, guitar, busy melody, harsh highs or EDM drop.")
            return retry(lambda: join(c.music.compose(prompt=prompt, music_length_ms=round(seconds*1000),
                                                       force_instrumental=True, model_id=MUSIC_MODEL)))
    path, hit = cached("music", payload, "mp3", generate)
    ffmpeg_convert(path, ROOT / "public/audio/music.wav",
                   f"apad,atrim=duration={seconds:.3f},asetpts=N/SR/TB", 2)
    print(f"music: {seconds:.3f}s ({'cached' if hit else 'new'})")


def make_sfx(yes: bool) -> None:
    if not yes:
        for name, (prompt, duration, limit) in SFX.items():
            print(f"{name}: {duration}s generation → ≤{limit}s; {prompt}")
        print(f"Would generate {sum(x[1] for x in SFX.values()):.1f}s SFX; estimated ${sum(x[1] for x in SFX.values())*.002:.3f}")
        return
    make_client, cached, join = shared()
    c = make_client()
    for name, (prompt, duration, limit) in SFX.items():
        payload = {"endpoint": "/v1/sound-generation", "model": SFX_MODEL, "name": name,
                   "text": prompt, "duration_seconds": duration, "prompt_influence": .6, "seed": SEED}
        path, hit = cached("sfx", payload, "mp3", lambda: retry(lambda: join(c.text_to_sound_effects.convert(
            text=prompt, duration_seconds=duration, prompt_influence=.6, model_id=SFX_MODEL,
            output_format="mp3_44100_128"))))
        process_sfx(path, ROOT / "public/audio/sfx" / f"{name}.wav", limit)
        print(f"{name}: {'cached' if hit else 'new'}")


def process_sfx(source: Path, dest: Path, limit: float) -> None:
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(source), "-ac", "1", "-ar", "48000",
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    samples = np.frombuffer(raw, dtype=np.float32).copy()
    if not len(samples):
        raise RuntimeError(f"Empty sound effect: {source.name}")
    threshold = max(float(np.max(np.abs(samples))) * .01, 10 ** (-48 / 20))
    active = np.flatnonzero(np.abs(samples) > threshold)
    if not len(active):
        raise RuntimeError(f"Silent sound effect: {source.name}")
    samples = samples[active[0]:active[-1] + 1][:round(limit * 48000)]
    fade_in = min(len(samples) // 4, round(.005 * 48000))
    fade_out = min(len(samples) // 4, round(.012 * 48000))
    samples[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)
    samples[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)
    peak = float(np.max(np.abs(samples)))
    samples *= (10 ** (-6 / 20)) / peak
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = dest.with_name(dest.stem + ".eleven.tmp.wav")
    try:
        with wave.open(str(temp), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(48000)
            wav.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        install(temp, dest)
    finally:
        temp.unlink(missing_ok=True)


def rebuild_timeline() -> None:
    backup_once(TIMELINE)
    subprocess.run([sys.executable, str(ROOT / "scripts/timeline.py")], cwd=ROOT, check=True)


def learner_hash() -> str:
    return hashlib.sha256((ROOT / "public/speaking/learner-en.mp3").read_bytes()).hexdigest()


def rebuild_learner_env() -> None:
    # Kept for an exceptional learner clip change; normal generation does not touch it.
    import numpy as np
    source = ROOT / "public/speaking/learner-en.mp3"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(source), "-ac", "1", "-ar", "16000",
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    samples = np.frombuffer(raw, dtype=np.float32)
    fps = int(data(TIMELINE)["fps"])
    step = 16000 / fps
    env = []
    for i in range(math.ceil(len(samples) / step)):
        chunk = samples[round(i*step):round((i+1)*step)]
        env.append(round(float(np.sqrt(np.mean(chunk*chunk))) if len(chunk) else 0, 3))
    peak = max(env, default=1) or 1
    write_json({"fps": fps, "env": [round(x/peak, 3) for x in env]}, ROOT / "src/data/learner-env.json")


def selftest() -> None:
    sample = "Hi, world!"
    starts = [i*.1 for i in range(len(sample))]
    ends = [(i+1)*.1 for i in range(len(sample))]
    words = words_from_alignment(sample, {"characters": list(sample),
        "character_start_times_seconds": starts, "character_end_times_seconds": ends})
    assert [w["w"] for w in words] == ["Hi,", "world!"]
    assert words[0]["start"] == 0 and words[0]["end"] == .2
    assert words[1]["start"] == .4 and words[1]["end"] == .9
    fake = {"duration": 8., "scenes": [{"id": "s1", "duration": 2., "title": "intro"},
        {"id": "s2", "duration": 3., "title": "beat"}, {"id": "s8", "duration": 3., "title": "end"}]}
    plan = composition_plan(fake)
    assert len(plan["chunks"]) == 2
    assert sum(s["duration_ms"] for s in plan["chunks"]) == 9000
    assert plan["chunks"][0]["duration_ms"] == 5000
    print("selftest passed")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selftest", action="store_true", help="Run offline alignment and composition-plan assertions")
    parser.add_argument("--restore-free", action="store_true", help="Restore original audio from public/_free_backup")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("check", help="Inspect free account and available models")
    sub.add_parser("voices", help="Find and preview Portuguese male voices")
    sub.add_parser("estimate", help="Estimate generation usage and cost")
    for name in ("narration", "music", "sfx", "all"):
        p = sub.add_parser(name, help=f"Preview or generate {name}")
        p.add_argument("--yes", action="store_true", help="Make paid API calls and install outputs")
        if name in ("narration", "all"):
            p.add_argument("--voice", required=True, help="ElevenLabs voice ID")
            p.add_argument("--model", default=TTS_MODEL, help="TTS model ID (default: eleven_v4)")
    args = parser.parse_args()
    try:
        if args.selftest:
            selftest()
        elif args.restore_free:
            restore_free()
        elif args.command == "check":
            check()
        elif args.command == "voices":
            voices()
        elif args.command == "estimate":
            costs(show_account=True)
        elif args.command == "narration":
            make_narration(args.voice, args.model, args.yes)
        elif args.command == "music":
            make_music(args.yes)
        elif args.command == "sfx":
            make_sfx(args.yes)
        elif args.command == "all":
            original = learner_hash() if args.yes else ""
            make_narration(args.voice, args.model, args.yes)
            if args.yes:
                rebuild_timeline()  # music must follow the new narration durations
            make_music(args.yes)
            make_sfx(args.yes)
            if args.yes:
                rebuild_timeline()
                if learner_hash() != original:
                    rebuild_learner_env()
        else:
            parser.print_help()
    except (RuntimeError, subprocess.CalledProcessError, ValueError) as exc:
        parser.exit(1, f"error: {exc}\n")


if __name__ == "__main__":
    main()
