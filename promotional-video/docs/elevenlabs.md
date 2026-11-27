# ElevenLabs audio pipeline

Run from `promotional-video/` with `.venv/bin/python scripts/elevenlabs_audio.py`.

1. `check` shows the account and available models (free).
2. `voices` saves candidate metadata and free previews in `narration/`.
3. `estimate` shows clip characters, remaining characters and estimated spend (free).
4. `all --voice VOICE_ID` previews narration, music and SFX without paid calls.
5. `all --voice VOICE_ID --yes` generates and installs all audio, then rebuilds the timeline.

Separate generation: `narration --voice VOICE_ID --yes`, `music --yes`, `sfx --yes`.
After separate narration generation, run `.venv/bin/python scripts/timeline.py` before music.
TTS estimate: 1 credit per character; actual dollar value depends on your plan and model rate.
Music estimate: $0.15/minute. SFX estimate: $0.002/second.
Generated requests are cached in `.cache/elevenlabs/`; reruns reuse the cache.
The original free files are moved once into `public/_free_backup/` before replacement.
Restore them with `--restore-free`.
Offline check: `--selftest` and `.venv/bin/python -m py_compile scripts/elevenlabs_audio.py`.
