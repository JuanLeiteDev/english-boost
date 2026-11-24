/* English Boost: front-end (vanilla JS, no build step). */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const S = { state: null, agent: store.get("agent", "claude"), running: false, unit: null, key: null, docPath: null, filter: store.get("gFilter", "all") };

  /* ---------------- helpers ---------------- */
  const ic = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = (s) => MD.esc(String(s ?? ""));
  const MK_GOOD = `<span class="mk mk-good" aria-label="certo"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>`;
  const MK_BAD = `<span class="mk mk-bad" aria-label="errado"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></span>`;
  const st = (c, t) => `<span class="st st-${c}" title="${t}"></span>`;
  // Content files use a few emoji as markers; the UI shows designed indicators instead.
  const EMOJI_UI = [
    [/✅/g, st("done", "dominada")], [/☑️?/g, st("ok", "feita")], [/🔄/g, st("redo", "a repetir")], [/⬜/g, st("todo", "por fazer")],
    [/❌/g, MK_BAD], [/✔️?|✓/g, MK_GOOD], [/✗/g, MK_BAD],
    [/🇺🇸/g, '<span class="tag">US</span>'], [/🇬🇧/g, '<span class="tag">UK</span>'], [/🇧🇪/g, '<span class="tag">BE</span>'],
    [/🌍/g, '<span class="tag">Global</span>'], [/💰/g, '<span class="tag">Pago</span>'],
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
  async function post(path, payload, retry = true) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Token": window.TOKEN }, body: JSON.stringify(payload) });
    if (r.status === 403 && retry) { await refreshToken(); return post(path, payload, false); }
    return r;
  }
  async function api(path, body) {
    let r;
    try { r = body === undefined ? await fetch(path, { cache: "no-store" }) : await post(path, body); }
    catch { throw new Error("Sem ligação à app. Está a correr? (./estudar.sh ou docker compose up -d)"); }
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

  /* segmented controls: the thumb slides under the active button */
  function moveThumb(seg) {
    if (!seg) return;
    const th = $(".thumb", seg), a = $("button.active", seg);
    if (!th) return;
    if (!a || !a.offsetWidth) { th.style.opacity = "0"; return; }
    th.style.opacity = "1";
    th.style.width = `${a.offsetWidth}px`;
    th.style.transform = `translateX(${a.offsetLeft - 3}px)`;
    th.style.left = "3px";
  }
  function setActive(seg, pred) {
    $$("button", seg).forEach((b) => b.classList.toggle("active", pred(b)));
    moveThumb(seg);
  }
  const refreshThumbs = () => $$(".seg").forEach(moveThumb);
  window.addEventListener("resize", refreshThumbs);
  if (document.fonts) document.fonts.ready.then(refreshThumbs);

  /* ---------------- router ---------------- */
  function route() {
    const v = (location.hash || "#study").slice(1);
    $$(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${v}`));
    $$(".rail a").forEach((a) => a.classList.toggle("active", a.dataset.view === v));
    if (v === "grammar") renderGrammar();
    if (v === "progress") renderProgress();
    if (v === "resources") openResource(store.get("resDoc", "resources/catalog.md"));
    requestAnimationFrame(refreshThumbs);
  }
  window.addEventListener("hashchange", route);

  /* ---------------- state ---------------- */
  async function loadState() {
    S.state = await api("/api/state");
    $$("[data-dot]").forEach((d) => d.classList.toggle("on", !!S.state.agents?.[d.dataset.dot]));
    return S.state;
  }

  /* ---------------- chat ---------------- */
  const SUGGESTIONS = () => {
    const s = S.state || {};
    const unit = s.plan?.blocks?.[0]?.unit;
    const first = s.checkpoint
      ? { ico: "checkbox", t: `Checkpoint ${s.checkpoint}`, d: "Avaliação guiada", send: s.checkpoint === "C0" ? "Vamos fazer o diagnóstico C0." : `Vamos fazer o checkpoint ${s.checkpoint}.`, open: "today" }
      : s.is_review_day
        ? { ico: "repeat", t: "Revisão semanal", d: "Quiz, 4/3/2 e ajustes", send: "Vamos fazer a revisão semanal (daily-study-planner, modo 3).", open: "today" }
        : { ico: "calendar", t: "Estudo de hoje", d: "Plano e exercícios do dia", send: "Vamos estudar! Guia-me na sessão de hoje, bloco a bloco.", open: "today", unit };
    return [
      { ...first, primary: true },
      { ico: "message", t: "Conversar", d: "Role-play da semana", send: "Quero fazer um role-play do tema desta semana (speaking-coach)." },
      { ico: "pen", t: "Corrigir texto", d: "Feedback com critérios CEFR", fill: "Corrige este texto (english-examiner):\n\n" },
      { ico: "type", t: "Vocabulário", d: "Revisão espaçada", send: "Revisão de vocabulário de hoje (langtutor-vocab)." },
      { ico: "wave", t: "Pronúncia", d: "Treino dirigido", send: "Quero treinar pronúncia (speaking-coach): escolhe o ponto mais importante para mim." },
      { ico: "trend", t: "Como estou?", d: "Resumo do progresso", send: "Como estou a ir? Faz um resumo curto do meu progresso e diz-me o próximo foco." },
    ];
  };

  function runSuggestion(s) {
    if (s.open) openPanel(s.open);
    if (s.unit) openUnit(s.unit, false);
    if (s.fill) { const i = $("#input"); i.value = s.fill; i.focus(); autoGrow(); return; }
    if (s.send) send(s.send);
  }

  function renderHero() {
    const s = S.state;
    const eyebrow = s.day ? `${s.phase} · Semana ${s.week} · Dia ${s.day}` : `Começa a ${fmtDate(s.plan?.date)}`;
    const progress = Math.max(0, Math.min(100, Math.round(((s.day || 0) / 69) * 100)));
    const hero = document.createElement("div");
    hero.className = "hero";
    hero.innerHTML = `
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>Olá, Juan.</h1>
      <p class="sub">Faltam <b>${s.days_left}</b> dias para o Erasmus na Bélgica.</p>
      <div class="journey"><span class="mono">${s.day || 0}/69</span><div class="track"><span style="width:${progress}%"></span></div><span>01/02</span></div>
      <div class="cards"></div>`;
    const cards = $(".cards", hero);
    SUGGESTIONS().forEach((sg) => {
      const b = document.createElement("button");
      b.className = "card-btn" + (sg.primary ? " primary" : "");
      b.innerHTML = `<span class="ico">${ic(sg.ico)}</span><b>${esc(sg.t)}</b><span class="d">${esc(sg.d)}</span><span class="arrow">${ic("arrow", "sm")}</span>`;
      b.onclick = () => runSuggestion(sg);
      cards.appendChild(b);
    });
    stagger(cards);
    return hero;
  }

  function renderInlineChips() {
    const box = $("#chips-inline");
    box.innerHTML = "";
    if (!$$("#msgs .msg").length) return;
    SUGGESTIONS().forEach((sg) => {
      const b = document.createElement("button");
      b.innerHTML = `${ic(sg.ico, "sm")}<span>${esc(sg.t)}</span>`;
      b.onclick = () => runSuggestion(sg);
      box.appendChild(b);
    });
  }

  const MARK = /\[\[abrir:([^\]]+)\]\]/g;
  function parseMarkers(text) {
    const acts = [];
    text.replace(MARK, (_, a) => { acts.push(a.trim()); return ""; });
    return acts;
  }
  function doOpen(a, focus = true) {
    if (a === "hoje" || a === "today") return openPanel("today");
    if (/^P[12]-\d\d$/.test(a)) return openUnit(a, focus);
    if (a.startsWith("doc:")) return openDoc(a.slice(4));
    if (a.startsWith("url:")) return window.open(a.slice(4), "_blank", "noopener");
  }
  function pill(a) {
    if (a === "hoje" || a === "today") return [ic("calendar", "sm"), "Plano de hoje"];
    if (/^P[12]-\d\d$/.test(a)) return [ic("book", "sm"), `Unidade ${a}`];
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
    const codex = m.agent === "codex";
    el.innerHTML = `<div class="avatar ${codex ? "codex" : ""}">${codex ? "X" : "C"}</div>
      <div class="bubble">
        <div class="meta"><span class="who">${codex ? "Codex" : "Claude"}</span>
          <div class="actions"><button class="speak" title="Ouvir em inglês" aria-label="Ouvir">${ic("volume", "sm")}</button><button class="copy" title="Copiar" aria-label="Copiar">${ic("copy", "sm")}</button></div></div>
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
      ? `<span class="step" title="${esc(list.join("\n"))}">${live ? '<span class="spinner"></span>' : ic("check", "sm")}<span class="t">${esc(list[list.length - 1])}</span>${list.length > 1 ? `<span class="n">${list.length} passos</span>` : ""}</span>`
      : "";
    const text = (m.text || "").replace(MARK, "").replace(/\n{3,}/g, "\n\n").trim();
    $(".body", el).innerHTML = text ? md(text) : live ? `<div class="typing"><i></i><i></i><i></i></div>` : "";
    wireDocLinks($(".body", el), null);
    const pills = $(".pills", el);
    const acts = parseMarkers(m.text || "");
    if (pills.dataset.k !== acts.join("|")) {  // rebuild only when markers change (keeps the pop-in animation once)
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
    try { await navigator.clipboard.writeText(t.replace(MARK, "").trim()); toast("Copiado"); } catch { toast("Não foi possível copiar", 2600, "bad"); }
  }

  async function loadHistory() {
    const box = $("#msgs");
    box.innerHTML = "";
    const h = await api(`/api/chat/history?agent=${S.agent}`);
    if (!h.messages.length) box.appendChild(renderHero());
    h.messages.forEach((m) => { const e = msgEl(m); e.style.animation = "none"; box.appendChild(e); });
    renderInlineChips();
    box.scrollTop = h.messages.length ? box.scrollHeight : 0;
  }

  function setAgent(a) {
    S.agent = a; store.set("agent", a);
    setActive($("#agent-seg"), (b) => b.dataset.agent === a);
    const ok = S.state?.agents?.[a];
    $("#input").placeholder = ok === false ? `${a === "codex" ? "Codex" : "Claude"} não encontrado neste PC` : "Escreve ou fala em inglês";
    loadHistory();
  }

  function setRunning(r) {
    S.running = r;
    const b = $("#btn-send");
    b.classList.toggle("stop", r);
    b.title = r ? "Parar" : "Enviar";
    b.setAttribute("aria-label", b.title);
    b.innerHTML = ic(r ? "stop" : "up");
  }

  async function send(text) {
    text = (text ?? $("#input").value).trim();
    if (!text || S.running) return;
    $("#input").value = ""; autoGrow();
    location.hash = "#study";
    const box = $("#msgs");
    $(".hero", box)?.remove();
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
            parseMarkers(m.text).forEach((a, i) => { if (!opened.has(a)) { opened.add(a); doOpen(a, i === 0); } });
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
      loadState().then(() => { if ($("#panel-today").classList.contains("active")) renderToday(); });
    }
  }

  /* ---------------- voice ---------------- */
  function speak(text) {
    if (!("speechSynthesis" in window)) return toast("O browser não suporta voz.", 2600, "bad");
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
    const words = text.replace(MARK, "").replace(/```[\s\S]*?```/g, "").replace(/[*_`#>|]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(EMOJI_ANY, "");
    const u = new SpeechSynthesisUtterance(words);
    u.lang = "en-US";
    const v = speechSynthesis.getVoices().find((x) => x.lang === "en-US") || speechSynthesis.getVoices().find((x) => x.lang.startsWith("en"));
    if (v) u.voice = v;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function toggleMic() {
    if (!SR) return toast("Ditado indisponível neste browser (usa o Chrome ou o Edge).", 3200, "bad");
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    const input = $("#input");
    const base = input.value ? input.value.trimEnd() + " " : "";
    rec.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      input.value = base + s; autoGrow();
    };
    rec.onend = () => { rec = null; $("#btn-mic").classList.remove("on"); };
    rec.onerror = (e) => toast(`Microfone: ${e.error}`, 2600, "bad");
    rec.start();
    $("#btn-mic").classList.add("on");
  }

  /* ---------------- panel ---------------- */
  function emptyState(icon, html) {
    return `<div class="empty"><div class="ico">${ic(icon, "lg")}</div><div>${html}</div></div>`;
  }
  function openPanel(tab) {
    $("#panel").classList.add("open");
    setActive($("#panel-tabs"), (b) => b.dataset.tab === tab);
    $$(".panel-body").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
    if (tab === "today") renderToday();
    if (tab === "unit" && !S.unit) $("#panel-unit").innerHTML = emptyState("book", `Escolhe uma unidade em <a href="#grammar">Gramática</a>.`);
    if (tab === "doc" && !S.docPath) $("#panel-doc").innerHTML = emptyState("file", "Nenhum documento aberto.");
    location.hash = "#study";
  }

  /* timer (per day, local) */
  const tKey = () => `timer:${S.state?.today}`;
  const timer = () => store.get(tKey(), { acc: 0, since: null });
  const elapsed = () => { const t = timer(); return t.acc + (t.since ? Date.now() - t.since : 0); };
  const RING = 2 * Math.PI * 32;
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
      if (b.dataset.run !== String(run)) { b.dataset.run = String(run); b.innerHTML = ic(run ? "pause" : "play"); b.title = run ? "Pausar" : "Começar"; }
    }
  }
  setInterval(paintTimer, 1000);
  const fmtMs = (ms) => { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0"); return `${h ? h + ":" : ""}${mm}:${String(s % 60).padStart(2, "0")}`; };

  const BLOCK_ICON = { grammar: "book", listening: "headphones", output: "message", srs: "type" };
  function weekParts(w) {
    const m = String(w || "").match(/^(Semana\s+\d+)\s*:?\s*(\d{4}-\d\d-\d\d)\s*→\s*(\d{4}-\d\d-\d\d)\s*·\s*Tema:\s*(.+)$/);
    return m ? { eyebrow: `${m[1]} · ${fmtDate(m[2])} – ${fmtDate(m[3])}`, title: plain(m[4]) } : { eyebrow: "", title: plain(w) };
  }
  function renderToday() {
    const s = S.state, p = s?.plan, box = $("#panel-today");
    if (!p) {
      box.innerHTML = emptyState("calendar", `Ainda não há plano para esta semana.<br><br><button class="btn sm" id="mk-week">Pedir ao tutor</button>`);
      $("#mk-week").onclick = () => send("Prepara o plano da próxima semana e as unidades de gramática em falta (daily-study-planner, modo 4)."); return;
    }
    const doneKey = `done:${p.date}`;
    const done = new Set(store.get(doneKey, []));
    const wk = weekParts(p.week);
    box.innerHTML = `
      ${s.plan_is_today ? "" : `<div class="banner">${ic("clock", "sm")}Pré-visualização de ${fmtDate(p.date)}</div>`}
      <div class="today-head">
        <div><div class="eyebrow">${esc(wk.eyebrow || "Hoje")}</div><h2>${esc(wk.title)}</h2></div>
        <div class="timer-box">
          <div class="timer-txt"><span class="timer" id="timer">${fmtMs(elapsed())}</span><small>meta ${targetMin()} min</small></div>
          <div class="ring"><svg viewBox="0 0 74 74"><circle class="bg" cx="37" cy="37" r="32"/><circle class="fg" id="ring-fg" cx="37" cy="37" r="32" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg>
            <button id="t-toggle" aria-label="Cronómetro"></button></div>
        </div>
      </div>
      <div class="today-progress"><span id="done-count"></span><div class="track"><span id="done-bar"></span></div></div>
      <div class="blocks" id="blocks"></div>
      <div class="today-foot"><button class="btn wide" id="btn-close">Terminar sessão</button></div>`;
    $("#t-toggle").onclick = toggleTimer;
    $("#btn-close").onclick = openCloseDialog;
    const counter = () => {
      const n = p.blocks.filter((b) => done.has(b.key)).length;
      $("#done-count").textContent = `${n} de ${p.blocks.length} blocos`;
      $("#done-bar").style.width = `${(100 * n) / p.blocks.length}%`;
    };
    p.blocks.forEach((b) => {
      const isC = /\bC\d\b|diagn/i.test(b.text);
      const el = document.createElement("div");
      el.className = "block" + (done.has(b.key) ? " done" : "");
      el.innerHTML = `<button class="chk" aria-label="Marcar como feito"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>
        <div class="b-main"><div class="b-title"><span class="b-ico">${ic(BLOCK_ICON[b.key], "sm")}</span><span class="name">${esc(b.label)}</span><span class="b-min">${b.min} min</span></div>
        <p>${inline(b.text) || "—"}</p></div><div class="act"></div>`;
      $(".chk", el).onclick = () => {
        done.has(b.key) ? done.delete(b.key) : done.add(b.key);
        store.set(doneKey, [...done]);
        el.classList.toggle("done", done.has(b.key));
        counter();
      };
      const act = $(".act", el);
      const btn = (label, fn) => { const x = document.createElement("button"); x.className = "btn sm ghost"; x.textContent = label; x.onclick = fn; act.appendChild(x); };
      const has = plain(b.text) && plain(b.text) !== "—";
      if (b.key === "grammar" && b.unit) btn("Abrir", () => openUnit(b.unit, true));
      else if (b.key === "grammar" && isC) btn("Abrir", () => { openDoc("assessments/2026-11-25-C0-diagnostico.md"); send("Vamos fazer o diagnóstico C0."); });
      if (b.key === "listening" && b.url) btn("Abrir", () => window.open(b.url, "_blank", "noopener"));
      if (b.key === "output" && has) btn("Praticar", () => {
        if (b.kind === "writing") { const i = $("#input"); i.value = `Escrevi o texto de hoje («${plain(b.text)}»). Corrige-o (english-examiner, modo rápido):\n\n`; i.focus(); autoGrow(); }
        else send(`Vamos fazer o speaking de hoje: ${plain(b.text)}. Usa a skill speaking-coach.`);
      });
      if (b.key === "srs" && has) btn("Rever", () => send(`Revisão de vocabulário de hoje (langtutor-vocab): ${plain(b.text)}`));
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
    f.listening.value = plain(p?.blocks?.[1]?.text || "").slice(0, 60);
    f.output.value = /C\d|diagn/i.test(p?.blocks?.[0]?.text || "") ? "checkpoint" : p?.blocks?.[2]?.kind || "speaking";
    d.showModal();
    d.onclose = async () => {
      if (d.returnValue !== "ok") return;
      const body = Object.fromEntries(new FormData(f));
      try {
        await api("/api/session/close", body);
        store.set(tKey(), { acc: 0, since: null });
        toast("Sessão registada. Guarda no Git em Progresso.", 3400);
        await loadState(); renderToday();
      } catch (e) { toast(String(e.message || e), 4000, "bad"); }
    };
  }

  /* ---------------- grammar unit (interactive) ---------------- */
  const { isRight, clean } = window.Grading;

  async function openUnit(id, focus = true) {
    openPanel("unit");
    const box = $("#panel-unit");
    box.innerHTML = `<div class="sk" style="height:28px;width:60%"></div><div class="sk" style="height:14px;margin-top:16px"></div><div class="sk" style="height:14px;margin-top:8px;width:80%"></div><div class="sk" style="height:180px;margin-top:22px"></div>`;
    let data;
    try { data = await api(`/api/unit?id=${id}`); }
    catch {
      box.innerHTML = emptyState("book", `A unidade <b>${esc(id)}</b> ainda não foi criada.<br><br><button class="btn sm" id="mk-unit">Pedir ao tutor</button>`);
      $("#mk-unit").onclick = () => send(`Cria a unidade ${id} da espinha de gramática com exercícios e gabarito (daily-study-planner, modo 4, references/unit-template.md).`); S.unit = null; return;
    }
    S.unit = id; S.key = null;
    box.innerHTML = `<article class="doc" id="unit-doc">${md(data.md)}</article>
      <div class="ex-bar"><span class="score" id="score"></span>
        <button class="btn sm quiet" id="ex-reset" title="Limpar respostas">${ic("reset", "sm")}Limpar</button>
        <button class="btn sm ghost" id="ex-help">${ic("spark", "sm")}Explicar erros</button>
        <button class="btn sm" id="ex-check">Corrigir</button></div>`;
    const doc = $("#unit-doc");
    wireDocLinks(doc, `materials/grammar/${id}.md`);
    const draft = store.get(`ans:${id}`, {});
    let inEx = false;
    [...doc.children].forEach((node) => {
      if (node.tagName === "H2") inEx = /exerc/i.test(node.textContent);
      if (!inEx) return;
      if (node.tagName === "OL") $$("li[data-n]", node).forEach((li) => {
        const inp = document.createElement("input");
        inp.className = "ex-input"; inp.dataset.n = li.dataset.n; inp.value = draft[li.dataset.n] || "";
        inp.placeholder = "A tua resposta"; inp.autocomplete = "off"; inp.spellcheck = false;
        inp.oninput = () => { const d = store.get(`ans:${id}`, {}); d[li.dataset.n] = inp.value; store.set(`ans:${id}`, d); };
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); const all = $$(".ex-input", doc); const nx = all[all.indexOf(inp) + 1]; nx ? nx.focus() : $("#ex-check").click(); } };
        li.appendChild(inp);
      });
      if (node.tagName === "H3" && /produ/i.test(node.textContent)) {
        const wrap = document.createElement("div");
        wrap.className = "prod";
        wrap.innerHTML = `<textarea placeholder="Escreve aqui em inglês"></textarea><div class="row-end"><button class="btn sm ghost">${ic("pen", "sm")}Enviar ao tutor</button></div>`;
        const ta = $("textarea", wrap);
        ta.value = draft.prod || "";
        ta.oninput = () => { const d = store.get(`ans:${id}`, {}); d.prod = ta.value; store.set(`ans:${id}`, d); };
        $("button", wrap).onclick = () => ta.value.trim() ? send(`Produção da unidade ${id} (${node.textContent.trim()}). Corrige com foco no ponto da unidade (english-examiner, modo rápido):\n\n${ta.value.trim()}`) : toast("Escreve primeiro.", 2200, "bad");
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
      try { S.key = (await api(`/api/unit/key?id=${id}`)).key; } catch { return toast("Esta unidade ainda não tem gabarito.", 2600, "bad"); }
    }
    const doc = $("#unit-doc");
    let right = 0, total = 0;
    $$(".ex-input", doc).forEach((inp) => {
      const li = inp.closest("li"), n = inp.dataset.n, exp = S.key[n];
      $(".mark", li)?.remove();
      li.classList.remove("right", "wrong");
      if (!exp || /^pessoal/i.test(exp)) return;
      total++;
      const ok = li.dataset.override ? li.dataset.override === "1" : isRight(inp.value, exp);
      if (ok) right++;
      li.classList.add(ok ? "right" : "wrong");
      const mk = document.createElement("div");
      mk.className = "mark";
      mk.innerHTML = `${ok ? MK_GOOD : MK_BAD}${ok ? "" : `<span class="exp">${inline(clean(exp))}</span>`}<button title="Mudar a correção">${ok ? "Marcar como errado" : "Está certo"}</button>`;
      $("button", mk).onclick = () => { li.dataset.override = ok ? "0" : "1"; check(id); };
      li.appendChild(mk);
    });
    const pct = total ? Math.round((100 * right) / total) : 0;
    const cls = pct >= 90 ? "done" : pct >= 70 ? "ok" : "redo";
    const lbl = pct >= 90 ? "Dominada" : pct >= 70 ? "Feita" : "A repetir";
    $("#score").innerHTML = `<span class="mono">${right}/${total}</span><span class="badge ${cls}">${pct}% · ${lbl}</span>`;
    const c = $("#ex-check");
    c.textContent = "Guardar";
    c.onclick = async () => {
      const items = $$(".ex-input", doc).map((i) => ({ n: i.dataset.n, answer: i.value, ok: i.closest("li").classList.contains("right") }));
      try {
        await api("/api/unit/result", { id, pct, score: right, total, items });
        store.set(`result:${S.state.today}`, { id, pct });
        toast(`Guardado: ${id} · ${pct}%`);
        c.textContent = "Corrigir"; c.onclick = () => check(id);
      } catch (e) { toast(String(e.message || e), 4000, "bad"); }
    };
  }

  function askHelp(id) {
    const doc = $("#unit-doc");
    const wrong = $$("li.wrong", doc).map((li) => {
      const inp = $(".ex-input", li);
      const q = li.firstChild?.textContent?.trim() || "";
      return `${li.dataset.n}. ${q.slice(0, 90)} | a minha resposta: "${inp.value}" | esperado: "${clean(S.key?.[li.dataset.n] || "")}"`;
    });
    if (!wrong.length) return toast("Corrige primeiro, ou não há erros.");
    send(`Fiz a unidade ${id} na app e errei estes itens:\n${wrong.join("\n")}\n\nExplica-me cada erro de forma curta (em português) e dá-me 3 frases novas para praticar o ponto que mais falhei. Se for um erro recorrente, regista-o no progress/error-log.md.`);
  }

  /* ---------------- docs ---------------- */
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
    } catch { box.innerHTML = emptyState("file", `Documento indisponível: ${esc(path)}`); }
  }

  /* ---------------- grammar page ---------------- */
  const STATUS_LABEL = { done: "Dominada", ok: "Feita", redo: "A repetir", todo: "Por fazer" };
  function applyFilter() {
    const f = S.filter;
    $$("#units .unit").forEach((u) => {
      const s = u.dataset.status;
      const show = f === "all" || (f === "done" ? s === "done" || s === "ok" : s === f);
      u.classList.toggle("hidden", !show);
    });
    setActive($("#g-filter"), (b) => b.dataset.f === f);
  }
  async function renderGrammar() {
    const box = $("#units");
    if (!box.children.length) box.innerHTML = Array.from({ length: 12 }, () => `<div class="sk" style="height:128px"></div>`).join("");
    let units;
    try { units = await api("/api/spine"); } catch (e) { box.innerHTML = emptyState("alert", esc(e.message)); return; }
    const done = units.filter((u) => u.status === "done" || u.status === "ok").length;
    const redo = units.filter((u) => u.status === "redo").length;
    $("#g-sub").textContent = `${done} de ${units.length} unidades concluídas${redo ? ` · ${redo} a repetir` : ""}`;
    box.innerHTML = "";
    let phase = "";
    units.forEach((u) => {
      const ph = u.id.slice(0, 2);
      if (ph !== phase) {
        phase = ph;
        const n = units.filter((x) => x.id.startsWith(ph)).length;
        const t = document.createElement("div");
        t.className = "phase-title";
        t.innerHTML = `<b>${ph === "P1" ? "Fase 1 · Fundação" : "Fase 2 · Intensivo Erasmus"}</b><span>${n} unidades</span>`;
        box.appendChild(t);
      }
      const b = document.createElement("button");
      b.className = `unit ${u.status}${u.exists ? "" : " missing"}`;
      b.dataset.status = u.status;
      const pct = parseInt(u.pct, 10);
      b.innerHTML = `<span class="top"><span class="uid">${u.id}</span><span class="badge ${u.status}">${u.exists ? STATUS_LABEL[u.status] : "Por criar"}</span></span>
        <span class="ut">${esc(plain(u.title))}</span>
        <span class="foot"><span>${esc(u.cefr)}</span><span class="mono">${Number.isFinite(pct) ? pct + "%" : fmtDate(u.date)}</span></span>
        <span class="bar"><span style="width:${Number.isFinite(pct) ? pct : 0}%"></span></span>`;
      b.title = `${STATUS_LABEL[u.status]} · previsto para ${fmtDate(u.date)}`;
      b.onclick = () => { location.hash = "#study"; openUnit(u.id, true); };
      box.appendChild(b);
    });
    stagger(box);
    applyFilter();
  }

  /* ---------------- progress page ---------------- */
  async function renderProgress() {
    const root = $("#progress");
    if (!root.children.length) root.innerHTML = `<div class="tiles">${'<div class="sk" style="height:118px"></div>'.repeat(4)}</div><div class="two" style="margin-top:12px"><div class="sk" style="height:320px"></div><div class="sk" style="height:320px"></div></div>`;
    let p;
    try { p = await api("/api/progress"); } catch (e) { root.innerHTML = emptyState("alert", esc(e.message)); return; }
    const counts = { done: 0, ok: 0, redo: 0 };
    p.spine.forEach((u) => { if (counts[u.status] !== undefined) counts[u.status]++; });
    const pctTime = p.planned ? Math.min(100, Math.round((100 * p.minutes) / p.planned)) : 0;
    $("#p-sub").textContent = `${p.sessions} ${p.sessions === 1 ? "sessão" : "sessões"} · ${(p.minutes / 60).toFixed(1)} h estudadas`;
    const first = p.days[0]?.dow || 0;
    const cal = ["S", "T", "Q", "Q", "S", "S", "D"].map((d) => `<div class="hd">${d}</div>`).join("") + "<div class='d blank'></div>".repeat(first) +
      p.days.map((d) => {
        let c = d.date >= "2027-01-03" ? "d p2" : "d";
        if (d.min) c += d.min >= d.target ? " l3" : d.min >= d.target * 0.6 ? " l2" : " l1";
        else if (d.past) c += " miss";
        if (d.today) c += " today";
        return `<div class="${c}" title="${d.date} · ${d.min} min${d.cp ? " · " + d.cp : ""}">${+d.date.slice(8)}${d.cp ? `<b>${d.cp}</b>` : ""}</div>`;
      }).join("");
    const docList = (title, items) => items.length ? `<h2 style="margin-top:18px">${title}</h2><ul class="links">${items.map((r) => `<li><a href="#" data-open="${esc(r)}">${ic("file", "sm")}${esc(r.split("/").pop().replace(/\.md$/, ""))}</a></li>`).join("")}</ul>` : "";
    root.innerHTML = `
      <div class="tiles stagger">
        <div class="tile" style="--i:0"><div class="l">${ic("flag", "sm")}Dias até à partida</div><div class="k">${p.days_left}</div><div class="s">01/02/2027</div></div>
        <div class="tile" style="--i:1"><div class="l">${ic("clock", "sm")}Horas estudadas</div><div class="k">${(p.minutes / 60).toFixed(1)}<small>/ ${(p.planned / 60).toFixed(0)} h</small></div><div class="bar"><span style="width:${pctTime}%"></span></div></div>
        <div class="tile" style="--i:2"><div class="l">${ic("flame", "sm")}Dias seguidos</div><div class="k">${p.streak}</div><div class="s">${p.sessions} ${p.sessions === 1 ? "sessão" : "sessões"} no total</div></div>
        <div class="tile" style="--i:3"><div class="l">${ic("book", "sm")}Unidades</div><div class="k">${counts.done + counts.ok}<small>/ ${p.spine.length}</small></div><div class="s">${counts.redo} a repetir</div></div>
      </div>
      <div class="two">
        <div class="card"><h2>Calendário <span class="muted small">25/11 – 01/02</span></h2><div class="cal">${cal}</div>
          <div class="cal-legend"><span><i style="background:var(--good)"></i>meta cumprida</span><span><i style="background:color-mix(in srgb,var(--good) 22%,var(--surface-2))"></i>parcial</span><span><i style="background:var(--bad-soft)"></i>falhado</span><span><i style="box-shadow:inset 0 0 0 1px var(--accent-line)"></i>fase 2</span></div></div>
        <div class="card"><h2>Checkpoints</h2><ul class="timeline">${p.checkpoints.map((c) => `<li class="${c.past ? "past" : ""}"><span>${c.name}</span><span>${fmtDate(c.date)}</span></li>`).join("")}</ul>
          ${docList("Resultados", p.results)}${docList("Revisões semanais", p.reviews)}</div>
      </div>
      <div class="two">
        <div class="card"><h2>Erros recorrentes</h2>${p.errors.length ? `<table class="tbl"><tr><th>Erro</th><th>Correção</th><th class="num">Vezes</th></tr>${p.errors.map((e) => `<tr><td>${inline(e.err)}</td><td>${inline(e.fix)}</td><td class="num">${e.n}</td></tr>`).join("")}</table>` : `<div class="none">${ic("check", "sm")}Ainda nenhum registado.</div>`}</div>
        <div class="card"><h2>Últimas sessões</h2>${p.recent.length ? `<table class="tbl"><tr><th>Data</th><th class="num">Min</th><th>Gramática</th><th class="num">%</th></tr>${p.recent.map((r) => `<tr><td class="mono">${fmtDate(r.date)}</td><td class="num">${r.min}</td><td>${esc(r.grammar)}</td><td class="num">${esc(r.pct)}</td></tr>`).join("")}</table>` : `<div class="none">${ic("inbox", "sm")}A primeira é o diagnóstico C0.</div>`}</div>
      </div>`;
    $$("[data-open]", root).forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDoc(a.dataset.open); }));
  }

  /* ---------------- resources page ---------------- */
  async function openResource(path) {
    if (path === "@week") path = S.state?.plan?.file || "plan/weeks/semana-01.md";
    store.set("resDoc", path);
    setActive($("#res-seg"), (b) => (b.dataset.doc === "@week" ? S.state?.plan?.file : b.dataset.doc) === path);
    const box = $("#res-doc");
    try {
      const d = await api(`/api/doc?path=${encodeURIComponent(path)}`);
      box.innerHTML = md(d.md);
      box.style.animation = "none"; void box.offsetWidth; box.style.animation = "fade-up var(--t-slow) var(--ease) both";
      wireDocLinks(box, d.path);
    } catch { box.innerHTML = emptyState("file", "Indisponível."); }
  }

  /* ---------------- settings / git ---------------- */
  function openSettings() {
    const d = $("#dlg-settings"), f = $("form", d), s = S.state;
    $("#set-codex").innerHTML = (s.codex_models.length ? s.codex_models : ["gpt-6-sol"]).map((m) => `<option ${m === s.settings.codex_model ? "selected" : ""}>${esc(m)}</option>`).join("");
    f.claude_model.value = s.settings.claude_model || "";
    f.claude_bin.value = s.settings.claude_bin || "";
    f.codex_bin.value = s.settings.codex_bin || "";
    $("#set-cbin").placeholder = s.paths.claude ? `automático: ${s.paths.claude}` : "não encontrado: indica o caminho";
    $("#set-xbin").placeholder = s.paths.codex ? `automático: ${s.paths.codex}` : "não encontrado: indica o caminho";
    $("#set-status").innerHTML = ["claude", "codex"].map((a) => `<span><i class="status-dot ${s.agents[a] ? "on" : ""}"></i>${a === "claude" ? "Claude" : "Codex"} ${s.agents[a] ? "encontrado" : "não encontrado"}</span>`).join("") + `<span>Ambiente: ${esc(s.env || "")}</span>`;
    d.showModal();
    d.onclose = async () => {
      if (d.returnValue !== "ok") return;
      try { await api("/api/settings", Object.fromEntries(new FormData(f))); await loadState(); toast("Definições guardadas"); }
      catch (e) { toast(String(e.message || e), 4000, "bad"); }
    };
  }
  async function gitSave() {
    const b = $("#btn-git");
    b.disabled = true; b.innerHTML = `<span class="spinner"></span><span>A guardar</span>`;
    try { const r = await api("/api/git/save", {}); toast(r.msg, 4200, r.ok ? "ok" : "bad"); } catch (e) { toast(String(e.message || e), 4200, "bad"); }
    b.disabled = false; b.innerHTML = `${ic("cloud", "sm")}<span>Guardar no Git</span>`;
  }

  /* ---------------- wiring ---------------- */
  function autoGrow() { const i = $("#input"); i.style.height = "auto"; i.style.height = Math.min(i.scrollHeight, 200) + "px"; }

  async function init() {
    await loadState();
    $$("#agent-seg button").forEach((b) => (b.onclick = () => setAgent(b.dataset.agent)));
    $("#btn-send").onclick = () => (S.running ? api("/api/chat/stop", { agent: S.agent }) : send());
    $("#btn-mic").onclick = toggleMic;
    if (!SR) $("#btn-mic").style.display = "none";
    $("#input").addEventListener("input", autoGrow);
    $("#input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    $("#btn-new").onclick = async () => { if (S.running) return; await api("/api/chat/reset", { agent: S.agent }); loadHistory(); };
    $("#btn-panel").onclick = () => ($("#panel").classList.contains("open") ? $("#panel").classList.remove("open") : openPanel("today"));
    $("#btn-panel-close").onclick = () => $("#panel").classList.remove("open");
    $$("#panel-tabs button").forEach((b) => (b.onclick = () => (b.dataset.tab === "unit" && S.unit ? openUnit(S.unit) : b.dataset.tab === "doc" && S.docPath ? openDoc(S.docPath) : openPanel(b.dataset.tab))));
    $$("#res-seg button").forEach((b) => (b.onclick = () => openResource(b.dataset.doc)));
    $$("#g-filter button").forEach((b) => (b.onclick = () => { S.filter = b.dataset.f; store.set("gFilter", S.filter); applyFilter(); }));
    $("#btn-settings").onclick = openSettings;
    $("#btn-git").onclick = gitSave;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#panel").classList.contains("open") && !document.querySelector("dialog[open]")) $("#panel").classList.remove("open"); });
    setRunning(false);
    setAgent(S.agent);
    if (window.innerWidth > 980) openPanel("today");
    route();
  }
  init().catch((e) => { document.body.innerHTML = `<p style="padding:24px;font-family:system-ui">Erro ao iniciar: ${esc(e.message)}</p>`; });
})();
