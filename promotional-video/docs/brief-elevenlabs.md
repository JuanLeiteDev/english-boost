# Brief: ElevenLabs audio pipeline (worker: Codex) — write code only

Work ONLY inside `promotional-video/`. You have no network: write and unit-check the code, do
not call the API. Never read, print or copy `.env` (it holds the user's key). The coordinator runs
your script later.

## Goal
One script, `scripts/elevenlabs_audio.py` (run with `.venv/bin/python`, SDK `elevenlabs` 2.80.0 and
`python-dotenv` are installed; reuse `scripts/el_client.py`: `client()`, `cached()`, `join()`), that
replaces the current free audio (edge-tts narration, numpy music/SFX) with ElevenLabs audio while
keeping EXACTLY the same output contract, so the Remotion project needs no changes:

- `public/narration/<key>.mp3` and `src/data/narration.json` =
  `{"voice": str, "model": str, "clips": [{"key","file":"narration/<key>.mp3","duration": s,"words":[{"w","start","end"}]}]}`
  (keys s1, s2, s3, s4, s5, s6a, s6b, s7, s8 — see `scripts/narration.py` for the current texts).
- `public/audio/music.wav` (48 kHz 16-bit stereo; convert with ffmpeg; length = timeline + 1 s).
- `public/audio/sfx/{click,key,whoosh,pop,success,rise,tick,rec}.wav` (48 kHz 16-bit mono, peak ≈ -6 dBFS,
  trimmed silence, short fades; convert with ffmpeg).
- Before overwriting, move the current files to `public/_free_backup/` (once) so the free version can
  be restored with `--restore-free`.

## Subcommands (argparse)
- `check` (free): GET /v1/user (print tier, status, character_count/limit, next reset), list models
  (`client.models.list()` or GET /v1/models) and print id, can_do_text_to_speech, whether `pt` is in
  languages, cost multiplier. Confirm that `eleven_v4`, `music_v2_5`, `eleven_text_to_sound_v3`
  exist; if not, print the best available fallback (TTS: eleven_v3 → eleven_multilingual_v2).
  Print errors with the API's message but never the key.
- `voices` (free): GET https://api.elevenlabs.io/v2/voices with language ["pt"], gender male,
  age young (also try without age), use_cases narrative/conversational, page_size 50; also include
  the account's own voices. Prefer labels/accent mentioning Brazil/Brazilian. Save
  `narration/voice-candidates.json` (voice_id, name, labels, description, preview_url) and download the
  free `preview_url` mp3s to `narration/voice-previews/<name>-<id>.mp3`. Print a short table.
- `estimate` (free): characters per clip and total, credits/$ for TTS (1 credit/char; show model rate),
  music minutes × $0.15, SFX seconds × $0.002; one-line total. Also show the account's remaining characters.
- `narration --voice <id> [--model eleven_v4] [--yes]`: final pt-BR texts (store them in
  `scripts/narration_text.json`, a list of {key, text}; take the texts from `scripts/narration.py`
  but write "Erasmus", "Cambridge", "speaking", "listening" normally — no phonetic spellings).
  Call POST /v1/text-to-speech/{voice_id}/with-timestamps (SDK `text_to_speech.convert_with_timestamps`
  if present, else httpx) with language_code "pt", output mp3_44100_128, a fixed `seed`, and
  `previous_text`/`next_text` set to the neighbouring clips for consistent prosody. Voice settings:
  stability 0.45, similarity_boost 0.8, style 0.25, use_speaker_boost true, speed 1.0 (drop fields the
  model rejects, retry once). Build word timings from the character alignment (split on spaces,
  strip punctuation from `w` only for matching but keep it in `w`). If alignment is missing, call
  forced alignment (POST /v1/forced-alignment, multipart file + text) and use its `words`.
  Every call goes through `cached(...)` keyed on (endpoint, voice, model, text, settings, seed).
  Without `--yes` print what would be generated and its cost, and exit.
- `music [--yes]`: model `music_v2_5`, instrumental. Build a composition plan from
  `src/data/timeline.json`: one chunk per scene (merge any scene < 3 s with its neighbour), durations
  in ms matching the scene durations (the last chunk adds the +1 s tail). Global intent: modern,
  cinematic tech, soft analog/digital synths, discreet percussion, progression = sparse intro (s1) →
  beat enters (s2) → steady curious groove (s3–s4) → fuller and brighter for the two highlights (s5–s6)
  → build (s7) → strong, warm resolution with a clear final hit (s8). Negative styles: vocals, lyrics,
  choir, aggressive drums, distorted guitar, busy lead melody, harsh highs, EDM drop. Put the styles in
  `positive_styles`/`negative_styles` per chunk and keep `text` to a short [Section] label with no
  lyrics. Use `client.music.compose(composition_plan=..., model_id=...)` (fallback: REST POST /v1/music).
  If the plan is rejected, fall back to `prompt` + `music_length_ms` + `force_instrumental=True`.
  Cache it; without `--yes` only print the plan and cost.
- `sfx [--yes]`: model `eleven_text_to_sound_v3`, one call per SFX name with a precise, minimal,
  premium-UI prompt and a duration (click 0.5 s → trim to ~60 ms, key 0.5 s, whoosh 1.0 s, pop 0.5 s,
  success 1.2 s, rise 1.5 s, tick 0.5 s, rec 0.6 s), prompt_influence 0.6. Then trim leading silence,
  limit length, normalise peak to -6 dBFS, fade in/out (ffmpeg or numpy+soundfile).
- `all --voice <id> [--yes]`: narration, music, sfx in that order, then run
  `.venv/bin/python scripts/timeline.py` and `.venv/bin/python - ` to rebuild `src/data/learner-env.json`
  only if `public/speaking/learner-en.mp3` changed (it should not).
- `--restore-free`: copy the backup back.

## Quality bar
- Clear `--help`; type hints; small functions; no secrets in output or files.
- Robust: retries with backoff on 429/5xx (max 3), clear message on 401/402/403 (permissions / plan).
- Add `docs/elevenlabs.md` (≤ 25 lines): how to run, what each step costs, cache location, how to
  restore the free version.
- Self-check without network: `python -m py_compile`, and a `--selftest` flag that runs the alignment
  → words conversion and the composition-plan builder on fake data and asserts the outputs.
- Final message: files created and the exact commands the coordinator should run, in order.
