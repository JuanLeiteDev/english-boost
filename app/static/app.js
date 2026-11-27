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
    const root = document.documentElement;
    const next = isDark() ? "light" : "dark";
    const apply = () => { root.dataset.theme = next; store.set("theme", next); paintThemeBtn(); };
    // No CSS transitions while the theme changes: otherwise colours fade at different speeds
    // (and, inside the view transition, from the old theme), which looks like a flash.
    root.classList.add("theming");
    const done = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theming")));
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); done(); return; }
    // The new theme grows as a circle from the button. The animation lives in CSS (with
    // fill-mode "both") so the new snapshot is clipped from its very first frame; starting it
    // from JS after `vt.ready` left one frame where the whole new theme showed, then vanished.
    const r = $("#btn-theme").getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    root.style.setProperty("--vt-x", `${x}px`);
    root.style.setProperty("--vt-y", `${y}px`);
    root.style.setProperty("--vt-r", `${Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)))}px`);
    document.startViewTransition(apply).finished.finally(done);
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
    if (!["study", "grammar", "practice", "progress"].includes(v)) v = "study";
    $$(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${v}`));
    $$(".side a.nav").forEach((a) => a.classList.toggle("active", a.dataset.view === v));
    if (v === "grammar") renderGrammar();
    if (v === "progress") renderProgress();
    if (v === "practice") renderPractice();
    requestAnimationFrame(refreshThumbs);
  }
  window.addEventListener("hashchange", route);

  /* ---------------- state ---------------- */
  const agentName = (a) => (a === "codex" ? "Codex" : "Claude");
  // "missing" = CLI not found · "out" = found but not logged in · "ok" = logged in (or the CLI cannot tell us)
  const AGENT_STATUS = { ok: "connected", out: "not logged in", missing: "not installed" };
  function agentStatus(a) {
    if (!S.state?.agents?.[a]) return "missing";
    return S.state.auth?.[a] === false ? "out" : "ok";
  }
  function setPlaceholder() {
    const st = agentStatus(S.agent), n = agentName(S.agent);
    $("#input").placeholder = st === "missing" ? `${n} is not installed on this computer`
      : st === "out" ? `${n} is not logged in on this computer` : "Write or speak in English";
  }
  async function loadState() {
    S.state = await api("/api/state");
    $$("[data-dot]").forEach((d) => {
      const a = d.dataset.dot, st = agentStatus(a);
      d.classList.toggle("on", st === "ok");
      d.classList.toggle("out", st === "out");
      d.closest("button").title = `${agentName(a)}: ${AGENT_STATUS[st]}`;
    });
    if (S.agent) setPlaceholder();
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

  // [[open:…]] opens material; [[done:<block>]] ticks a block of today's plan (the tutor writes it when Juan finishes one).
  const MARK = /\[\[(abrir|open|done):([^\]]+)\]\]/g;
  function parseMarkers(text) {
    const acts = [];
    text.replace(MARK, (_, kind, a) => { acts.push((kind === "done" ? "done:" : "") + a.trim()); return ""; });
    return acts;
  }
  const DONE_ALIAS = { vocabulary: "srs", vocab: "srs", speaking: "output", writing: "output", 1: "grammar", 2: "listening", 3: "output", 4: "srs" };
  const doneBlock = (raw) => { const k = raw.toLowerCase(); return S.state?.plan?.blocks?.find((b) => b.key === (DONE_ALIAS[k] || k)); };
  function markDone(raw) {
    const p = S.state?.plan, b = doneBlock(raw);
    if (!b) return;
    const key = `done:${p.date}`, done = new Set(store.get(key, []));
    if (done.has(b.key)) return;
    done.add(b.key); store.set(key, [...done]);
    toast(`${b.label} block marked as done`);
    if (S.tab === "today") renderToday();
  }
  function doOpen(a) {
    if (a.startsWith("done:")) return openPanel("today");
    if (a === "hoje" || a === "today") return openPanel("today");
    if (/^P[12]-\d\d$/.test(a)) return openUnit(a);
    if (a.startsWith("practice:")) return openUnit(a.slice(9).trim());
    if (a.startsWith("doc:")) return openDoc(a.slice(4));
    if (a.startsWith("url:")) return window.open(a.slice(4), "_blank", "noopener");
  }
  function pill(a) {
    if (a.startsWith("done:")) return [ic("check", "sm"), `${doneBlock(a.slice(5))?.label || a.slice(5)} done`];
    if (a === "hoje" || a === "today") return [ic("calendar", "sm"), "Today"];
    if (/^P[12]-\d\d$/.test(a)) return [ic("book", "sm"), a];
    if (a.startsWith("practice:")) return [ic("spark", "sm"), "Practice set"];
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

  /* Tool steps in plain words for the learner; the technical label stays in the tooltip. */
  function stepLabel(t) {
    const s = String(t || "");
    if (/check_practice/.test(s)) return "Checking the exercises";
    if (/^(Write|Edit) .*practice/.test(s)) return "Writing your practice set";
    if (/^(Write|Edit) .*error-log/.test(s)) return "Updating your error log";
    if (/^(Write|Edit) /.test(s)) return "Writing a file";
    if (/^Read .*(exercise-links|catalog)/.test(s)) return "Choosing good links";
    if (/^Read /.test(s)) return "Reading your plan and notes";
    if (/^Web: /.test(s)) return "Reading a web page";
    if (/^Search: /.test(s)) return "Looking through your files";
    if (/^Skill: /.test(s)) return "Getting ready";
    if (/^Command: .*dashboard/.test(s)) return "Updating the dashboard";
    if (/^Command: /.test(s)) return "Checking something";
    if (/^TodoWrite$/.test(s)) return "Planning the work";
    return s.length < 60 && !/^[A-Z][a-zA-Z]+$/.test(s) ? s : "Working";
  }

  function fillAssistant(el, m, live) {
    const tools = $(".tools", el);
    const list = m.tools || [];
    const text = (m.text || "").replace(MARK, "").replace(/\n{3,}/g, "\n\n").trim();
    const working = live && list.length > 0;  // the tutor is doing work: only a spinner, not its notes
    if (working) {
      tools.innerHTML = `<span class="chat-loading" role="status" aria-label="The tutor is working"><span class="spinner"></span></span>`;
    } else {
      tools.innerHTML = list.length
        ? `<span class="step" title="${esc(list.join("\n"))}">${ic("check", "sm")}<span class="t">${esc(stepLabel(list[list.length - 1]))}</span>${list.length > 1 ? `<span>· ${list.length} steps</span>` : ""}</span>`
        : "";
    }
    $(".body", el).innerHTML = working ? "" : text ? md(text) : live ? `<div class="typing"><i></i><i></i><i></i></div>` : "";
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
    if (h.messages.length) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });  // after fonts/layout settle
  }

  /* Keep the chat pinned to the bottom while a reply streams in, unless the learner scrolls up.
     "Pinned" is decided by the learner's own scrolling, not by measuring after each render:
     a big chunk (a table, a long paragraph) used to grow the list past the threshold and stop
     the auto-scroll for the rest of the reply. */
  const nearBottom = (box) => box.scrollHeight - box.scrollTop - box.clientHeight < 48;
  function follow(box) {
    const f = { stick: true };
    f.onScroll = () => { f.stick = nearBottom(box); };
    f.pin = () => { if (f.stick) box.scrollTop = box.scrollHeight; };
    f.stop = () => box.removeEventListener("scroll", f.onScroll);
    box.addEventListener("scroll", f.onScroll, { passive: true });
    return f;
  }

  function setAgent(a) {
    S.agent = a; store.set("agent", a);
    $$("#agent-seg button").forEach((b) => b.classList.toggle("active", b.dataset.agent === a));
    if (S.state) setPlaceholder();
    return loadHistory();
  }

  function setRunning(r) {
    S.running = r;
    const b = $("#btn-send");
    b.classList.toggle("stop", r);
    b.title = r ? "Stop" : "Send";
    b.setAttribute("aria-label", b.title);
    b.innerHTML = ic(r ? "stop" : "up");
  }

  /* hooks (optional, used by the Practice page): tool(label), text(), practice(id) → true to skip the
     automatic open, error(msg), done(message). */
  async function send(text, hooks = {}) {
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
    renderInlineChips();
    box.scrollTop = box.scrollHeight;
    const fw = follow(box);
    setRunning(true);
    const opened = new Set();
    let raf = 0, finished = false;
    const paint = () => { raf = 0; if (finished) return; fillAssistant(el, m, true); fw.pin(); };
    const addErr = (msg) => { const e = document.createElement("div"); e.className = "err"; e.innerHTML = `${ic("alert", "sm")}<span></span>`; $("span", e).textContent = msg; $(".bubble", el).appendChild(e); fw.pin(); hooks.error?.(msg); };
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
            if (m.tools.length && m.text.replace(MARK, "").trim()) hooks.text?.();
            parseMarkers(m.text).forEach((a) => { if (!opened.has(a)) { opened.add(a); if (a.startsWith("done:")) return markDone(a.slice(5));
              if (a.startsWith("practice:")) { const id = a.slice(9).trim(); savePracticeChoices(id); if (hooks.practice?.(id)) return; }
              doOpen(a); } });
          } else if (ev.t === "reset") m.text = ev.v;  // narration before a tool step is dropped (markers kept)
          else if (ev.t === "tool") { m.tools.push(ev.v); hooks.tool?.(ev.v); }
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
      fw.pin();  // the final render adds the "open" pills below the text
      fw.stop();
      $(".speak", el).onclick = () => speak(m.text);
      $(".copy", el).onclick = () => copyText(m.text);
      S.pendingPractice = null;  // a reply without a practice set must not attach these choices to a later one
      hooks.done?.(m);
      if (location.hash === "#practice") renderPracticeList();
      loadState().then(() => { if (S.tab === "today") renderToday(); });
    }
  }

  /* ---------------- voice: listen ---------------- */
  // Real audio from the app's local voices (Piper, on the server). Browsers on Linux often have no
  // speech voices at all, so the browser's own speechSynthesis is only a fallback.
  async function ttsUrl(text, slow) {
    const r = await post("/api/tts", { text, slow: !!slow });
    if (!r.ok) { let m = ""; try { m = (await r.json()).error; } catch { /* audio or text */ } throw Object.assign(new Error(m || r.statusText), { status: r.status }); }
    return URL.createObjectURL(await r.blob());
  }
  let chatAudio = null;
  async function speak(text) {
    const words = text.replace(MARK, "").replace(/```[\s\S]*?```/g, "").replace(/[*_`#>|]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(EMOJI_ANY, "").trim();
    if (chatAudio && !chatAudio.paused) { chatAudio.pause(); chatAudio = null; return; }
    if ("speechSynthesis" in window && speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
    if (S.state?.tts !== false) {
      try { chatAudio = new Audio(await ttsUrl(words.slice(0, 4800))); await chatAudio.play(); return; }
      catch (e) { if (e.status !== 501) toast(String(e.message || e), 3200, "bad"); }
    }
    browserSpeak(words);
  }
  function browserSpeak(words) {
    if (!("speechSynthesis" in window)) return toast("No voice available to read this aloud.", 3200, "bad");
    const u = new SpeechSynthesisUtterance(words);
    u.lang = "en-US";
    const v = speechSynthesis.getVoices().find((x) => x.lang === "en-US") || speechSynthesis.getVoices().find((x) => x.lang.startsWith("en"));
    if (v) u.voice = v;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  // ```listen block in a unit or practice set: Play / Slow load the audio once, then a normal player
  // (pause, seek, replay) stays in the block.
  function wireListen(el) {
    const box = $(".listen-audio", el), script = el.dataset.script || "";
    const load = async (slow, btn) => {
      const label = btn.textContent;
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
      try {
        const a = document.createElement("audio");
        a.controls = true; a.src = await ttsUrl(script, slow); a.preload = "auto";
        box.innerHTML = ""; box.appendChild(a);
        await a.play().catch(() => {});
      } catch (e) {
        if (e.status === 501) browserSpeak($("details p", el).innerText);
        else toast(String(e.message || e), 4000, "bad");
      } finally { btn.disabled = false; btn.textContent = label; }
    };
    $(".listen-play", el).onclick = (e) => load(false, e.currentTarget);
    $(".listen-slow", el).onclick = (e) => load(true, e.currentTarget);
  }

  /* ---------------- voice: speak (mic) ----------------
     1) record in the browser + local Whisper on the server (any browser, private, offline)
     2) otherwise the browser's own dictation (Chrome/Edge)
     One recording at a time. A target is { ta, btn, bar(on, html) }: the chat composer by default,
     or a "Your turn" box in a unit / practice set.                                          */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let media = null, micBusy = false, rec = null, mic = null;
  const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  function recBar(on, html = "") {
    $("#rec-bar").classList.toggle("on", on);
    if (html) $("#rec-text").innerHTML = html;
  }
  const chatMic = () => ({ ta: $("#input"), btn: $("#btn-mic"), bar: recBar });
  function appendToInput(text, t = mic || chatMic()) {
    const i = t.ta;
    i.value = (i.value.trim() ? i.value.trimEnd() + " " : "") + text.trim();
    i.dataset.voice = "1";
    i.focus(); i.dispatchEvent(new Event("input"));  // grows the chat box / saves the exercise draft
  }
  async function toggleMic(target) {
    const t = target && target.ta ? target : chatMic();
    if (micBusy) return;
    if (media || rec) {
      const same = mic && mic.ta === t.ta;
      if (media) stopRecording(); else rec.stop();
      if (same) return;  // a second press on the same mic only stops it
      return toast("Stopped the other recording. Press the mic again to record here.", 3000);
    }
    mic = t;
    if (S.state?.stt && canRecord()) return startRecording();
    if (SR) return startDictation();
    mic = null;
    if (!canRecord()) return toast("This browser cannot use the microphone here.", 3600, "bad");
    toast("Voice input needs local speech-to-text (Docker app) or Chrome/Edge.", 4200, "bad");
  }
  async function startRecording() {
    const t = mic;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { mic = null; return toast("The microphone is blocked. Allow it in the browser.", 4000, "bad"); }
    const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find((x) => window.MediaRecorder.isTypeSupported?.(x)) || "";
    let mr;
    try { mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined); }
    catch { stream.getTracks().forEach((x) => x.stop()); mic = null; return toast("Could not start recording.", 3000, "bad"); }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((x) => x.stop());
      const blob = new Blob(chunks, { type: mr.mimeType || type || "audio/webm" });
      if (blob.size < 800) { t.bar(false); if (mic === t) mic = null; return toast("Too short. Speak a bit longer.", 2600, "bad"); }
      transcribe(blob, t);
    };
    mr.start(250);
    const t0 = Date.now();
    media = { mr, iv: setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      t.bar(true, `Recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · press the mic to stop`);
      if (s >= 120) stopRecording();
    }, 250) };
    t.btn.classList.add("rec");
    t.bar(true, "Recording 0:00 · press the mic to stop");
  }
  function stopRecording() {
    if (!media) return;
    clearInterval(media.iv);
    try { media.mr.stop(); } catch { /* already stopped */ }
    media = null;
    mic?.btn.classList.remove("rec");
  }
  async function transcribe(blob, t) {
    micBusy = true;
    t.btn.classList.add("busy");
    t.bar(true, `<span class="spinner"></span> Writing down what you said…`);
    try {
      const r = await post("/api/transcribe", null, true, blob);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || r.statusText);
      if (d.text) appendToInput(d.text, t);
      else toast("I could not hear any words. Try again, closer to the mic.", 3200, "bad");
    } catch (e) {
      toast(String(e.message || e), 4200, "bad");
    } finally {
      micBusy = false;
      t.btn.classList.remove("busy");
      t.bar(false);
      if (mic === t) mic = null;
    }
  }
  function startDictation() {
    const t = mic;
    rec = new SR();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    const input = t.ta;
    const base = input.value ? input.value.trimEnd() + " " : "";
    rec.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      input.value = base + s; input.dataset.voice = "1"; input.dispatchEvent(new Event("input"));
    };
    rec.onend = () => { rec = null; t.btn.classList.remove("rec"); t.bar(false); if (mic === t) mic = null; };
    rec.onerror = (e) => {
      const msg = e.error === "network" ? "Browser dictation needs Google's servers and is not working here. Use the Docker app for local speech-to-text."
        : e.error === "not-allowed" || e.error === "service-not-allowed" ? "The microphone is blocked. Allow it in the browser." : `Microphone: ${e.error}`;
      toast(msg, 5200, "bad");
    };
    rec.start();
    t.btn.classList.add("rec");
    t.bar(true, "Listening · press the mic to stop");
  }

  /* ---------------- workspace tabs ---------------- */
  function emptyState(icon, html) {
    return `<div class="empty"><div class="ico">${ic(icon, "lg")}</div><div>${html}</div></div>`;
  }
  function openPanel(tab, stay) {
    S.tab = tab;
    if (!stay && (location.hash || "#study") !== "#study") location.hash = "#study";  // stay: page load keeps the current view
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
          <div class="ring"><svg viewBox="0 0 78 78"><circle class="bg" cx="39" cy="39" r="34"/><circle class="fg" id="ring-fg" cx="39" cy="39" r="34" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/><circle class="disc" cx="39" cy="39" r="27.5"/></svg>
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
  const { isRight, clean, choices } = window.Grading;
  const isPractice = (id) => /^\d{4}-\d\d-\d\d-[a-z0-9-]+$/.test(id || "");

  async function openUnit(id) {
    openPanel("unit");
    const box = $("#panel-unit");
    box.innerHTML = `<div class="sk" style="height:40px;width:60%"></div><div class="sk" style="height:14px;margin-top:20px"></div><div class="sk" style="height:14px;margin-top:8px;width:80%"></div><div class="sk" style="height:200px;margin-top:26px"></div>`;
    let data;
    const isP = isPractice(id);
    try { data = await api(`/api/unit?id=${id}`); }
    catch {
      if (isP) { box.innerHTML = emptyState("book", `Practice set <b>${esc(id)}</b> was not found.<br><br><a href="#practice">Make a new one</a>`); S.unit = null; return; }
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
    wireDocLinks(doc, isP ? `materials/generated/practice/${id}.md` : `materials/grammar/${id}.md`);
    $$(".listen", doc).forEach(wireListen);
    const draft = store.get(`ans:${id}`, {});
    let inEx = false, inTurn = false, nTurn = 0;
    const seenN = new Set();
    [...doc.children].forEach((node) => {
      if (node.tagName === "H2") inEx = /practi|exerc/i.test(node.textContent);
      if (/^H[23]$/.test(node.tagName)) inTurn = node.tagName === "H3" && /your turn|produ/i.test(node.textContent);
      if (!inEx) return;
      // "Your turn" steps are instructions, not questions (scripts/check_practice.py skips them too);
      // a repeated number would share its saved answer and its key line with an earlier item.
      if (node.tagName === "OL" && !inTurn) $$("li[data-n]", node).forEach((li) => {
        const n = li.dataset.n;
        if (seenN.has(n)) return;
        seenN.add(n);
        const save = (v) => { const d = store.get(`ans:${id}`, {}); d[n] = v; store.set(`ans:${id}`, d); };
        const inp = document.createElement("input");
        inp.className = "ex-input"; inp.dataset.n = n; inp.value = draft[n] || "";
        const mc = choices(li.innerHTML);
        if (mc) {  // multiple choice: one tick box per option; the hidden input holds the chosen option text
          li.innerHTML = `<span class="q">${mc.stem}</span>`;
          li.dataset.q = li.textContent.trim();
          inp.type = "hidden";
          const group = document.createElement("div");
          group.className = "choices"; group.setAttribute("role", "radiogroup");
          group.innerHTML = mc.opts.map((o) => `<button type="button" class="choice" role="radio" aria-checked="false" data-l="${o.letter}"><span class="tick" aria-hidden="true"></span><span class="ct">${o.html}</span></button>`).join("");
          const btns = $$(".choice", group), text = (b) => $(".ct", b).textContent.trim();
          btns.forEach((b) => {
            if (inp.value && text(b) === inp.value) b.setAttribute("aria-checked", "true");
            b.onclick = () => {
              const on = b.getAttribute("aria-checked") !== "true";
              btns.forEach((x) => x.setAttribute("aria-checked", String(on && x === b)));
              inp.value = on ? text(b) : ""; save(inp.value);
            };
          });
          li.append(group, inp);
          return;
        }
        li.dataset.q = li.textContent.trim();  // the item text, so a full-sentence answer can be graded too
        inp.placeholder = "Your answer"; inp.autocomplete = "off"; inp.spellcheck = false;
        inp.oninput = () => save(inp.value);
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); const all = $$(".ex-input:not([type=hidden])", doc); const nx = all[all.indexOf(inp) + 1]; nx ? nx.focus() : $("#ex-check").click(); } };
        li.appendChild(inp);
      });
      if (node.tagName === "H3" && /your turn|produ/i.test(node.textContent)) {
        const wrap = document.createElement("div");
        wrap.className = "prod";
        const speaking = /speak/i.test(node.textContent);
        const key = nTurn++ ? `prod${nTurn}` : "prod";  // each "Your turn" box keeps its own draft
        wrap.innerHTML = `<textarea placeholder="${speaking ? "Press the mic and speak, or write here" : "Write here in English, or press the mic and speak"}"></textarea>
          <div class="row-end"><span class="prod-rec"></span>
            <button class="btn sm quiet prod-mic" title="Speak (English)" aria-label="Speak">${ic("mic", "sm")}<span>Speak</span></button>
            <button class="btn sm ghost prod-send">${ic("pen", "sm")}Send to the tutor</button></div>`;
        const ta = $("textarea", wrap), recEl = $(".prod-rec", wrap);
        ta.value = draft[key] || "";
        ta.oninput = () => { const d = store.get(`ans:${id}`, {}); d[key] = ta.value; store.set(`ans:${id}`, d); };
        const target = { ta, btn: $(".prod-mic", wrap), bar: (on, html) => { recEl.classList.toggle("on", on); if (html) recEl.innerHTML = html; } };
        $(".prod-mic", wrap).onclick = () => toggleMic(target);
        $(".prod-send", wrap).onclick = () => {
          const said = ta.dataset.voice ? " I said it with the microphone, so this is a transcript (check what I said, not the punctuation)." : "";
          ta.value.trim() ? send(`${isP ? "Practice set" : "Unit"} ${id}, "${node.textContent.trim()}".${said} Please check it and focus on the ${speaking ? "speaking task" : `grammar of the ${isP ? "practice set" : "unit"}`} (english-examiner, quick mode):\n\n${ta.value.trim()}`)
            : toast("Write or say something first.", 2200, "bad");
        };
        let anchor = node; while (anchor.nextElementSibling && !/^H[23]$/.test(anchor.nextElementSibling.tagName)) anchor = anchor.nextElementSibling;  // after the whole task card
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
      // tick boxes with a lettered key ("b) I am"): the picked letter decides, so "I'm" can't pass for "I am"
      const keyLetters = [...clean(exp).matchAll(/(?:^|\/)\s*\(?([a-f])\)\s/gi)].map((x) => x[1].toLowerCase());
      const picked = $(".choice[aria-checked=true]", li);
      const ok = li.dataset.override ? li.dataset.override === "1"
        : $(".choice", li) && keyLetters.length ? !!picked && keyLetters.includes(picked.dataset.l)
        : isRight(inp.value, exp, li.dataset.q);
      if (ok) right++;
      li.classList.add(ok ? "right" : "wrong");
      $$(".choice", li).forEach((b) => b.classList.toggle("is-key", !ok && keyLetters.includes(b.dataset.l)));
      const mk = document.createElement("div");
      mk.className = "mark";
      const shown = $(".choice", li) ? clean(exp).replace(/^\(?[a-f]\)\s*/i, "") : clean(exp);  // tick boxes show no letters
      mk.innerHTML = `${ok ? MK_GOOD : MK_BAD}${ok ? "" : `<span class="exp">${inline(shown)}</span>`}<button title="Change the mark">${ok ? "mark as wrong" : "it is right"}</button>`;
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
        if (!isPractice(id)) store.set(`result:${S.state.today}`, { id, pct });  // only units go into "Finish session"
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
    send(`I did ${isPractice(id) ? "practice set" : "unit"} ${id} in the app. These answers were wrong:\n${wrong.join("\n")}\n\nExplain each mistake in simple English (one or two lines each) and give me 3 new sentences to practise the point I missed most. If it is a recurring error, log it in progress/error-log.md.`);
  }

  /* ---------------- practice: a short wizard, then the tutor builds a practice set ----------------
     Each step is plain data; `when` hides a step that does not apply. Answers live in localStorage
     ("practice:draft") until "Create", so a reload never loses them.                              */
  const has = (v, x) => Array.isArray(v) && v.includes(x);
  const P_STEPS = [
    { id: "skills", q: "What do you want to practise?", hint: "Choose one or more.", multi: true, opts: [
      ["grammar", "Grammar", "rules and sentences"], ["vocabulary", "Vocabulary", "new words and phrases"],
      ["listening", "Listening", "understand people"], ["speaking", "Speaking", "talk and answer"],
      ["reading", "Reading", "short texts"], ["writing", "Writing", "messages and emails"]] },
    { id: "grammar", q: "Which grammar points?", hint: "Choose one or more.", multi: true, when: (c) => has(c.skills, "grammar"), opts: () => grammarOpts() },
    { id: "vocabulary", q: "What kind of words?", hint: "Choose one or more.", multi: true, when: (c) => has(c.skills, "vocabulary"), opts: [
      ["topic", "Words for my topic", "the topics you choose next"], ["phrasal", "Phrasal verbs", "get up, find out…"],
      ["collocations", "Word partners", "make a mistake, do homework…"], ["deck", "Words from my deck", "review my saved words"],
      ["academic", "Class and AI words", "for lectures and projects"]] },
    { id: "listening", q: "What do you want to listen to?", hint: "Choose one or more.", multi: true, when: (c) => has(c.skills, "listening"), opts: [
      ["dialogue", "Short dialogues", "everyday situations"], ["lecture", "A class or a talk", "like a lecture at Howest"],
      ["news", "Easy news", "slow and clear"], ["podcast", "A podcast", "real conversation"]] },
    { id: "accent", q: "Which voices?", when: (c) => has(c.skills, "listening"), opts: [
      ["american", "American English", "my accent target"], ["international", "International", "non-native speakers, like my classmates"],
      ["any", "No preference", "the tutor chooses"]] },
    { id: "speaking", q: "How do you want to speak?", hint: "Choose one or more.", multi: true, when: (c) => has(c.skills, "speaking"), opts: [
      ["roleplay", "Role-play", "a real situation with the tutor"], ["opinion", "Give my opinion", "short answers with reasons"],
      ["presentation", "Mini-presentation", "1–2 minutes about a topic"], ["pronunciation", "Pronunciation", "difficult sounds and words"],
      ["shadowing", "Shadowing", "listen and repeat"]] },
    { id: "reading", q: "What do you want to read?", hint: "Choose one or more.", multi: true, when: (c) => has(c.skills, "reading"), opts: [
      ["short", "A short text", "a story or a description"], ["email", "An email or a notice", "from a landlord, a teacher…"],
      ["article", "An article about AI", "simple and short"]] },
    { id: "writing", q: "What do you want to write?", hint: "Choose one or more.", multi: true, when: (c) => has(c.skills, "writing"), opts: [
      ["message", "An informal message", "to a friend or a flatmate"], ["email", "A formal email", "to a teacher or an office"],
      ["paragraph", "A short paragraph", "my opinion about something"]] },
    { id: "topics", q: "Which topics?", hint: "Optional. Choose one or more.", multi: true, optional: true, opts: [
      ["housing", "Housing"], ["cityhall", "City hall"], ["bank", "Bank"], ["health", "Health"], ["transport", "Transport"],
      ["university", "University & classes"], ["groupwork", "Group projects"], ["ai", "AI & tech"], ["social", "Social life"],
      ["food", "Food & shopping"], ["belgium", "Belgium"], ["surprise", "Surprise me"]] },
    { id: "level", q: "How hard?", opts: [["easier", "Easier", "review and confidence"], ["level", "My level", "about A2+ / B1"], ["challenge", "Challenge", "a bit above my level"]] },
    { id: "time", q: "How much time do you have?", opts: [["10", "10 min"], ["20", "20 min"], ["30", "30 min"], ["45", "45 min"]] },
    { id: "types", q: "Which kinds of exercises?", hint: "Optional. If you skip, the tutor chooses.", multi: true, optional: true,
      when: (c) => ["grammar", "vocabulary", "listening", "reading"].some((x) => has(c.skills, x)), opts: [
        ["gap", "Fill the gap"], ["choice", "Multiple choice"], ["mistake", "Find the mistake"],
        ["rewrite", "Rewrite the sentence"], ["order", "Put the words in order"], ["short", "Short answers"]] },
    { id: "note", q: "Anything else?", hint: "Optional. For example: “I have a flat viewing tomorrow.”", text: true, optional: true },
    { id: "summary", q: "Ready?", summary: true },
  ];
  const P_DEFAULT = { level: "level", time: "20" };
  let pDraft = null;
  const pLoad = () => { pDraft = pDraft || store.get("practice:draft", null) || { step: "skills", c: { ...P_DEFAULT } }; return pDraft; };
  const pSave = () => store.set("practice:draft", pDraft);
  const pSteps = () => P_STEPS.filter((s) => !s.when || s.when(pLoad().c));
  const optsOf = (s) => (typeof s.opts === "function" ? s.opts() : s.opts || []);
  const optLabel = (s, v) => (optsOf(s).find((o) => o[0] === v) || [v, v])[1];

  let pSpine = null, pShowAll = false;
  function grammarOpts() {
    const units = (pSpine || []).filter((u) => u.title);
    const short = (t) => plain(t).split(" · ")[0];
    const seen = units.filter((u) => u.status !== "todo"), picked = pLoad().c.grammar || [];
    // short list: the next 8 units (plus any already picked); "Show all units" opens the whole spine
    const next = units.filter((u) => u.status === "todo").filter((u, i) => pShowAll || i < 8 || picked.includes(u.id));
    return [["weak", "My weak points", "my mistakes and units to repeat", "Suggested"],
      ...seen.map((u) => [u.id, short(u.title), `${u.id} · ${u.status === "redo" ? "to repeat" : "studied"}`, "Studied"]),
      ...next.map((u) => [u.id, short(u.title), `${u.id} · ${u.cefr || ""}`.replace(/ · $/, ""), "Coming next"])];
  }

  async function renderPractice() {
    if (!pSpine) { try { pSpine = await api("/api/spine"); } catch { pSpine = []; } }
    if (pBuild) renderBuild(); else renderWizard();
    renderPracticeList();
  }

  function goStep(id) { pLoad().step = id; pSave(); renderWizard(); }
  function stepMove(dir) {
    const steps = pSteps(), i = Math.max(0, steps.findIndex((s) => s.id === pLoad().step));
    goStep(steps[Math.min(steps.length - 1, Math.max(0, i + dir))].id);
  }

  function renderWizard() {
    const box = $("#pw"), d = pLoad(), steps = pSteps();
    let i = steps.findIndex((s) => s.id === d.step);
    if (i < 0) { i = 0; d.step = steps[0].id; }
    const s = steps[i], val = d.c[s.id];
    const ready = s.optional || s.summary || (s.multi ? (val || []).length > 0 : !!val);
    let body = "";
    if (s.summary) {
      const rows = steps.filter((x) => !x.summary).map((x) => {
        const v = d.c[x.id];
        const txt = x.text ? (v || "").trim() : x.multi ? (v || []).map((o) => optLabel(x, o)).join(", ") : v ? optLabel(x, v) : "";
        return `<button class="sum-row" data-go="${x.id}"><span>${esc(x.q.replace(/\?$/, ""))}</span><b>${esc(txt || (x.optional ? "tutor's choice" : "—"))}</b></button>`;
      });
      body = `<div class="sum">${rows.join("")}</div>`;
    } else if (s.text) {
      body = `<textarea class="pw-note" id="pw-note" placeholder="Write in English (optional)">${esc(val || "")}</textarea>`;
    } else {
      let group = "";
      body = `<div class="opts${optsOf(s).some((o) => o[3]) ? " grouped" : ""}" role="${s.multi ? "group" : "radiogroup"}">` + optsOf(s).map(([v, label, sub, g]) => {
        const on = s.multi ? has(val, v) : val === v;
        const head = g && g !== group ? ((group = g), `<div class="opt-group">${esc(g)}</div>`) : "";
        return `${head}<button class="opt${on ? " on" : ""}${s.multi ? " multi" : ""}" data-v="${esc(v)}" role="${s.multi ? "checkbox" : "radio"}" aria-checked="${on}">
          <span class="ck">${ic("check", "sm")}</span><span class="ot"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></button>`;
      }).join("") + `</div>`;
      if (s.id === "grammar" && !pShowAll && (pSpine || []).filter((u) => u.status === "todo").length > 8)
        body += `<button class="btn quiet sm pw-more" id="pw-all">Show all units</button>`;
    }
    box.innerHTML = `
      <div class="pw-top"><span class="eyebrow">Step ${i + 1} of ${steps.length}</span><div class="pw-bar"><span style="width:${Math.round(((i + 1) / steps.length) * 100)}%"></span></div></div>
      <h2>${esc(s.q)}</h2>${s.hint ? `<p class="muted pw-hint">${esc(s.hint)}</p>` : ""}
      ${body}
      <div class="pw-nav">
        ${i ? `<button class="btn quiet sm" id="pw-back">Back</button>` : "<span></span>"}
        <span class="grow"></span>
        ${s.summary ? `<button class="btn quiet sm" id="pw-restart">Start over</button><button class="btn" id="pw-create">${ic("spark", "sm")}<span>Create my practice</span></button>`
          : `${s.optional ? `<button class="btn quiet sm" id="pw-skip">Skip</button>` : ""}<button class="btn sm" id="pw-next" ${ready ? "" : "disabled"}><span>Next</span>${ic("arrow", "sm arrow")}</button>`}
      </div>`;
    $$(".opt", box).forEach((b) => (b.onclick = () => {
      const v = b.dataset.v;
      if (s.multi) {
        const set = new Set(d.c[s.id] || []);
        set.has(v) ? set.delete(v) : set.add(v);
        d.c[s.id] = optsOf(s).map((o) => o[0]).filter((x) => set.has(x));
        pSave(); renderWizard();
      } else {
        d.c[s.id] = v; pSave(); renderWizard();
        setTimeout(() => { if (pLoad().step === s.id) stepMove(1); }, 160);  // single choice: go on by itself
      }
    }));
    $$(".sum-row", box).forEach((b) => (b.onclick = () => goStep(b.dataset.go)));
    const note = $("#pw-note");
    if (note) { note.oninput = () => { d.c.note = note.value; pSave(); }; note.focus(); }
    if ($("#pw-all")) $("#pw-all").onclick = () => { pShowAll = true; renderWizard(); };
    if ($("#pw-back")) $("#pw-back").onclick = () => stepMove(-1);
    if ($("#pw-next")) $("#pw-next").onclick = () => stepMove(1);
    if ($("#pw-skip")) $("#pw-skip").onclick = () => { if (s.multi) d.c[s.id] = []; else if (s.text) d.c[s.id] = ""; pSave(); stepMove(1); };
    if ($("#pw-restart")) $("#pw-restart").onclick = () => { pDraft = { step: "skills", c: { ...P_DEFAULT } }; pSave(); renderWizard(); };
    if ($("#pw-create")) $("#pw-create").onclick = createPractice;
    box.onkeydown = (e) => {
      if (e.key !== "Enter" || e.target.tagName === "TEXTAREA" && !(e.ctrlKey || e.metaKey)) return;
      const nx = $("#pw-next") || $("#pw-create");
      if (nx && !nx.disabled) { e.preventDefault(); nx.click(); }
    };
  }

  // Only what the visible steps say (answers of steps that no longer apply are left out).
  function practiceChoices() {
    const d = pLoad(), out = {};
    pSteps().filter((s) => !s.summary).forEach((s) => {
      const v = d.c[s.id];
      if (s.text ? (v || "").trim() : s.multi ? (v || []).length : v) out[s.id] = s.text ? v.trim().slice(0, 600) : v;
    });
    return out;
  }
  function practicePrompt(ch) {
    const line = (s) => {
      const v = ch[s.id];
      if (v === undefined) return s.optional ? `- ${s.q.replace(/\?$/, "")}: tutor's choice` : "";
      const txt = s.text ? `"${v}"` : s.multi ? v.map((o) => (s.id === "grammar" && o !== "weak" ? `${o} ${optLabel(s, o)}` : optLabel(s, o))).join(", ") : optLabel(s, v);
      return `- ${s.q.replace(/\?$/, "")}: ${txt}`;
    };
    return `Please create a practice set for me (practice-builder skill).\n${pSteps().filter((s) => !s.summary).map(line).filter(Boolean).join("\n")}\n\nChoices (JSON): ${JSON.stringify(ch)}`;
  }

  // Claude first; Codex only when Claude is not installed or not logged in.
  const pickAgent = () => ["claude", "codex"].find((a) => agentStatus(a) === "ok") || null;
  async function createPractice() {
    const agent = pickAgent();
    if (!agent) return toast("Claude and Codex are not connected. Check Settings.", 3600, "bad");
    if (S.running) return toast("The tutor is still answering. Wait a moment.", 2600, "bad");
    const ch = practiceChoices(), text = practicePrompt(ch);  // build it before the draft is reset below
    if (S.agent !== agent) await setAgent(agent);
    if (agent === "codex") toast("Claude is not available, so Codex will make it.", 3000);
    S.pendingPractice = ch;
    store.set("practice:last", ch);
    pDraft = { step: "skills", c: { ...P_DEFAULT } }; pSave();
    startBuild(ch);
    send(text, buildHooks());
  }

  /* ---------------- practice: live status while the tutor builds the set ----------------
     One line per stage, added as the tutor works: a spinner on the current one, a check on the
     ones before it. The wizard comes back only when the learner asks for a new set.          */
  let pBuild = null;  // { ch, steps: [{label, state, prov}], started, status: running|ready|question|error|stopped, id, error }
  function startBuild(ch) {
    pBuild = { ch, steps: [{ label: "Sending your choices to the tutor", state: "doing" }], started: Date.now(), status: "running" };
    renderBuild();
  }
  function buildStep(label, prov = false) {
    const st = pBuild.steps, last = st[st.length - 1];
    if (last && last.prov) st.pop();                 // "Finishing" was only the tutor's notes: more work came
    const cur = st[st.length - 1];
    if (cur && cur.label === label) return;          // same stage, still going
    if (cur) cur.state = "done";
    st.push({ label, state: "doing", prov });
  }
  function buildLabel(tool) {
    const l = stepLabel(tool);
    const has = (x) => pBuild.steps.some((s) => s.label === x);
    if (l === "Writing your practice set" && has("Checking the exercises")) return "Fixing a problem in the exercises";
    if (l === "Checking the exercises" && has("Fixing a problem in the exercises")) return "Checking the exercises again";
    // too vague to show, or an app notice ("Stopped.", "New conversation…") rather than a stage
    if (l === tool || l === "Writing a file" || l === "Working" || l === "Checking something") return null;
    return l;
  }
  function buildHooks() {
    const b = pBuild;
    const live = () => b === pBuild && b.status === "running";  // the learner may have started over meanwhile
    const paint = () => { if (b === pBuild && location.hash === "#practice") renderBuild(); };
    return {
      tool(t) { if (t === "Stopped.") b.stopped = true; if (!live()) return; const l = buildLabel(t); if (l) buildStep(l); paint(); },
      text() { if (!live()) return; const last = b.steps[b.steps.length - 1]; if (!last.prov) { buildStep("Finishing", true); paint(); } },
      practice(id) {
        if (!live()) return false;
        const here = location.hash === "#practice";
        b.id = id; buildStep("Your practice set is ready"); b.steps[b.steps.length - 1].state = "done"; b.status = "ready"; paint();
        if (here) setTimeout(() => { if (b === pBuild && location.hash === "#practice") { location.hash = "#study"; openUnit(id); } }, 1400);
        return here;  // on another page: open it right away, as before
      },
      error(msg) { if (live()) { b.status = "error"; b.error = msg; paint(); } },
      done() {
        if (!live()) return;
        b.status = b.stopped ? "stopped" : "question";
        b.steps.forEach((s) => { if (s.state === "doing") s.state = "done"; });
        paint();
      },
    };
  }
  function renderBuild() {
    const box = $("#pw"), b = pBuild;
    const clock = () => { const s = Math.floor((Date.now() - b.started) / 1000); return `Working · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    const shown = b.shown || 0; b.shown = b.steps.length;  // only new lines slide in
    const head = { running: "Making your practice set", ready: "Your practice set is ready",
      question: "The tutor wrote to you", error: "Something went wrong", stopped: "Stopped" }[b.status];
    const sub = { running: "This takes a few minutes. You can wait here or do something else.",
      ready: "Opening it now…", question: "The tutor needs something from you. Read the chat and answer there.",
      error: b.error || "The tutor could not finish.", stopped: "The tutor stopped before the set was ready." }[b.status];
    box.innerHTML = `
      <div class="pw-top"><span class="eyebrow" id="pb-clock">${b.status === "running" ? clock() : "Practice set"}</span></div>
      <h2>${esc(head)}</h2><p class="muted pw-hint">${esc(sub)}</p>
      <ol class="pb">${b.steps.map((s, i) => `<li class="pb-step ${s.state}${i >= shown ? " new" : ""}"><span class="pb-ic">${s.state === "doing" && b.status === "running" ? '<span class="spinner"></span>' : ic(b.status === "error" && s.state === "doing" ? "alert" : "check", "sm")}</span><span>${esc(s.label)}</span></li>`).join("")}</ol>
      <div class="pw-nav"><span class="grow"></span>
        ${b.status === "ready" ? `<button class="btn" id="pb-open"><span>Open my practice</span>${ic("arrow", "sm arrow")}</button>` : ""}
        ${b.status === "question" ? `<button class="btn sm" id="pb-chat">Go to the chat</button>` : ""}
        ${b.status === "error" || b.status === "stopped" ? `<button class="btn sm" id="pb-retry">Try again</button>` : ""}
        ${b.status !== "running" ? `<button class="btn quiet sm" id="pb-new">Make a new set</button>` : ""}
      </div>`;
    if ($("#pb-open")) $("#pb-open").onclick = () => { location.hash = "#study"; openUnit(b.id); };
    if ($("#pb-chat")) $("#pb-chat").onclick = () => { document.body.classList.add("chat-open"); if (document.body.classList.contains("chat-closed")) setLayout("chat-closed", false); $("#input").focus(); };
    if ($("#pb-retry")) $("#pb-retry").onclick = () => { pBuild = null; practiceAgain(b.ch); };
    if ($("#pb-new")) $("#pb-new").onclick = () => { pBuild = null; renderWizard(); };
    clearInterval(renderBuild.t);
    if (b.status === "running") renderBuild.t = setInterval(() => {
      const c = $("#pb-clock");
      if (b !== pBuild || b.status !== "running" || !c) return clearInterval(renderBuild.t);
      c.textContent = clock();
    }, 1000);
  }
  function savePracticeChoices(id) {
    if (!S.pendingPractice) return;
    const choices = S.pendingPractice;
    S.pendingPractice = null;
    api("/api/practice/choices", { id, choices }).then(() => { if (location.hash === "#practice") renderPracticeList(); }).catch(() => {});
  }
  function practiceAgain(ch) {
    if (pBuild && pBuild.status === "running") return toast("The tutor is still making your last set. Wait a moment.", 2800, "bad");
    pBuild = null;
    pDraft ={ step: "summary", c: { ...P_DEFAULT, ...ch } }; pSave();
    renderWizard();
    $("#pw").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function renderPracticeList() {
    const box = $("#plist");
    let sets;
    try { sets = await api("/api/practice/list"); } catch { sets = []; }
    if (!sets.length) { box.innerHTML = `<p class="muted plist-empty">Your practice sets will appear here.</p>`; return; }
    box.innerHTML = `<div class="phase-title"><b>Your practice sets</b><span>${sets.length}</span></div><div class="psets"></div>`;
    const grid = $(".psets", box);
    sets.forEach((x) => {
      const el = document.createElement("div");
      el.className = "pset";
      const pct = Number.isInteger(x.pct) ? x.pct : null;
      const cls = pct === null ? "" : pct >= 90 ? "done" : pct >= 70 ? "ok" : "redo";
      el.innerHTML = `<div class="top"><span class="uid">${esc(fmtDate(x.date))}</span>${pct === null ? `<span class="tag">new</span>` : `<span class="tag ${cls}">${pct}%</span>`}</div>
        <span class="ut">${esc(plain(x.title))}</span>${x.meta ? `<small>${esc(plain(x.meta))}</small>` : ""}
        <div class="row-end"></div>`;
      const row = $(".row-end", el);
      const b = (label, cls2, fn) => { const k = document.createElement("button"); k.className = `btn sm ${cls2}`; k.innerHTML = label; k.onclick = fn; row.appendChild(k); };
      if (x.choices) b("Again", "quiet", () => practiceAgain(x.choices));
      b(`Open${ic("arrow", "sm arrow")}`, "ghost", () => { location.hash = "#study"; openUnit(x.id); });
      grid.appendChild(el);
    });
    stagger(grid);
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
        return `<button class="${c}" data-date="${d.date}" title="${d.date} · ${d.min} min${d.cp ? " · " + d.cp : ""} · see the plan">${+d.date.slice(8)}${d.cp ? `<b>${d.cp}</b>` : ""}</button>`;
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
    $$(".cal button.d", root).forEach((b) => (b.onclick = () => openDay(b.dataset.date)));
  }

  /* one day of the plan, opened from the Progress calendar */
  const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  async function openDay(date) {
    const d = $("#dlg-day"), body = $("#dd-body"), acts = $("#dd-actions");
    const dow = DOW[(new Date(`${date}T12:00:00`).getDay() + 6) % 7];
    $("#dd-eyebrow").textContent = `${dow} · ${fmtDate(date)}`;
    $("#dd-title").innerHTML = "Day";
    body.innerHTML = `<div class="sk" style="height:60px"></div><div class="sk" style="height:60px;margin-top:8px"></div><div class="sk" style="height:60px;margin-top:8px"></div>`;
    acts.innerHTML = "";
    if (!d.open) d.showModal();
    let x;
    try { x = await api(`/api/day?date=${encodeURIComponent(date)}`); }
    catch (e) { body.innerHTML = emptyState("alert", esc(e.message)); return; }
    const p = x.plan, wk = weekParts(p?.week);
    $("#dd-title").innerHTML = `Day <em>${x.day}</em>`;
    $("#dd-eyebrow").textContent = `${dow} · ${fmtDate(date)} · Week ${wk.week || x.week}${x.checkpoint ? ` · Checkpoint ${x.checkpoint}` : ""}`;
    const studied = x.sessions.reduce((a, s) => a + s.min, 0);
    const status = x.sessions.length
      ? `<div class="dd-status ${studied >= x.target ? "good" : ""}">${ic("check", "sm")}<span>Studied ${studied} of ${x.target} min${x.sessions.map((s) => { const t = [s.grammar, s.pct].filter(Boolean).join(" "); return t ? ` · ${esc(t)}` : ""; }).join("")}</span></div>`
      : x.past ? `<div class="dd-status bad">${ic("alert", "sm")}<span>No session logged on this day.</span></div>`
        : `<div class="dd-status">${ic("calendar", "sm")}<span>${x.today ? "Today" : "Planned"} · goal ${x.target} min</span></div>`;
    if (!p) {
      body.innerHTML = `${status}${emptyState("calendar", "This week has no day-by-day plan yet.<br>The tutor plans one week at a time.")}`;
      return;
    }
    body.innerHTML = `${status}${wk.title ? `<p class="dd-theme">${esc(wk.title)}</p>` : ""}<div class="dd-blocks">${p.blocks.map((b, i) => `
      <div class="dd-block"><span class="num">${String(i + 1).padStart(2, "0")}</span>
        <div><h3>${esc(b.label)}<span class="min">${b.min} min</span></h3><p>${inline(b.text) || "—"}</p></div></div>`).join("")}</div>`;
    stagger($(".dd-blocks", body));
    const btn = (label, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = `btn sm ${cls}`; b.innerHTML = label; b.onclick = () => { d.close(); fn(); }; acts.appendChild(b); };
    const unit = p.blocks.find((b) => b.key === "grammar")?.unit;
    if (unit) btn(`${ic("book", "sm")}Open ${esc(unit)}`, "ghost", () => openUnit(unit));
    btn(`${ic("file", "sm")}Week plan`, "ghost", () => openDoc(p.file));
    if (x.today) btn(`Go to today${ic("arrow", "sm arrow")}`, "", () => openPanel("today"));
  }

  /* ---------------- settings / git ---------------- */
  function openSettings() {
    const d = $("#dlg-settings"), f = $("form", d), s = S.state;
    $("#set-codex").innerHTML = (s.codex_models.length ? s.codex_models : ["gpt-6-sol"]).map((m) => `<option ${m === s.settings.codex_model ? "selected" : ""}>${esc(m)}</option>`).join("");
    f.claude_model.value = s.settings.claude_model || "";
    f.effort.value = s.settings.effort || "auto";
    f.claude_bin.value = s.settings.claude_bin || "";
    f.codex_bin.value = s.settings.codex_bin || "";
    $("#set-cbin").placeholder = s.paths.claude ? `automatic: ${s.paths.claude}` : "not found: enter the path";
    $("#set-xbin").placeholder = s.paths.codex ? `automatic: ${s.paths.codex}` : "not found: enter the path";
    $("#set-status").innerHTML = ["claude", "codex"].map((a) => { const st = agentStatus(a); return `<span><i class="dot ${st === "ok" ? "on" : st}"></i>${a} ${AGENT_STATUS[st]}</span>`; }).join("")
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

  /* When the composer grows (typing a long message, chips, the recording bar) the message list gets
     shorter from the bottom and the last message slid out of view. If the list was at the bottom
     before the resize, keep it there. */
  function keepChatBottom() {
    const box = $("#msgs");
    let atBottom = true;
    box.addEventListener("scroll", () => { atBottom = nearBottom(box); }, { passive: true });
    new ResizeObserver(() => { if (atBottom) box.scrollTop = box.scrollHeight; }).observe(box);
  }

  async function init() {
    paintThemeBtn();
    initLayout();
    await loadState();
    $$("#agent-seg button").forEach((b) => (b.onclick = () => setAgent(b.dataset.agent)));
    $("#btn-send").onclick = () => (S.running ? api("/api/chat/stop", { agent: S.agent }) : send());
    $("#btn-mic").onclick = () => toggleMic();
    $("#input").addEventListener("input", autoGrow);
    keepChatBottom();
    $("#input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    $("#btn-new").onclick = async () => { if (S.running) return; await api("/api/chat/reset", { agent: S.agent }); loadHistory(); };
    $("#btn-chat").onclick = () => { document.body.classList.add("chat-open"); $("#input").focus(); };
    $("#btn-chat-close").onclick = () => document.body.classList.remove("chat-open");
    $$("#panel-tabs button").forEach((b) => (b.onclick = () => (b.dataset.tab === "unit" && S.unit ? openUnit(S.unit) : b.dataset.tab === "doc" && S.docPath ? openDoc(S.docPath) : openPanel(b.dataset.tab))));
    $$("#g-filter button").forEach((b) => (b.onclick = () => { S.filter = b.dataset.f; store.set("gFilter", S.filter); applyFilter(); }));
    $("#btn-settings").onclick = openSettings;
    $("#btn-theme").onclick = toggleTheme;
    $("#btn-git").onclick = gitSave;
    $("#dlg-day").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });  // click outside closes
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("chat-open") && !document.querySelector("dialog[open]")) document.body.classList.remove("chat-open"); });
    window.addEventListener("focus", () => { if (!S.running) loadState().catch(() => {}); });  // e.g. back from logging in to Claude/Codex
    setRunning(false);
    setAgent(S.agent);
    route();
    openPanel("today", true);
  }
  init().catch((e) => { document.body.innerHTML = `<p style="padding:24px;font-family:system-ui">Could not start: ${esc(e.message)}</p>`; });
})();
