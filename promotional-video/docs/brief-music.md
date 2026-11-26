# Brief: original music + sound effects (worker: Codex)

You work ONLY inside `promotional-video/`. Do not touch any other file or folder of the
repository, and do not modify existing files except the ones you create below.
No network access is needed: synthesise everything with Python + numpy + soundfile, which are
installed in `promotional-video/.venv` (run `.venv/bin/python`). Do not download samples or
music, and do not use any third-party audio: the track must be 100% original.

## Context
A ~57 s product video (Apple / Linear / Vercel style) about a personal English-learning app.
Narration in Portuguese runs on top of the music, so the music must leave room for the voice
(the video editor will duck it under the narration; deliver it at full level).
The scene timeline is in `src/data/timeline.json` (`scenes[].start`, `duration`, total `duration`).

## Deliverables
1. `scripts/music.py`: a reproducible generator (fixed random seed). Re-running it must
   rebuild the files below from `src/data/timeline.json`.
2. `public/audio/music.wav`: 48 kHz, 16-bit, stereo, length = timeline duration + 1.0 s.
   - Style: minimal, modern, warm electronic. Soft pad chords (detuned saws through a
     low-pass), a gentle plucked arpeggio, light sub bass, a soft kick/closed hat that enters
     after the first scene. Around 100 BPM. Major/suspended harmony, optimistic but calm.
     No harsh highs, nothing busy, no melody that competes with a voice (keep 1–4 kHz calm).
   - Structure that follows the timeline: scene s1 = sparse intro (pad + slow pulse);
     from s2 the beat enters; s5 and s6 (the two highlight scenes) slightly fuller; s7 builds;
     s8 resolves to a final chord with a soft "hit" at s8.start + 0.3 s and a natural tail fade.
   - At every scene start from s2 onwards, place a subtle transition accent (a short reversed
     swell ending exactly on the cut, or a soft low impact). Keep them tasteful and quiet.
   - Loudness: about -16 LUFS integrated (approximate with RMS is fine), true peak below -1 dBFS.
     Short fade-in (0.3 s) at the start.
3. `public/audio/sfx/`: short, discreet UI sounds, 48 kHz 16-bit mono WAV, peak about -6 dBFS,
   each with clean attack and decay and no clicks:
   - `click.wav` (soft mouse click, ~40 ms), `key.wav` (one soft keyboard tick, ~30 ms),
   - `whoosh.wav` (airy filtered-noise sweep, ~450 ms), `pop.wav` (gentle bubble pop for a
     chat message, ~120 ms), `success.wav` (two soft sine/bell notes, rising, ~500 ms),
   - `rise.wav` (short tonal riser, ~900 ms), `tick.wav` (tiny counter tick, ~20 ms),
   - `rec.wav` (soft "recording starts" blip, ~200 ms).
4. `docs/music-notes.md`: 10 lines max. Key, BPM, what happens in each scene, and where the
   accents are (in seconds).

## Check before you finish
- Print each file's duration, sample rate and peak level with a small Python check.
- Make sure nothing clips and that `music.wav` duration matches the timeline + 1 s.
- In your final message, list the files you created.
