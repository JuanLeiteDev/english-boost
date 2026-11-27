# Brief: record the REAL app UI (worker: Claude subagent)

Goal: high-quality screen recordings of the real English Boost web app, driven by automation,
to be used inside a Remotion video. The UI must be the real app (no mock-ups).

## Hard rules
- Work only inside `promotional-video/`. Never write to the real project (`../app`, `../progress`,
  `../plan`, `../app/state`, …). The app you record is the **demo copy** in `demo-workspace/`.
- Use the tools already installed: local Node (`source env.sh`), Playwright (`node_modules`,
  browsers in `.tools/ms-playwright`, so set `PLAYWRIGHT_BROWSERS_PATH=$PWD/.tools/ms-playwright`),
  Python in `.venv`, and the system `ffmpeg`.
- Do not modify `src/`, `public/narration`, `public/audio`, `scripts/narration.py`, `scripts/timeline.py`,
  `scripts/mock_agent.py`, `scripts/demo_server.py` or `scripts/setup_demo.py`. Another worker is
  writing `public/audio/` and `scripts/music.py` at the same time.

## The demo app
- `.venv/bin/python scripts/setup_demo.py` rebuilds `demo-workspace/` from scratch (clean chat,
  demo data, today = 2026-12-07, day 13, 56 days left). Run it before each full recording pass.
- `.venv/bin/python scripts/demo_server.py --port 8790` starts it (a copy may already be running
  on 8790; restart it after setup_demo so the state is clean, e.g. kill the old process by port).
  Wait for `GET /api/health`.
- The tutor is `scripts/mock_agent.py`: it streams scripted replies in the real Claude CLI format.
  It matches on keywords: a message containing "listening" gets the Cambridge reply (with an
  "open" pill for `ceq.inspera.com`); a message containing "1. B" gets the 6/7 grading; a message
  containing "Belgium"/"months" gets the speaking correction.
- Local Whisper is real (`base.en`, first use downloads the model to `.tools/whisper`).
- Read `../app/static/app.js`, `index.html` and `style.css` to find selectors. Key ones: tabs
  `#panel-tabs button[data-tab=…]`, chat input `#input`, send `#btn-send`, mic `#btn-mic`,
  calendar days `.cal button.d[data-date=…]`, day dialog `#dlg-day`, unit inputs `.ex-input`,
  check button `#ex-check`.

## Capture setup (quality matters most)
- Chromium via Playwright, headless, viewport **1920×1080**, `deviceScaleFactor: 2`, so frames are
  **3840×2160**. Dark theme: before the page loads, set `localStorage.theme = '"dark"'` and
  `localStorage.chatW = '540'` (wider chat for readability). Use the origin `http://127.0.0.1:8790`.
- Record with the Chrome DevTools Protocol screencast (`Page.startScreencast`, jpeg quality 95+,
  maxWidth 3840, maxHeight 2160, ack every frame), store frames with their timestamps, and build a
  **constant 60 fps** H.264 MP4 with ffmpeg (concat demuxer with per-frame durations, then
  `-r 60 -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -movflags +faststart`).
  The screencast only sends frames when the page changes: hold the last frame for idle time.
  If the screencast proves unreliable, use another approach that still gives sharp 4K 60 fps.
- Headless shows no mouse cursor. Do NOT draw one; instead log every pointer action. Move the
  mouse with `page.mouse.move(x, y, {steps})` along natural paths before clicks, so hover states
  are real. Type with a human delay (40–90 ms per key, slightly random).
- Fake microphone: launch with `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`,
  `--use-file-for-fake-audio-capture=<abs path>.wav%noloop` and grant the `microphone` permission.
  Make that WAV from `public/speaking/learner-en.mp3` (16-bit PCM, 48 kHz, mono, with ~0.4 s of
  silence before and ~0.6 s after) and save it as `recordings/learner-en.wav`.
- Block navigation away from the app: route `ceq.inspera.com` and any other external URL to an
  empty 204 response, and close any popup page immediately (the "open" pill opens a new tab).
- Start each clip with ~0.7 s of a calm, fully loaded UI and end with ~1 s of hold.

## Clips to deliver (`public/recordings/`)
For every clip: `<name>.mp4` plus `<name>.json` =
`{"fps":60,"width":1920,"height":1080,"duration":<s>,"events":[{"t":<s>,"type":"move|down|up|click|key|mark","x":<css px>,"y":<css px>,"label":"…"}]}`.
Coordinates in CSS pixels of the 1920×1080 viewport. Add `mark` events (with `x`,`y` of the
element's centre and a `box` `[x,y,w,h]`) for key moments, named as below, so the editor can zoom
and sync sound effects on them.

1. `today` (~8 s): Study › Today tab. Pause, move to the timer, click play (`mark: timer-start`),
   move down and tick the checkbox of block 04 Vocabulary (`mark: block-done`). Then hover the
   "Start/Open" button of block 01 without clicking.
2. `exercise` (~11 s): go to Grammar, click the P1-01 card (`mark: open-unit`), the unit opens in
   the Exercise tab. Scroll smoothly to the first exercise list. Type answers into the first 4
   inputs: 3 correct ones and 1 typical learner mistake (check the key in
   `demo-workspace/materials/grammar/answers/P1-01.md`). Click Check (`mark: check`): green and
   red marks appear. Hold.
3. `research` (~8 s): open the document `research/2026-11-24-fundamentacao.md` in the Document tab
   (you may trigger it with `page.evaluate` through a doc link, or the app's own handlers; the UI
   must look natural). Smooth, slow scroll from the title to the table "Comparação dos programas"
   (`mark: table`) and hold on it.
4. `cambridge` (~18 s): Today tab visible on the left. In the chat, type
   "Let's do today's listening." and send (`mark: send-1`). The reply streams with tool steps and
   the "ceq.inspera.com" pill (`mark: pill`). Hover the pill and click it (popup is blocked/closed).
   Then type the answers on separate lines (Shift+Enter) "1. B" … "7. C" with
   `1. B, 2. B, 3. A, 4. C, 5. B, 6. C, 7. C` and send (`mark: send-2`). The grading streams
   (`mark: reply-2`, when the text "6/7" is visible, with its box). Hold until finished.
5. `speaking` (~16 s): start from a clean chat (run setup_demo + restart the server first). Click the
   mic (`mark: mic-on`), recording bar counts while the fake audio plays (~4 s), click the mic again
   (`mark: mic-off`), the app shows "Writing down what you said…", then the real Whisper text
   appears in the input (`mark: transcript`). Click send (`mark: send`). The correction streams with
   the struck-through "on two months" → "in two months" (`mark: correction`, with its box). Hold.
   Warm Whisper up once before recording so the transcription is quick.
6. `progress` (~13 s): Progress page. Let the stats animate (`mark: stats`). Move to the calendar,
   hover a few days, click 2026-12-03 (`mark: day-dialog`), hold ~2.5 s on the dialog, close it.
   Then click the "2026-11-25-C0-result" link under Results (`mark: level`): the document with the
   level (A2+ / B1-) opens. Hold.

Also save stills (PNG, 3840×2160) to `public/stills/`: `app-today.png` (clean Today view, chat with
the welcome screen), `progress.png`, `grammar.png`.

## Verify before you finish
- Extract 3–4 frames per clip (ffmpeg `-ss … -frames:v 1`, scaled to 1280 wide) and look at them:
  sharp text, dark theme, no blank frames, no error toasts, the right content in each moment.
- `ffprobe` every MP4: 3840×2160, 60 fps, expected duration.
- Write `docs/recordings.md` (short): one line per clip with duration and its marks in seconds.
- Kill the demo server you started when done.
- Final message: the list of files, any problems, and anything that looks off.
