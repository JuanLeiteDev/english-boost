/* English Boost: front-end (vanilla JS, no build step). */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const S = { state: null, agent: store.get("agent", "claude"), running: false, unit: null, key: null, docPath: null, filter: store.get("gFilter", "all"), tab: "today" };

  /* ---------------- helpers ---------------- */
  const ic = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = (s) => MD.esc(String(s ?? ""));
  const MK_GOOD = `<span class="mk mk-good" aria-label="right"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>`;
  const MK_BAD = `<span class="mk mk-bad" aria-label="wrong"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></span>`;
  const st = (c, t) => `<span class="st st-${c}" title="${t}"></span>`;
  // Content files may use a few emoji as markers; the UI shows designed indicators instead.
  const EMOJI_UI = [
    [/✅/g, st("done", "mastered")], [/☑️?/g, st("ok", "done")], [/🔄/g, st("redo", "repeat")], [/⬜/g, st("todo", "to do")],
    [/❌/g, MK_BAD], [/✔️?|✓/g, MK_GOOD], [/✗/g, MK_BAD],
    [/🇺🇸/g, '<span class="tag">US</span>'], [/🇬🇧/g, '<span class="tag">UK</span>'], [/🇧🇪/g, '<span class="tag">BE</span>'],
    [/🌍/g, '<span class="tag">Global</span>'], [/💰/g, '<span class="tag">Paid</span>'],
  ];
  const EMOJI_ANY = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;
  const ui = (html) => EMOJI_UI.reduce((s, [r, v]) => s.replace(r, v), String(html)).replace(EMOJI_ANY, "");
  const noEmoji = (s) => String(s || "").replace(EMOJI_ANY, "").replace(/\s+/g, " ").trim();
  const plain = (s) => String(s || "").replace(EMOJI_ANY, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
  const md = (src) => ui(MD.render(src));
  const inline = (src) => ui(MD.inline(src));

  async function refreshToken() {  // the server makes a new token on every start
    try { const r = await fetch("/api/token", { cache: "no-store" }); if (r.ok) window.TOKEN = (await r.json()).token; } catch { /* offline */ }
  }
  async function post(path, payload, retry = true, raw = null) {
    const headers = { "X-Token": window.TOKEN, "Content-Type": raw ? (raw.type || "application/octet-stream") : "application/json" };
    const r = await fetch(path, { method: "POST", headers, body: raw || JSON.stringify(payload) });
    if (r.status === 403 && retry) { await refreshToken(); return post(path, payload, false, raw); }
    return r;
  }
  async function api(path, body) {
    let r;
    try { r = body === undefined ? await fetch(path, { cache: "no-store" }) : await post(path, body); }
    catch { throw new Error("No connection to the app. Is it running? (docker compose up -d)"); }
    if (!r.ok) {
      const t = await r.text();
      let msg = t; try { msg = JSON.parse(t).error || t; } catch { /* plain text */ }
      throw new Error(msg || r.statusText);
    }
    return r.json();
  }
  function toast(msg, ms = 2600, kind = "ok") {
    const t = $("#toast");
    t.className = kind === "bad" ? "bad" : "";
    t.innerHTML = `${ic(kind === "bad" ? "alert" : "check", "sm")}<span></span>`;
    $("span", t).textContent = noEmoji(msg);
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
  }
  function fmtDate(iso) {
    if (!iso) return "";
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  }
  function stagger(root) { [...root.children].forEach((el, i) => el.style.setProperty("--i", Math.min(i, 24))); root.classList.add("stagger"); }
  const phaseLabel = (s) => (!s.day ? `Starts ${fmtDate(s.plan?.date)}` : s.day > 69 ? "Erasmus" : s.day >= 40 ? "Phase 2 · Erasmus intensive" : "Phase 1 · Foundation");

  /* underline thumb for the main tabs */
  function moveThumb(nav) {
    const th = $(".thumb", nav), a = $("button.active", nav);
    if (!th) return;
    if (!a || !a.offsetWidth) { th.style.opacity = "0"; return; }
    th.style.opacity = "1"; th.style.width = `${a.offsetWidth}px`; th.style.transform = `translateX(${a.offsetLeft}px)`;
  }
  function setActive(el, pred) { $$("button", el).forEach((b) => b.classList.toggle("active", pred(b))); moveThumb(el); }
  const refreshThumbs = () => moveThumb($("#panel-tabs"));
  window.addEventListener("resize", refreshThumbs);
  if (document.fonts) document.fonts.ready.then(refreshThumbs);

  /* theme */
  const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  function paintThemeBtn() {
    const dark = isDark();
    $("#btn-theme").innerHTML = ic(dark ? "sun" : "moon");
    $("#btn-theme").title = dark ? "Light theme" : "Dark theme";
  }
  function toggleTheme() {
    const next = isDark() ? "light" : "dark";
    const apply = () => { document.documentElement.dataset.theme = next; store.set("theme", next); paintThemeBtn(); };
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    // the new theme grows as a circle from the button until it covers the whole screen
    const r = $("#btn-theme").getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(apply);
    vt.ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 750, easing: "cubic-bezier(.2,.7,.1,1)", pseudoElement: "::view-transition-new(root)" },
    )).catch(() => {});
  }

  /* layout: show/hide sidebar and chat, resize the chat */
  const CHAT_MIN = () => (innerWidth <= 1320 ? 360 : 400);
  const CHAT_MAX = () => Math.max(CHAT_MIN(), Math.min(760, Math.round(innerWidth * 0.55)));
  function setChatWidth(w, save = true) {
    if (!w) { document.documentElement.style.removeProperty("--chat"); if (save) store.set("chatW", null); return; }
    const px = Math.round(Math.max(CHAT_MIN(), Math.min(CHAT_MAX(), w)));
    document.documentElement.style.setProperty("--chat", `${px}px`);
    if (save) store.set("chatW", px);
  }
  function setLayout(key, closed) {
    document.body.classList.toggle(key, closed);
    store.set(key, closed);
    setTimeout(refreshThumbs, 520);
  }
  const toggleSide = () => setLayout("side-closed", !document.body.classList.contains("side-closed"));
  const toggleChatPanel = () => setLayout("chat-closed", !document.body.classList.contains("chat-closed"));
  function initLayout() {
    if (store.get("side-closed", false)) document.body.classList.add("side-closed");
    if (store.get("chat-closed", false)) document.body.classList.add("chat-closed");
    const w = store.get("chatW", null);
    if (w) setChatWidth(w, false);
    $("#btn-side-hide").onclick = toggleSide;
    $("#btn-side-show").onclick = toggleSide;
    $("#btn-chat-hide").onclick = toggleChatPanel;
    $("#btn-chat-show").onclick = toggleChatPanel;
    const handle = $("#chat-resize");
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add("resizing");
      const move = (ev) => setChatWidth(innerWidth - ev.clientX, false);
      const up = (ev) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        document.body.classList.remove("resizing");
        setChatWidth(innerWidth - ev.clientX);
        refreshThumbs();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
    handle.addEventListener("dblclick", () => { setChatWidth(null); refreshThumbs(); });
    window.addEventListener("resize", () => { const v = store.get("chatW", null); if (v) setChatWidth(v, false); });
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === "b") { e.preventDefault(); toggleSide(); }
      if (e.key.toLowerCase() === "j") { e.preventDefault(); toggleChatPanel(); }
    });
  }

  /* ---------------- router ---------------- */
  function route() {
    let v = (location.hash || "#study").slice(1);
    if (!["study", "grammar", "progress"].includes(v)) v = "study";
    $$(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${v}`));
    $$(".side a.nav").forEach((a) => a.classList.toggle("active", a.dataset.view === v));
    if (v === "grammar") renderGrammar();
    if (v === "progress") renderProgress();
    requestAnimationFrame(refreshThumbs);
  }
  window.addEventListener("hashchange", route);

  /* ---------------- state ---------------- */
  async function loadState() {
    S.state = await api("/api/state");
    $$("[data-dot]").forEach((d) => d.classList.toggle("on", !!S.state.agents?.[d.dataset.dot]));
    $("#count-days").innerHTML = `${S.state.days_left}<em>.</em>`;
    $("#eyebrow").textContent = S.state.day ? `${phaseLabel(S.state)} · Week ${S.state.week} · Day ${S.state.day}` : phaseLabel(S.state);
    return S.state;
  }

  /* ---------------- chat ---------------- */
  const SUGGESTIONS = () => {
    const s = S.state || {};
    const unit = s.plan?.blocks?.[0]?.unit;
    const first = s.checkpoint
      ? { t: `Checkpoint ${s.checkpoint}`, d: "guided test", send: s.checkpoint === "C0" ? "Let's do the C0 diagnostic." : `Let's do checkpoint ${s.checkpoint}.`, open: "today" }
      : s.is_review_day
        ? { t: "Weekly review", d: "quiz · 4/3/2 · next week", send: "Let's do the weekly review (daily-study-planner, mode 3).", open: "today" }
        : { t: "Today's session", d: "plan and exercises", send: "Let's study! Guide me through today's session, one block at a time.", open: "today", unit };
    return [
      { ...first, primary: true },
      { t: "Conversation", d: "role-play of the week", send: "I want a role-play for this week's topic (speaking-coach)." },
      { t: "Check my text", d: "feedback with CEFR criteria", fill: "Please check my text (english-examiner):\n\n" },
      { t: "Vocabulary", d: "spaced review", send: "Vocabulary review for today (langtutor-vocab)." },
      { t: "Pronunciation", d: "one sound, short drill", send: "I want to practise pronunciation (speaking-coach). Choose the most important point for me." },
      { t: "My progress", d: "short summary", send: "How am I doing? Give me a short progress summary and my next focus." },
    ];
  };

  function runSuggestion(s) {
    if (s.open) openPanel(s.open);
    if (s.unit) openUnit(s.unit);
    if (s.fill) { const i = $("#input"); i.value = s.fill; i.focus(); autoGrow(); return; }
    if (s.send) send(s.send);
  }

  function renderWelcome() {
    const w = document.createElement("div");
    w.className = "welcome";
    w.innerHTML = `<span class="eyebrow">${S.agent === "codex" ? "Codex" : "Claude"} · simple English</span>
      <h2>Hi, Juan.</h2>
      <p>I am your English tutor. Pick a task or write to me.</p>
      <div class="prompts"></div>`;
    const box = $(".prompts", w);
    SUGGESTIONS().forEach((sg, i) => {
      const b = document.createElement("button");
      b.className = "prompt" + (sg.primary ? " primary" : "");
      b.innerHTML = `<span class="num">${String(i + 1).padStart(2, "0")}</span><span><b>${esc(sg.t)}</b><small>${esc(sg.d)}</small></span>${ic("arrow", "sm arrow")}`;
      b.onclick = () => runSuggestion(sg);
      box.appendChild(b);
    });
    stagger(box);
    return w;
  }

  function renderInlineChips() {
    const box = $("#chips-inline");
    box.innerHTML = "";
    if (!$$("#msgs .msg").length) return;
    SUGGESTIONS().forEach((sg) => {
      const b = document.createElement("button");
      b.textContent = sg.t;
      b.onclick = () => runSuggestion(sg);
      box.appendChild(b);
    });
  }

  const MARK = /\[\[(?:abrir|open):([^\]]+)\]\]/g;
  function parseMarkers(text) {
    const acts = [];
    text.replace(MARK, (_, a) => { acts.push(a.trim()); return ""; });
    return acts;
  }
  function doOpen(a) {
    if (a === "hoje" || a === "today") return openPanel("today");
    if (/^P[12]-\d\d$/.test(a)) return openUnit(a);
    if (a.startsWith("doc:")) return openDoc(a.slice(4));
    if (a.startsWith("url:")) return window.open(a.slice(4), "_blank", "noopener");
  }
  function pill(a) {
    if (a === "hoje" || a === "today") return [ic("calendar", "sm"), "Today"];
    if (/^P[12]-\d\d$/.test(a)) return [ic("book", "sm"), a];
    if (a.startsWith("doc:")) return [ic("file", "sm"), a.slice(4).split("/").pop().replace(/\.md$/, "")];
    if (a.startsWith("url:")) return [ic("external", "sm"), a.slice(4).replace(/^https?:\/\/(www\.)?/, "").split("/")[0]];
    return ["", a];
  }

  function msgEl(m) {
    const el = document.createElement("div");
    el.className = `msg ${m.role}`;
    if (m.role === "user") {
      el.innerHTML = `<div class="bubble"></div>`;
      $(".bubble", el).textContent = m.text;
      return el;
    }
    el.innerHTML = `<div class="bubble">
        <div class="meta"><span class="who">${m.agent === "codex" ? "codex" : "claude"}</span>
          <div class="actions"><button class="speak" title="Listen" aria-label="Listen">${ic("volume", "sm")}</button><button class="copy" title="Copy" aria-label="Copy">${ic("copy", "sm")}</button></div></div>
        <div class="tools"></div><div class="doc body"></div><div class="pills"></div>
      </div>`;
    $(".speak", el).onclick = () => speak(m.text || "");
    $(".copy", el).onclick = () => copyText(m.text || "");
    fillAssistant(el, m, false);
    return el;
  }

  function fillAssistant(el, m, live) {
    const tools = $(".tools", el);
    const list = m.tools || [];
    tools.innerHTML = list.length
      ? `<span class="step" title="${esc(list.join("\n"))}">${live ? '<span class="spinner"></span>' : ic("check", "sm")}<span class="t">${esc(list[list.length - 1])}</span>${list.length > 1 ? `<span>· ${list.length} steps</span>` : ""}</span>`
      : "";
    const text = (m.text || "").replace(MARK, "").replace(/\n{3,}/g, "\n\n").trim();
    $(".body", el).innerHTML = text ? md(text) : live ? `<div class="typing"><i></i><i></i><i></i></div>` : "";
    wireDocLinks($(".body", el), null);
    const pills = $(".pills", el);
    const acts = parseMarkers(m.text || "");
    if (pills.dataset.k !== acts.join("|")) {
      pills.dataset.k = acts.join("|");
      pills.innerHTML = "";
      acts.forEach((a) => {
        const [svg, label] = pill(a);
        const b = document.createElement("button");
        b.className = "open-pill"; b.innerHTML = `${svg}<span>${esc(label)}</span>`;
        b.onclick = () => doOpen(a);
        pills.appendChild(b);
      });
    }
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t.replace(MARK, "").trim()); toast("Copied"); } catch { toast("Could not copy", 2600, "bad"); }
  }

  async function loadHistory() {
    const box = $("#msgs");
    box.innerHTML = "";
    const h = await api(`/api/chat/history?agent=${S.agent}`);
    if (!h.messages.length) box.appendChild(renderWelcome());
    h.messages.forEach((m) => { const e = msgEl(m); e.style.animation = "none"; box.appendChild(e); });
    renderInlineChips();
    box.scrollTop = h.messages.length ? box.scrollHeight : 0;
  }

  function setAgent(a) {
    S.agent = a; store.set("agent", a);
    $$("#agent-seg button").forEach((b) => b.classList.toggle("active", b.dataset.agent === a));
    const ok = S.state?.agents?.[a];
    $("#input").placeholder = ok === false ? `${a === "codex" ? "Codex" : "Claude"} is not installed on this computer` : "Write or speak in English";
    loadHistory();
  }

  function setRunning(r) {
    S.running = r;
    const b = $("#btn-send");
    b.classList.toggle("stop", r);
    b.title = r ? "Stop" : "Send";
    b.setAttribute("aria-label", b.title);
    b.innerHTML = ic(r ? "stop" : "up");
  }

  async function send(text) {
    text = (text ?? $("#input").value).trim();
    if (!text || S.running) return;
    $("#input").value = ""; autoGrow();
    document.body.classList.add("chat-open");
    if (document.body.classList.contains("chat-closed")) setLayout("chat-closed", false);  // show the reply
    const box = $("#msgs");
    $(".welcome", box)?.remove();
    box.appendChild(msgEl({ role: "user", text }));
    const m = { role: "assistant", text: "", tools: [], agent: S.agent };
    const el = msgEl(m);
    fillAssistant(el, m, true);
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    renderInlineChips();
    setRunning(true);
    const opened = new Set();
    let raf = 0, finished = false;
    const paint = () => { raf = 0; if (finished) return; fillAssistant(el, m, true); const near = box.scrollHeight - box.scrollTop - box.clientHeight < 160; if (near) box.scrollTop = box.scrollHeight; };
    const addErr = (msg) => { const e = document.createElement("div"); e.className = "err"; e.innerHTML = `${ic("alert", "sm")}<span></span>`; $("span", e).textContent = msg; $(".bubble", el).appendChild(e); };
    try {
      const r = await post("/api/chat/send", { agent: S.agent, text });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.t === "text") {
            m.text += ev.v;
            parseMarkers(m.text).forEach((a) => { if (!opened.has(a)) { opened.add(a); doOpen(a); } });
          } else if (ev.t === "tool") m.tools.push(ev.v);
          else if (ev.t === "error") addErr(ev.v);
          if (!raf) raf = requestAnimationFrame(paint);
        }
      }
    } catch (e) {
      addErr(String(e.message || e));
    } finally {
      finished = true;
      if (raf) cancelAnimationFrame(raf);
      setRunning(false);
      fillAssistant(el, m, false);
      $(".speak", el).onclick = () => speak(m.text);
      $(".copy", el).onclick = () => copyText(m.text);
      loadState().then(() => { if (S.tab === "today") renderToday(); });
    }
  }

  /* ---------------- voice: listen ---------------- */
  function speak(text) {
    if (!("speechSynthesis" in window)) return toast("This browser cannot read text aloud.", 2600, "bad");
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
    const words = text.replace(MARK, "").replace(/```[\s\S]*?```/g, "").replace(/[*_`#>|]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(EMOJI_ANY, "");
    const u = new SpeechSynthesisUtterance(words);
    u.lang = "en-US";
    const v = speechSynthesis.getVoices().find((x) => x.lang === "en-US") || speechSynthesis.getVoices().find((x) => x.lang.startsWith("en"));
    if (v) u.voice = v;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  /* ---------------- voice: speak (mic) ----------------
     1) record in the browser + local Whisper on the server (any browser, private, offline)
     2) otherwise the browser's own dictation (Chrome/Edge)                               */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let media = null, micBusy = false, rec = null;
  const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  function recBar(on, html = "") {
    $("#rec-bar").classList.toggle("on", on);
    if (html) $("#rec-text").innerHTML = html;
  }
  function appendToInput(text) {
    const i = $("#input");
    i.value = (i.value.trim() ? i.value.trimEnd() + " " : "") + text.trim();
    i.focus(); autoGrow();
  }
  async function toggleMic() {
    if (micBusy) return;
    if (media) return stopRecording();
    if (rec) { rec.stop(); return; }
    if (S.state?.stt && canRecord()) return startRecording();
    if (SR) return startDictation();
    if (!canRecord()) return toast("This browser cannot use the microphone here.", 3600, "bad");
    toast("Voice input needs local speech-to-text (Docker app) or Chrome/Edge.", 4200, "bad");
  }
  async function startRecording() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { return toast("The microphone is blocked. Allow it in the browser.", 4000, "bad"); }
    const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find((t) => window.MediaRecorder.isTypeSupported?.(t)) || "";
    let mr;
    try { mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined); }
    catch { stream.getTracks().forEach((t) => t.stop()); return toast("Could not start recording.", 3000, "bad"); }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mr.mimeType || type || "audio/webm" });
      if (blob.size < 800) { recBar(false); return toast("Too short. Speak a bit longer.", 2600, "bad"); }
      transcribe(blob);
    };
    mr.start(250);
    const t0 = Date.now();
    media = { mr, iv: setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      recBar(true, `Recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · press the mic to stop`);
      if (s >= 120) stopRecording();
    }, 250) };
    $("#btn-mic").classList.add("rec");
    recBar(true, "Recording 0:00 · press the mic to stop");
  }
  function stopRecording() {
    if (!media) return;
    clearInterval(media.iv);
    try { media.mr.stop(); } catch { /* already stopped */ }
    media = null;
    $("#btn-mic").classList.remove("rec");
  }
  async function transcribe(blob) {
    micBusy = true;
    $("#btn-mic").classList.add("busy");
    recBar(true, `<span class="spinner"></span> Writing down what you said…`);
    try {
      const r = await post("/api/transcribe", null, true, blob);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || r.statusText);
      if (d.text) appendToInput(d.text);
      else toast("I could not hear any words. Try again, closer to the mic.", 3200, "bad");
    } catch (e) {
      toast(String(e.message || e), 4200, "bad");
    } finally {
      micBusy = false;
      $("#btn-mic").classList.remove("busy");
      recBar(false);
    }
  }
  function startDictation() {
    rec = new SR();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    const input = $("#input");
    const base = input.value ? input.value.trimEnd() + " " : "";
    rec.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      input.value = base + s; autoGrow();
    };
    rec.onend = () => { rec = null; $("#btn-mic").classList.remove("rec"); recBar(false); };
    rec.onerror = (e) => {
      const msg = e.error === "network" ? "Browser dictation needs Google's servers and is not working here. Use the Docker app for local speech-to-text."
        : e.error === "not-allowed" || e.error === "service-not-allowed" ? "The microphone is blocked. Allow it in the browser." : `Microphone: ${e.error}`;
      toast(msg, 5200, "bad");
    };
    rec.start();
    $("#btn-mic").classList.add("rec");
    recBar(true, "Listening · press the mic to stop");
  }

  /* ---------------- workspace tabs ---------------- */
  function emptyState(icon, html) {
    return `<div class="empty"><div class="ico">${ic(icon, "lg")}</div><div>${html}</div></div>`;
  }
  function openPanel(tab) {
    S.tab = tab;
    if ((location.hash || "#study") !== "#study") location.hash = "#study";
    setActive($("#panel-tabs"), (b) => b.dataset.tab === tab);
    $$(".pane").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
    if (tab === "today") renderToday();
    if (tab === "unit" && !S.unit) $("#panel-unit").innerHTML = emptyState("book", `Choose a unit in <a href="#grammar">Grammar</a>.`);
    if (tab === "doc" && !S.docPath) $("#panel-doc").innerHTML = emptyState("file", "No document open.");
  }

  /* timer (per day, local) */
  const tKey = () => `timer:${S.state?.today}`;
  const timer = () => store.get(tKey(), { acc: 0, since: null });
  const elapsed = () => { const t = timer(); return t.acc + (t.since ? Date.now() - t.since : 0); };
  const RING = 2 * Math.PI * 34;
  const targetMin = () => ((S.state?.plan?.date || "") >= "2027-01-03" ? 150 : 60);
  function toggleTimer() {
    const t = timer();
    if (t.since) { t.acc += Date.now() - t.since; t.since = null; } else t.since = Date.now();
    store.set(tKey(), t); paintTimer();
  }
  function paintTimer() {
    const el = $("#timer");
    if (!el) return;
    const ms = elapsed();
    el.textContent = fmtMs(ms);
    const fg = $("#ring-fg");
    if (fg) fg.style.strokeDashoffset = String(RING * (1 - Math.min(1, ms / (targetMin() * 60000))));
    const b = $("#t-toggle");
    if (b) {
      const run = !!timer().since;
      if (b.dataset.run !== String(run)) { b.dataset.run = String(run); b.innerHTML = ic(run ? "pause" : "play"); b.title = run ? "Pause" : "Start"; }
    }
  }
  setInterval(paintTimer, 1000);
  const fmtMs = (ms) => { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0"); return `${h ? h + ":" : ""}${mm}:${String(s % 60).padStart(2, "0")}`; };

  function weekParts(w) {
    const m = String(w || "").match(/^(?:Semana|Week)\s+(\d+)\s*:?\s*(\d{4}-\d\d-\d\d)\s*→\s*(\d{4}-\d\d-\d\d)\s*·\s*(?:Tema|Theme):\s*(.+)$/);
    return m ? { week: m[1], range: `${fmtDate(m[2])} – ${fmtDate(m[3])}`, title: plain(m[4]) } : { week: "", range: "", title: plain(w) };
  }
  function renderToday() {
    const s = S.state, p = s?.plan, box = $("#panel-today");
    if (!p) {
      box.innerHTML = emptyState("calendar", `There is no plan for this week yet.<br><br><button class="btn sm" id="mk-week">Ask the tutor</button>`);
      $("#mk-week").onclick = () => send("Please prepare next week's plan and the missing grammar units (daily-study-planner, mode 4).");
      return;
    }
    const doneKey = `done:${p.date}`;
    const done = new Set(store.get(doneKey, []));
    const wk = weekParts(p.week);
    const dayNo = s.plan_is_today ? s.day : (s.day || 0) + 1;
    const progress = Math.max(0, Math.min(100, Math.round(((s.day || 0) / 69) * 100)));
    box.innerHTML = `
      ${s.plan_is_today ? "" : `<div class="banner">${ic("calendar", "sm")}Preview · this plan starts on ${fmtDate(p.date)}</div>`}
      <div class="day-head">
        <div><span class="eyebrow">Week ${esc(wk.week || s.week || 1)}${wk.range ? " · " + esc(wk.range) : ""}</span><h1>Day <em>${dayNo || 1}</em></h1><p class="theme">${esc(wk.title)}</p></div>
        <div class="timer-box">
          <div class="timer-txt"><span class="timer" id="timer">${fmtMs(elapsed())}</span><small>goal ${targetMin()} min</small></div>
          <div class="ring"><svg viewBox="0 0 78 78"><circle class="bg" cx="39" cy="39" r="34"/><circle class="fg" id="ring-fg" cx="39" cy="39" r="34" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg>
            <button id="t-toggle" aria-label="Timer"></button></div>
        </div>
      </div>
      <div class="journey"><span>${s.day || 0}/69</span><div class="track"><span style="width:${progress}%"></span></div><span>01/02</span></div>
      <div class="blocks" id="blocks"></div>
      <div class="day-progress"><span id="done-count"></span><span>${p.blocks.reduce((a, b) => a + b.min, 0)} min plan</span></div>
      <div class="today-foot"><button class="btn wide" id="btn-close"><span>Finish session</span>${ic("arrow", "arrow")}</button></div>`;
    $("#t-toggle").onclick = toggleTimer;
    $("#btn-close").onclick = openCloseDialog;
    const counter = () => { $("#done-count").textContent = `${p.blocks.filter((b) => done.has(b.key)).length} of ${p.blocks.length} done`; };
    p.blocks.forEach((b, i) => {
      const isC = /\bC\d\b|diagn/i.test(b.text);
      const el = document.createElement("div");
      el.className = "block" + (done.has(b.key) ? " done" : "");
      el.innerHTML = `<button class="chk" aria-label="Mark as done"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>
        <span class="num">${String(i + 1).padStart(2, "0")}</span>
        <div><h3>${esc(b.label)}<span class="min">${b.min} min</span></h3><p>${inline(b.text) || "—"}</p></div><div class="act"></div>`;
      $(".chk", el).onclick = () => {
        done.has(b.key) ? done.delete(b.key) : done.add(b.key);
        store.set(doneKey, [...done]);
        el.classList.toggle("done", done.has(b.key));
        counter();
      };
      const act = $(".act", el);
      const btn = (label, fn) => { const x = document.createElement("button"); x.className = "btn sm ghost"; x.innerHTML = `${esc(label)}${ic("arrow", "sm arrow")}`; x.onclick = fn; act.appendChild(x); };
      const has = plain(b.text) && plain(b.text) !== "—";
      if (b.key === "grammar" && b.unit) btn("Open", () => openUnit(b.unit));
      else if (b.key === "grammar" && isC) btn("Start", () => { openDoc("assessments/2026-11-25-C0-diagnostico.md"); send("Let's do the C0 diagnostic."); });
      if (b.key === "listening" && b.url) btn("Open", () => window.open(b.url, "_blank", "noopener"));
      if (b.key === "output" && has) btn("Practise", () => {
        if (b.kind === "writing") { const inp = $("#input"); inp.value = `I wrote today's text ("${plain(b.text)}"). Please check it (english-examiner, quick mode):\n\n`; document.body.classList.add("chat-open"); inp.focus(); autoGrow(); }
        else send(`Let's do today's speaking: ${plain(b.text)}. Use the speaking-coach skill.`);
      });
      if (b.key === "srs" && has) btn("Review", () => send(`Vocabulary review for today (langtutor-vocab): ${plain(b.text)}`));
      $("#blocks").appendChild(el);
    });
    stagger($("#blocks"));
    counter();
    paintTimer();
  }

  function openCloseDialog() {
    const p = S.state.plan, d = $("#dlg-close"), f = $("form", d);
    const res = store.get(`result:${S.state.today}`, null);
    f.minutes.value = Math.max(1, Math.round(elapsed() / 60000)) || "";
    f.grammar.value = res?.id || p?.blocks?.[0]?.unit || "";
    f.pct.value = res?.pct ?? "";
    f.listening.value = plain(p?.blocks?.[1]?.text || "").replace(/^—$/, "").slice(0, 60);
    f.output.value = /C\d|diagn/i.test(p?.blocks?.[0]?.text || "") ? "checkpoint" : p?.blocks?.[2]?.kind || "speaking";
    d.showModal();
    d.onclose = async () => {
      if (d.returnValue !== "ok") return;
      const body = Object.fromEntries(new FormData(f));
      try {
        await api("/api/session/close", body);
        store.set(tKey(), { acc: 0, since: null });
        toast("Session saved. Save to GitHub in Progress.", 3400);
        await loadState(); renderToday();
      } catch (e) { toast(String(e.message || e), 4000, "bad"); }
    };
  }

  /* ---------------- grammar unit (interactive) ---------------- */
  const { isRight, clean } = window.Grading;

  async function openUnit(id) {
    openPanel("unit");
    const box = $("#panel-unit");
    box.innerHTML = `<div class="sk" style="height:40px;width:60%"></div><div class="sk" style="height:14px;margin-top:20px"></div><div class="sk" style="height:14px;margin-top:8px;width:80%"></div><div class="sk" style="height:200px;margin-top:26px"></div>`;
    let data;
    try { data = await api(`/api/unit?id=${id}`); }
    catch {
      box.innerHTML = emptyState("book", `Unit <b>${esc(id)}</b> is not ready yet.<br><br><button class="btn sm" id="mk-unit">Ask the tutor</button>`);
      $("#mk-unit").onclick = () => send(`Please create grammar unit ${id} with exercises and an answer key (daily-study-planner, mode 4, references/unit-template.md).`); S.unit = null; return;
    }
    S.unit = id; S.key = null;
    box.innerHTML = `<article class="doc" id="unit-doc">${md(data.md)}</article>
      <div class="ex-bar"><span class="score" id="score"></span>
        <button class="btn sm quiet" id="ex-reset" title="Clear answers">${ic("reset", "sm")}Clear</button>
        <button class="btn sm ghost" id="ex-help">${ic("spark", "sm")}Explain my mistakes</button>
        <button class="btn sm" id="ex-check">Check</button></div>`;
    const doc = $("#unit-doc");
    wireDocLinks(doc, `materials/grammar/${id}.md`);
    const draft = store.get(`ans:${id}`, {});
    let inEx = false;
    [...doc.children].forEach((node) => {
      if (node.tagName === "H2") inEx = /practi|exerc/i.test(node.textContent);
      if (!inEx) return;
      if (node.tagName === "OL") $$("li[data-n]", node).forEach((li) => {
        const inp = document.createElement("input");
        inp.className = "ex-input"; inp.dataset.n = li.dataset.n; inp.value = draft[li.dataset.n] || "";
        inp.placeholder = "Your answer"; inp.autocomplete = "off"; inp.spellcheck = false;
        inp.oninput = () => { const d = store.get(`ans:${id}`, {}); d[li.dataset.n] = inp.value; store.set(`ans:${id}`, d); };
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); const all = $$(".ex-input", doc); const nx = all[all.indexOf(inp) + 1]; nx ? nx.focus() : $("#ex-check").click(); } };
        li.appendChild(inp);
      });
      if (node.tagName === "H3" && /your turn|produ/i.test(node.textContent)) {
        const wrap = document.createElement("div");
        wrap.className = "prod";
        wrap.innerHTML = `<textarea placeholder="Write here in English"></textarea><div class="row-end"><button class="btn sm ghost">${ic("pen", "sm")}Send to the tutor</button></div>`;
        const ta = $("textarea", wrap);
        ta.value = draft.prod || "";
        ta.oninput = () => { const d = store.get(`ans:${id}`, {}); d.prod = ta.value; store.set(`ans:${id}`, d); };
        $("button", wrap).onclick = () => ta.value.trim() ? send(`Unit ${id}, "${node.textContent.trim()}". Please check it and focus on the grammar of the unit (english-examiner, quick mode):\n\n${ta.value.trim()}`) : toast("Write something first.", 2200, "bad");
        let anchor = node; while (anchor.nextElementSibling && !/^H[23]$/.test(anchor.nextElementSibling.tagName) && anchor.nextElementSibling.tagName !== "OL") anchor = anchor.nextElementSibling;
        anchor.after(wrap);
      }
    });
    $("#ex-check").onclick = () => check(id);
    $("#ex-reset").onclick = () => { store.set(`ans:${id}`, {}); openUnit(id); };
    $("#ex-help").onclick = () => askHelp(id);
    box.scrollTop = 0;
  }

  async function check(id) {
    if (!S.key) {
      try { S.key = (await api(`/api/unit/key?id=${id}`)).key; } catch { return toast("This unit has no answer key yet.", 2600, "bad"); }
    }
    const doc = $("#unit-doc");
    let right = 0, total = 0;
    $$(".ex-input", doc).forEach((inp) => {
      const li = inp.closest("li"), n = inp.dataset.n, exp = S.key[n];
      $(".mark", li)?.remove();
      li.classList.remove("right", "wrong");
      if (!exp || /^(pessoal|personal)/i.test(exp)) return;
      total++;
      const ok = li.dataset.override ? li.dataset.override === "1" : isRight(inp.value, exp);
      if (ok) right++;
      li.classList.add(ok ? "right" : "wrong");
      const mk = document.createElement("div");
      mk.className = "mark";
      mk.innerHTML = `${ok ? MK_GOOD : MK_BAD}${ok ? "" : `<span class="exp">${inline(clean(exp))}</span>`}<button title="Change the mark">${ok ? "mark as wrong" : "it is right"}</button>`;
      $("button", mk).onclick = () => { li.dataset.override = ok ? "0" : "1"; check(id); };
      li.appendChild(mk);
    });
    const pct = total ? Math.round((100 * right) / total) : 0;
    const cls = pct >= 90 ? "done" : pct >= 70 ? "ok" : "redo";
    const lbl = pct >= 90 ? "mastered" : pct >= 70 ? "done" : "repeat";
    $("#score").innerHTML = `<span>${right}/${total}</span><span class="tag ${cls}">${pct}% · ${lbl}</span>`;
    const c = $("#ex-check");
    c.textContent = "Save";
    c.onclick = async () => {
      const items = $$(".ex-input", doc).map((i) => ({ n: i.dataset.n, answer: i.value, ok: i.closest("li").classList.contains("right") }));
      try {
        await api("/api/unit/result", { id, pct, score: right, total, items });
        store.set(`result:${S.state.today}`, { id, pct });
        toast(`Saved: ${id} · ${pct}%`);
        c.textContent = "Check"; c.onclick = () => check(id);
      } catch (e) { toast(String(e.message || e), 4000, "bad"); }
    };
  }

  function askHelp(id) {
    const doc = $("#unit-doc");
    const wrong = $$("li.wrong", doc).map((li) => {
      const inp = $(".ex-input", li);
      const q = li.firstChild?.textContent?.trim() || "";
      return `${li.dataset.n}. ${q.slice(0, 90)} | my answer: "${inp.value}" | expected: "${clean(S.key?.[li.dataset.n] || "")}"`;
    });
    if (!wrong.length) return toast("Press Check first, or there are no mistakes.");
    send(`I did unit ${id} in the app. These answers were wrong:\n${wrong.join("\n")}\n\nExplain each mistake in simple English (one or two lines each) and give me 3 new sentences to practise the point I missed most. If it is a recurring error, log it in progress/error-log.md.`);
  }

  /* ---------------- documents ---------------- */
  function resolveRel(base, href) {
    if (!base) return href;
    const parts = base.split("/").slice(0, -1);
    href.split("/").forEach((seg) => { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); });
    return parts.join("/");
  }
  function wireDocLinks(root, base) {
    $$("a[data-doc]", root).forEach((a) => {
      const href = a.getAttribute("href");
      a.onclick = (e) => {
        e.preventDefault();
        if (href.startsWith("#")) return;
        const path = resolveRel(base, href);
        if (/\.md$/.test(path)) openDoc(path); else toast(path);
      };
    });
  }
  async function openDoc(path) {
    openPanel("doc");
    const box = $("#panel-doc");
    try {
      const d = await api(`/api/doc?path=${encodeURIComponent(path)}`);
      S.docPath = d.path;
      box.innerHTML = `<p class="path">${esc(d.path)}</p><article class="doc">${md(d.md)}</article>`;
      wireDocLinks(box, d.path);
      box.scrollTop = 0;
    } catch { box.innerHTML = emptyState("file", `Document not available: ${esc(path)}`); }
  }

  /* ---------------- grammar page ---------------- */
  const STATUS_LABEL = { done: "mastered", ok: "done", redo: "repeat", todo: "to do" };
  function applyFilter() {
    const f = S.filter;
    $$("#units .unit").forEach((u) => {
      const s = u.dataset.status;
      const show = f === "all" || (f === "done" ? s === "done" || s === "ok" : s === f);
      u.classList.toggle("hidden", !show);
    });
    $$("#g-filter button").forEach((b) => b.classList.toggle("active", b.dataset.f === f));
  }
  async function renderGrammar() {
    const box = $("#units");
    if (!box.children.length) box.innerHTML = Array.from({ length: 12 }, () => `<div class="sk" style="height:140px"></div>`).join("");
    let units;
    try { units = await api("/api/spine"); } catch (e) { box.innerHTML = emptyState("alert", esc(e.message)); return; }
    const done = units.filter((u) => u.status === "done" || u.status === "ok").length;
    const redo = units.filter((u) => u.status === "redo").length;
    $("#g-sub").textContent = `${done} of ${units.length} units done${redo ? ` · ${redo} to repeat` : ""}`;
    box.innerHTML = "";
    let phase = "";
    units.forEach((u) => {
      const ph = u.id.slice(0, 2);
      if (ph !== phase) {
        phase = ph;
        const n = units.filter((x) => x.id.startsWith(ph)).length;
        const t = document.createElement("div");
        t.className = "phase-title";
        t.innerHTML = `<b>${ph === "P1" ? "Phase 1 · Foundation" : "Phase 2 · Erasmus intensive"}</b><span>${n} units</span>`;
        box.appendChild(t);
      }
      const b = document.createElement("button");
      b.className = `unit ${u.status}${u.exists ? "" : " missing"}`;
      b.dataset.status = u.status;
      const pct = parseInt(u.pct, 10);
      b.innerHTML = `<span class="top"><span class="uid">${u.id}</span><span class="tag ${u.status}">${u.exists ? STATUS_LABEL[u.status] : "not ready"}</span></span>
        <span class="ut">${esc(plain(u.title))}</span>
        <span class="foot"><span>${esc(u.cefr)}</span><span>${Number.isFinite(pct) ? pct + "%" : fmtDate(u.date)}</span></span>
        <span class="bar"><span style="width:${Number.isFinite(pct) ? pct : 0}%"></span></span>`;
      b.title = `${STATUS_LABEL[u.status]} · planned for ${fmtDate(u.date)}`;
      b.onclick = () => openUnit(u.id);
      box.appendChild(b);
    });
    stagger(box);
    applyFilter();
  }

  /* ---------------- progress page ---------------- */
  async function renderProgress() {
    const root = $("#progress");
    if (!root.children.length) root.innerHTML = `<div class="sk" style="height:120px"></div><div class="two"><div class="sk" style="height:320px"></div><div class="sk" style="height:320px"></div></div>`;
    let p;
    try { p = await api("/api/progress"); } catch (e) { root.innerHTML = emptyState("alert", esc(e.message)); return; }
    const counts = { done: 0, ok: 0, redo: 0 };
    p.spine.forEach((u) => { if (counts[u.status] !== undefined) counts[u.status]++; });
    const pctTime = p.planned ? Math.min(100, Math.round((100 * p.minutes) / p.planned)) : 0;
    $("#p-sub").textContent = `${p.sessions} ${p.sessions === 1 ? "session" : "sessions"} · ${(p.minutes / 60).toFixed(1)} h studied`;
    const first = p.days[0]?.dow || 0;
    const cal = ["M", "T", "W", "T", "F", "S", "S"].map((d) => `<div class="hd">${d}</div>`).join("") + "<div class='d blank'></div>".repeat(first) +
      p.days.map((d) => {
        let c = d.date >= "2027-01-03" ? "d p2" : "d";
        if (d.min) c += d.min >= d.target ? " l3" : d.min >= d.target * 0.6 ? " l2" : " l1";
        else if (d.past) c += " miss";
        if (d.today) c += " today";
        return `<div class="${c}" title="${d.date} · ${d.min} min${d.cp ? " · " + d.cp : ""}">${+d.date.slice(8)}${d.cp ? `<b>${d.cp}</b>` : ""}</div>`;
      }).join("");
    const docList = (title, items) => items.length ? `<h2 style="margin-top:22px">${title}</h2><ul class="links">${items.map((r) => `<li><a href="#" data-open="${esc(r)}">${ic("file", "sm")}${esc(r.split("/").pop().replace(/\.md$/, ""))}</a></li>`).join("")}</ul>` : "";
    root.innerHTML = `
      <div class="stats stagger">
        <div class="stat" style="--i:0"><div class="k">${p.days_left}<em>.</em></div><div class="l">days to Belgium</div></div>
        <div class="stat" style="--i:1"><div class="k">${(p.minutes / 60).toFixed(1)}<small>/ ${(p.planned / 60).toFixed(0)} h</small></div><div class="l">hours studied</div><div class="bar"><span style="width:${pctTime}%"></span></div></div>
        <div class="stat" style="--i:2"><div class="k">${p.streak}</div><div class="l">days in a row</div></div>
        <div class="stat" style="--i:3"><div class="k">${counts.done + counts.ok}<small>/ ${p.spine.length}</small></div><div class="l">units · ${counts.redo} to repeat</div></div>
      </div>
      <div class="two">
        <div class="card"><h2>Calendar <span>25/11 – 01/02</span></h2><div class="cal">${cal}</div>
          <div class="cal-legend"><span><i style="background:var(--signal)"></i>goal met</span><span><i style="background:color-mix(in srgb,var(--signal) 22%,var(--sunken))"></i>partial</span><span><i style="background:var(--bad-soft)"></i>missed</span><span><i style="box-shadow:inset 0 0 0 1px var(--line-strong)"></i>phase 2</span></div></div>
        <div class="card"><h2>Checkpoints</h2><ul class="timeline">${p.checkpoints.map((c) => `<li class="${c.past ? "past" : ""}"><span>${c.name}</span><span>${fmtDate(c.date)}</span></li>`).join("")}</ul>
          ${docList("Results", p.results)}${docList("Weekly reviews", p.reviews)}</div>
      </div>
      <div class="two">
        <div class="card"><h2>Common mistakes</h2>${p.errors.length ? `<table class="tbl"><tr><th>Mistake</th><th>Correct</th><th class="num">Times</th></tr>${p.errors.map((e) => `<tr><td>${inline(e.err)}</td><td>${inline(e.fix)}</td><td class="num">${e.n}</td></tr>`).join("")}</table>` : `<div class="none">${ic("check", "sm")}None yet.</div>`}</div>
        <div class="card"><h2>Last sessions</h2>${p.recent.length ? `<table class="tbl"><tr><th>Date</th><th class="num">Min</th><th>Grammar</th><th class="num">%</th></tr>${p.recent.map((r) => `<tr><td class="mono">${fmtDate(r.date)}</td><td class="num">${r.min}</td><td>${esc(r.grammar)}</td><td class="num">${esc(r.pct)}</td></tr>`).join("")}</table>` : `<div class="none">${ic("inbox", "sm")}The first one is the C0 diagnostic.</div>`}</div>
      </div>`;
    $$("[data-open]", root).forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDoc(a.dataset.open); }));
  }

  /* ---------------- settings / git ---------------- */
  function openSettings() {
    const d = $("#dlg-settings"), f = $("form", d), s = S.state;
    $("#set-codex").innerHTML = (s.codex_models.length ? s.codex_models : ["gpt-6-sol"]).map((m) => `<option ${m === s.settings.codex_model ? "selected" : ""}>${esc(m)}</option>`).join("");
    f.claude_model.value = s.settings.claude_model || "";
    f.claude_bin.value = s.settings.claude_bin || "";
    f.codex_bin.value = s.settings.codex_bin || "";
    $("#set-cbin").placeholder = s.paths.claude ? `automatic: ${s.paths.claude}` : "not found: enter the path";
    $("#set-xbin").placeholder = s.paths.codex ? `automatic: ${s.paths.codex}` : "not found: enter the path";
    $("#set-status").innerHTML = ["claude", "codex"].map((a) => `<span><i class="dot ${s.agents[a] ? "on" : ""}"></i>${a} ${s.agents[a] ? "found" : "not found"}</span>`).join("")
      + `<span><i class="dot ${s.stt ? "on" : ""}"></i>speech-to-text ${s.stt ? "on" : "off"}</span><span>env: ${esc(s.env || "")}</span>`;
    d.showModal();
    d.onclose = async () => {
      if (d.returnValue !== "ok") return;
      try { await api("/api/settings", Object.fromEntries(new FormData(f))); await loadState(); toast("Settings saved"); }
      catch (e) { toast(String(e.message || e), 4000, "bad"); }
    };
  }
  async function gitSave() {
    const b = $("#btn-git");
    b.disabled = true; b.innerHTML = `<span class="spinner"></span><span>Saving</span>`;
    try { const r = await api("/api/git/save", {}); toast(r.msg, 4200, r.ok ? "ok" : "bad"); } catch (e) { toast(String(e.message || e), 4200, "bad"); }
    b.disabled = false; b.innerHTML = `${ic("cloud", "sm")}<span>Save to GitHub</span>`;
  }

  /* ---------------- wiring ---------------- */
  function autoGrow() { const i = $("#input"); i.style.height = "auto"; i.style.height = Math.min(i.scrollHeight, 180) + "px"; }

  async function init() {
    paintThemeBtn();
    initLayout();
    await loadState();
    $$("#agent-seg button").forEach((b) => (b.onclick = () => setAgent(b.dataset.agent)));
    $("#btn-send").onclick = () => (S.running ? api("/api/chat/stop", { agent: S.agent }) : send());
    $("#btn-mic").onclick = toggleMic;
    $("#input").addEventListener("input", autoGrow);
    $("#input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    $("#btn-new").onclick = async () => { if (S.running) return; await api("/api/chat/reset", { agent: S.agent }); loadHistory(); };
    $("#btn-chat").onclick = () => { document.body.classList.add("chat-open"); $("#input").focus(); };
    $("#btn-chat-close").onclick = () => document.body.classList.remove("chat-open");
    $$("#panel-tabs button").forEach((b) => (b.onclick = () => (b.dataset.tab === "unit" && S.unit ? openUnit(S.unit) : b.dataset.tab === "doc" && S.docPath ? openDoc(S.docPath) : openPanel(b.dataset.tab))));
    $$("#g-filter button").forEach((b) => (b.onclick = () => { S.filter = b.dataset.f; store.set("gFilter", S.filter); applyFilter(); }));
    $("#btn-settings").onclick = openSettings;
    $("#btn-theme").onclick = toggleTheme;
    $("#btn-git").onclick = gitSave;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("chat-open") && !document.querySelector("dialog[open]")) document.body.classList.remove("chat-open"); });
    setRunning(false);
    setAgent(S.agent);
    route();
    openPanel("today");
  }
  init().catch((e) => { document.body.innerHTML = `<p style="padding:24px;font-family:system-ui">Could not start: ${esc(e.message)}</p>`; });
})();
