# Brief: final QA of the rendered video (worker: Codex)

Work ONLY inside `promotional-video/`. No network. Never open `.env`. Do not call ElevenLabs and do
not touch `scripts/elevenlabs_audio.py`, `scripts/el_client.py`, `.cache/`, `public/narration`,
`public/audio`, `public/recordings`, `demo-workspace/`.

Input: `out/english-boost-promo-v2.mp4` (1920×1080, 60 fps, ~61 s), rendered from `src/` (Remotion).
Timeline: `src/data/timeline.json`; narration word timings: `src/data/narration.json`.

## 1. Audio mix (measure with ffmpeg; report numbers)
- Integrated loudness and true peak of the whole file. Target for the final file: **-14 LUFS ±1,
  true peak ≤ -1 dBTP** (online sharing).
- For each narration span (scene start + audio.at → + last word end), measure music-vs-voice balance:
  render a music-only stem if useful (e.g. temporarily set voice/SFX volume to 0 in a copy of the
  props is NOT allowed; instead estimate from `public/audio/music.wav` with the ducking curve in
  `src/Promo.tsx` `Music`). Voice should sit clearly on top (music ≈ 15–20 dB below the voice while
  speaking) and the music should fill the gaps between lines without jumps.
- Check every SFX in `src/scenes/*.tsx` (`<Sfx at=… volume=…>`): none should collide with a stressed
  word or be louder than the voice. Listen for clipping/harsh transients by checking peaks per 100 ms
  window around each SFX time.
- You MAY edit volumes only: the `volume` values in `src/Promo.tsx` (`Music`: base level and ducking
  depth/ramp; `Soundtrack` voice volume) and the `volume={…}` props of `<Sfx>` in `src/scenes/*.tsx`.
  Keep changes small and explain each one.

## 2. Sync and visuals (extract frames with ffmpeg; look at them downscaled)
- For each scene, check 3 frames (start+0.3 s, middle, end-0.3 s) and each SFX moment: text must land
  with the matching narration word (see `say(...)` calls), no element covers important UI text, no
  black/blank frames, no cut-off words, no overlapping text.
- Report problems as a short list: time (s), scene, what is wrong, suggested fix. You MAY fix pure
  timing/position constants in `src/scenes/*.tsx` (seconds offsets, x/y/z camera numbers, paddings)
  when the fix is obvious; do not restructure components.

## 3. Finish
- If you changed anything, run `source env.sh && npx tsc --noEmit` (must pass).
- Write `docs/qa-report.md` (≤ 40 lines): measurements, problems found, what you changed, and
  what still needs a human decision.
- Do not render the full video (the coordinator renders); you may render single frames with
  `source env.sh && node scripts/stills.mjs <outDir> <frame,frame> 0.5` if Chrome works in your sandbox.
- Final message: a 10-line summary.
