/* English Boost: front-end (vanilla JS, no build step). */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const S = { state: null, agent: store.get("agent", "claude"), running: false, unit: null, key: null, docPath: null, abort: null };

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
  function toast(msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
  }
  const esc = (s) => MD.esc(String(s ?? ""));

  /* ---------------- router ---------------- */
  function route() {
    const v = (location.hash || "#study").slice(1);
    $$(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${v}`));
    $$(".rail a").forEach((a) => a.classList.toggle("active", a.dataset.view === v));
    if (v === "grammar") renderGrammar();
    if (v === "progress") renderProgress();
    if (v === "resources") openResource(store.get("resDoc", "resources/catalog.md"));
  }
  window.addEventListener("hashchange", route);

  /* ---------------- state ---------------- */
  async function loadState() {
    S.state = await api("/api/state");
    return S.state;
  }

  /* ---------------- chat ---------------- */
  const SUGGESTIONS = () => {
    const st = S.state || {};
    const unit = st.plan?.blocks?.[0]?.unit;
    const first = st.checkpoint
      ? { ico: "📝", t: `Checkpoint ${st.checkpoint}`, send: st.checkpoint === "C0" ? "Vamos fazer o diagnóstico C0." : `Vamos fazer o checkpoint ${st.checkpoint}.`, open: "today" }
      : st.is_review_day
        ? { ico: "🔁", t: "Revisão semanal", send: "Vamos fazer a revisão semanal (daily-study-planner, modo 3).", open: "today" }
        : { ico: "📅", t: "Estudo de hoje", send: "Vamos estudar! Guia-me na sessão de hoje, bloco a bloco.", open: "today", unit };
    return [
      { ...first, primary: true },
      { ico: "🗣️", t: "Conversar", send: "Quero fazer um role-play do tema desta semana (speaking-coach)." },
      { ico: "✍️", t: "Corrigir texto", fill: "Corrige este texto (english-examiner):\n\n" },
      { ico: "🔤", t: "Vocabulário", send: "Revisão de vocabulário de hoje (langtutor-vocab)." },
      { ico: "🎯", t: "Pronúncia", send: "Quero treinar pronúncia (speaking-coach): escolhe o ponto mais importante para mim." },
      { ico: "📈", t: "Como estou?", send: "Como estou a ir? Faz um resumo curto do meu progresso e diz-me o próximo foco." },
    ];
  };

  function runSuggestion(s) {
    if (s.open) openPanel(s.open);
    if (s.unit) openUnit(s.unit, false);
    if (s.fill) { const i = $("#input"); i.value = s.fill; i.focus(); autoGrow(); return; }
    if (s.send) send(s.send);
  }

  function renderHero() {
    const st = S.state;
    const name = "Juan";
    const sub = st.day ? `Dia ${st.day} · Semana ${st.week} · faltam ${st.days_left} dias` : `Começa a ${fmtDate(st.plan?.date)} · faltam ${st.days_left} dias`;
    const hero = document.createElement("div");
    hero.className = "hero";
    hero.innerHTML = `<h1>Olá, ${name} 👋</h1><p>${esc(sub)}</p><div class="cards"></div>`;
    SUGGESTIONS().forEach((s) => {
      const b = document.createElement("button");
      b.className = "card-btn" + (s.primary ? " primary" : "");
      b.innerHTML = `<span class="ico">${s.ico}</span><b>${esc(s.t)}</b>`;
      b.onclick = () => runSuggestion(s);
      $(".cards", hero).appendChild(b);
    });
    return hero;
  }

  function renderInlineChips() {
    const box = $("#chips-inline");
    box.innerHTML = "";
    const hasMsgs = $$("#msgs .msg").length > 0;
    if (!hasMsgs) return;
    SUGGESTIONS().forEach((s) => {
      const b = document.createElement("button");
      b.textContent = `${s.ico} ${s.t}`;
      b.onclick = () => runSuggestion(s);
      box.appendChild(b);
    });
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}`;
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
  function pillLabel(a) {
    if (a === "hoje" || a === "today") return "📅 Plano de hoje";
    if (/^P[12]-\d\d$/.test(a)) return `📘 ${a}`;
    if (a.startsWith("doc:")) return `📄 ${a.slice(4).split("/").pop()}`;
    if (a.startsWith("url:")) return `🔗 ${a.slice(4).replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}`;
    return a;
  }

  function msgEl(m) {
    const el = document.createElement("div");
    el.className = `msg ${m.role}`;
    if (m.role === "user") {
      el.innerHTML = `<div class="bubble"></div>`;
      $(".bubble", el).textContent = m.text;
      return el;
    }
    el.innerHTML = `<div class="bubble"><div class="who"><span>${m.agent === "codex" ? "Codex" : "Claude"}</span><button class="speak" title="Ouvir">🔊</button></div><div class="tools"></div><div class="doc body"></div><div class="pills"></div></div>`;
    $(".speak", el).onclick = () => speak(m.text || "");
    fillAssistant(el, m, false);
    return el;
  }

  function fillAssistant(el, m, live) {
    const tools = $(".tools", el);
    const list = m.tools || [];
    tools.innerHTML = list.length ? (list.length > 3 ? `<span>${list.length - 3} passos…</span>` : "") + list.slice(-3).map((t) => `<span>${esc(t)}</span>`).join("") : "";
    const clean = (m.text || "").replace(MARK, "").replace(/\n{3,}/g, "\n\n").trim();
    $(".body", el).innerHTML = clean ? MD.render(clean) : live ? `<div class="typing"><i></i><i></i><i></i></div>` : "";
    wireDocLinks($(".body", el), null);
    const acts = parseMarkers(m.text || "");
    const pills = $(".pills", el);
    pills.innerHTML = "";
    acts.forEach((a) => {
      const b = document.createElement("button");
      b.className = "open-pill"; b.textContent = pillLabel(a);
      b.onclick = () => doOpen(a);
      pills.appendChild(b);
    });
  }

  async function loadHistory() {
    const box = $("#msgs");
    box.innerHTML = "";
    const h = await api(`/api/chat/history?agent=${S.agent}`);
    if (!h.messages.length) box.appendChild(renderHero());
    h.messages.forEach((m) => box.appendChild(msgEl(m)));
    renderInlineChips();
    box.scrollTop = box.scrollHeight;
  }

  function setAgent(a) {
    S.agent = a; store.set("agent", a);
    $$("#agent-seg button").forEach((b) => b.classList.toggle("active", b.dataset.agent === a));
    const ok = S.state?.agents?.[a];
    $("#input").placeholder = ok === false ? `${a === "codex" ? "Codex" : "Claude"} não encontrado neste PC` : "Escreve ou fala…";
    loadHistory();
  }

  function setRunning(r) {
    S.running = r;
    const b = $("#btn-send");
    b.classList.toggle("stop", r);
    b.title = r ? "Parar" : "Enviar";
    b.innerHTML = r ? `<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>` : `<svg viewBox="0 0 24 24"><path d="M5 12h14 M13 6l6 6-6 6"/></svg>`;
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
    let raf = 0;
    const paint = () => { raf = 0; fillAssistant(el, m, true); const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160; if (nearBottom) box.scrollTop = box.scrollHeight; };
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
          else if (ev.t === "error") { const e = document.createElement("div"); e.className = "err"; e.textContent = ev.v; $(".bubble", el).appendChild(e); }
          if (!raf) raf = requestAnimationFrame(paint);
        }
      }
    } catch (e) {
      const d = document.createElement("div"); d.className = "err"; d.textContent = String(e.message || e); $(".bubble", el).appendChild(d);
    } finally {
      setRunning(false);
      fillAssistant(el, m, false);
      $(".speak", el).onclick = () => speak(m.text);
      loadState().then(() => { if ($("#panel-today").classList.contains("active")) renderToday(); });
    }
  }

  /* ---------------- voice ---------------- */
  function speak(text) {
    if (!("speechSynthesis" in window)) return toast("O browser não suporta voz.");
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
    const plain = text.replace(MARK, "").replace(/```[\s\S]*?```/g, "").replace(/[*_`#>|]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = "en-US";
    const v = speechSynthesis.getVoices().find((x) => x.lang === "en-US") || speechSynthesis.getVoices().find((x) => x.lang.startsWith("en"));
    if (v) u.voice = v;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function toggleMic() {
    if (!SR) return toast("Ditado indisponível neste browser (usa o Chrome ou o Edge).");
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
    rec.onerror = (e) => toast(`Microfone: ${e.error}`);
    rec.start();
    $("#btn-mic").classList.add("on");
  }

  /* ---------------- panel ---------------- */
  function openPanel(tab) {
    $("#panel").classList.add("open");
    $$("#panel-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".panel-body").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
    if (tab === "today") renderToday();
    if (tab === "unit" && !S.unit) $("#panel-unit").innerHTML = `<div class="empty">Escolhe uma unidade em <a href="#grammar">Gramática</a>.</div>`;
    if (tab === "doc" && !S.docPath) $("#panel-doc").innerHTML = `<div class="empty">Nenhum documento aberto.</div>`;
    location.hash = "#study";
  }

  /* timer (per day, local) */
  const tKey = () => `timer:${S.state?.today}`;
  const timer = () => store.get(tKey(), { acc: 0, since: null });
  const elapsed = () => { const t = timer(); return t.acc + (t.since ? Date.now() - t.since : 0); };
  function toggleTimer() {
    const t = timer();
    if (t.since) { t.acc += Date.now() - t.since; t.since = null; } else t.since = Date.now();
    store.set(tKey(), t); renderToday();
  }
  setInterval(() => { const el = $("#timer"); if (el) el.textContent = fmtMs(elapsed()); }, 1000);
  const fmtMs = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

  const ICONS = { grammar: "📘", listening: "🎧", output: "🗣️", srs: "🔤" };
  function renderToday() {
    const st = S.state, p = st?.plan, box = $("#panel-today");
    if (!p) { box.innerHTML = `<div class="empty">Ainda não há plano para esta semana.<br><br><button class="btn sm" id="mk-week">Pedir ao tutor</button></div>`;
      $("#mk-week").onclick = () => send("Prepara o plano da próxima semana e as unidades de gramática em falta (daily-study-planner, modo 4)."); return; }
    const doneKey = `done:${p.date}`;
    const done = new Set(store.get(doneKey, []));
    const running = !!timer().since;
    box.innerHTML = `
      ${st.plan_is_today ? "" : `<div class="banner">Pré-visualização · ${fmtDate(p.date)}</div>`}
      <div class="today-top">
        <div><div class="meta">${esc(p.week)}</div></div>
        <div class="timer-row"><span class="timer" id="timer">${fmtMs(elapsed())}</span>
          <button class="icon" id="t-toggle" title="${running ? "Pausar" : "Começar"}">${running ? `<svg viewBox="0 0 24 24"><path d="M8 5v14 M16 5v14"/></svg>` : `<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>`}</button></div>
      </div>
      <div id="blocks"></div>
      <div class="today-foot"><button class="btn" id="btn-close">Terminar sessão</button></div>`;
    $("#t-toggle").onclick = toggleTimer;
    $("#btn-close").onclick = openCloseDialog;
    p.blocks.forEach((b) => {
      const isC = /\bC\d\b|diagn/i.test(b.text);
      const el = document.createElement("div");
      el.className = "block" + (done.has(b.key) ? " done" : "");
      el.innerHTML = `<button class="chk ${done.has(b.key) ? "on" : ""}" title="Feito"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>
        <div><h3>${ICONS[b.key]} ${b.label} <small>${b.min}′</small></h3><p>${MD.inline(b.text)}</p></div><div class="act"></div>`;
      $(".chk", el).onclick = () => { done.has(b.key) ? done.delete(b.key) : done.add(b.key); store.set(doneKey, [...done]); renderToday(); };
      const act = $(".act", el);
      const btn = (label, fn) => { const x = document.createElement("button"); x.className = "btn sm ghost"; x.textContent = label; x.onclick = fn; act.appendChild(x); };
      if (b.key === "grammar" && b.unit) btn("Abrir", () => openUnit(b.unit, true));
      else if (b.key === "grammar" && isC) btn("Abrir", () => { openDoc("assessments/2026-11-25-C0-diagnostico.md"); send("Vamos fazer o diagnóstico C0."); });
      if (b.key === "listening" && b.url) btn("Abrir", () => window.open(b.url, "_blank", "noopener"));
      if (b.key === "output" && b.text.trim() && b.text.trim() !== "—") btn("Praticar", () => {
        if (b.kind === "writing") { const i = $("#input"); i.value = `Escrevi o texto de hoje («${b.text.replace(/[*✍️🗣️]/g, "").trim()}»). Corrige-o (english-examiner, modo rápido):\n\n`; i.focus(); autoGrow(); }
        else send(`Vamos fazer o speaking de hoje: ${b.text}. Usa a skill speaking-coach.`);
      });
      if (b.key === "srs" && b.text.trim() && b.text.trim() !== "—") btn("Rever", () => send(`Revisão de vocabulário de hoje (langtutor-vocab): ${b.text}`));
      $("#blocks").appendChild(el);
    });
  }

  function openCloseDialog() {
    const p = S.state.plan, d = $("#dlg-close"), f = $("form", d);
    const res = store.get(`result:${S.state.today}`, null);
    f.minutes.value = Math.max(1, Math.round(elapsed() / 60000)) || "";
    f.grammar.value = res?.id || p?.blocks?.[0]?.unit || "";
    f.pct.value = res?.pct ?? "";
    f.listening.value = (p?.blocks?.[1]?.text || "").replace(/[*]/g, "").slice(0, 60);
    f.output.value = /C\d|diagn/i.test(p?.blocks?.[0]?.text || "") ? "checkpoint" : p?.blocks?.[2]?.kind || "speaking";
    d.showModal();
    d.onclose = async () => {
      if (d.returnValue !== "ok") return;
      const body = Object.fromEntries(new FormData(f));
      await api("/api/session/close", body);
      store.set(tKey(), { acc: 0, since: null });
      toast("Sessão registada ✓  Guarda no Git em Progresso.");
      await loadState(); renderToday();
    };
  }

  /* ---------------- grammar unit (interactive) ---------------- */
  const { isRight, clean } = window.Grading;

  async function openUnit(id, focus = true) {
    if (focus || !$("#panel").classList.contains("open")) openPanel("unit"); else openPanel("unit");
    const box = $("#panel-unit");
    let data;
    try { data = await api(`/api/unit?id=${id}`); }
    catch { box.innerHTML = `<div class="empty">A unidade ${id} ainda não foi criada.<br><br><button class="btn sm" id="mk-unit">Pedir ao tutor</button></div>`;
      $("#mk-unit").onclick = () => send(`Cria a unidade ${id} da espinha de gramática com exercícios e gabarito (daily-study-planner, modo 4, references/unit-template.md).`); S.unit = null; return; }
    S.unit = id; S.key = null;
    box.innerHTML = `<article class="doc" id="unit-doc">${MD.render(data.md)}</article>
      <div class="ex-bar"><span class="score" id="score"></span>
        <button class="btn sm ghost" id="ex-reset" title="Limpar">Limpar</button>
        <button class="btn sm ghost" id="ex-help">Explicar erros</button>
        <button class="btn sm" id="ex-check">Corrigir</button></div>`;
    const doc = $("#unit-doc");
    wireDocLinks(doc, `materials/grammar/${id}.md`);
    const draft = store.get(`ans:${id}`, {});
    // inputs for numbered items inside the exercises section
    let inEx = false;
    [...doc.children].forEach((node) => {
      if (node.tagName === "H2") inEx = /exerc/i.test(node.textContent);
      if (!inEx) return;
      if (node.tagName === "OL") $$("li[data-n]", node).forEach((li) => {
        const inp = document.createElement("input");
        inp.className = "ex-input"; inp.dataset.n = li.dataset.n; inp.value = draft[li.dataset.n] || "";
        inp.placeholder = "a tua resposta";
        inp.oninput = () => { const d = store.get(`ans:${id}`, {}); d[li.dataset.n] = inp.value; store.set(`ans:${id}`, d); };
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); const all = $$(".ex-input", doc); const nx = all[all.indexOf(inp) + 1]; nx ? nx.focus() : $("#ex-check").click(); } };
        li.appendChild(inp);
      });
      if (node.tagName === "H3" && /produ/i.test(node.textContent)) {
        const wrap = document.createElement("div");
        wrap.className = "prod";
        wrap.innerHTML = `<textarea placeholder="Escreve aqui…"></textarea><div class="row-end"><button class="btn sm ghost">Enviar ao tutor</button></div>`;
        const ta = $("textarea", wrap);
        ta.value = draft.prod || "";
        ta.oninput = () => { const d = store.get(`ans:${id}`, {}); d.prod = ta.value; store.set(`ans:${id}`, d); };
        $("button", wrap).onclick = () => ta.value.trim() ? send(`Produção da unidade ${id} (${node.textContent.trim()}). Corrige com foco no ponto da unidade (english-examiner, modo rápido):\n\n${ta.value.trim()}`) : toast("Escreve primeiro 🙂");
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
      try { S.key = (await api(`/api/unit/key?id=${id}`)).key; } catch { return toast("Esta unidade ainda não tem gabarito."); }
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
      mk.innerHTML = `<span class="tag">${ok ? "✓" : "✗"}</span>${ok ? "" : `<span class="exp">${MD.inline(clean(exp))}</span>`}<button title="Mudar a correção">${ok ? "marcar ✗" : "está certo"}</button>`;
      $("button", mk).onclick = () => { li.dataset.override = ok ? "0" : "1"; check(id); };
      li.appendChild(mk);
    });
    const pct = total ? Math.round((100 * right) / total) : 0;
    $("#score").innerHTML = `${right}/${total} · ${pct}% ${pct >= 90 ? "✅" : pct >= 70 ? "☑️" : "🔄"}`;
    const c = $("#ex-check");
    c.textContent = "Guardar";
    c.onclick = async () => {
      const items = $$(".ex-input", doc).map((i) => ({ n: i.dataset.n, answer: i.value, ok: i.closest("li").classList.contains("right") }));
      await api("/api/unit/result", { id, pct, score: right, total, items });
      store.set(`result:${S.state.today}`, { id, pct });
      toast(`Guardado: ${id} · ${pct}%`);
      c.textContent = "Corrigir"; c.onclick = () => check(id);
    };
  }

  function askHelp(id) {
    const doc = $("#unit-doc");
    const wrong = $$("li.wrong", doc).map((li) => {
      const inp = $(".ex-input", li);
      const q = li.firstChild?.textContent?.trim() || "";
      return `${li.dataset.n}. ${q.slice(0, 90)} | a minha resposta: "${inp.value}" | esperado: "${clean(S.key?.[li.dataset.n] || "")}"`;
    });
    if (!wrong.length) return toast("Corrige primeiro, ou não há erros 🎉");
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
      box.innerHTML = `<p class="muted small">${esc(d.path)}</p><article class="doc">${MD.render(d.md)}</article>`;
      wireDocLinks(box, d.path);
      box.scrollTop = 0;
    } catch { box.innerHTML = `<div class="empty">Documento indisponível: ${esc(path)}</div>`; }
  }

  /* ---------------- grammar page ---------------- */
  async function renderGrammar() {
    const units = await api("/api/spine");
    const box = $("#units");
    box.innerHTML = "";
    let phase = "";
    units.forEach((u) => {
      const ph = u.id.slice(0, 2);
      if (ph !== phase) {
        phase = ph;
        const t = document.createElement("div");
        t.className = "phase-title"; t.style.gridColumn = "1 / -1";
        t.textContent = ph === "P1" ? "Fase 1 · Fundação" : "Fase 2 · Intensivo Erasmus";
        box.appendChild(t);
      }
      const b = document.createElement("button");
      b.className = `unit ${u.status}${u.exists ? "" : " missing"}`;
      b.innerHTML = `<span class="uid"><span>${u.id}</span><span>${esc(u.pct || u.cefr)}</span></span><span class="ut">${esc(u.title)}</span>`;
      b.title = `${u.label} · ${fmtDate(u.date)}`;
      b.onclick = () => { location.hash = "#study"; openUnit(u.id, true); };
      box.appendChild(b);
    });
  }

  /* ---------------- progress page ---------------- */
  async function renderProgress() {
    const p = await api("/api/progress");
    const counts = { done: 0, ok: 0, redo: 0 };
    p.spine.forEach((u) => { if (counts[u.status] !== undefined) counts[u.status]++; });
    const pctTime = p.planned ? Math.min(100, Math.round((100 * p.minutes) / p.planned)) : 0;
    const first = p.days[0]?.dow || 0;
    const cal = [..."STQQSSD"].map((d) => `<div class="hd">${d}</div>`).join("") + "<div class='d blank'></div>".repeat(first) +
      p.days.map((d) => {
        let c = d.date >= "2027-01-03" ? "d p2" : "d";
        if (d.min) c += d.min >= d.target ? " l3" : d.min >= d.target * 0.6 ? " l2" : " l1";
        else if (d.past) c += " miss";
        if (d.today) c += " today";
        return `<div class="${c}" title="${d.date} · ${d.min} min">${+d.date.slice(8)}${d.cp ? `<b>${d.cp}</b>` : ""}</div>`;
      }).join("");
    $("#progress").innerHTML = `
      <div class="tiles">
        <div class="tile"><div class="k">${p.days_left}</div><div class="l">dias até 01/02</div></div>
        <div class="tile"><div class="k">${(p.minutes / 60).toFixed(1)}h</div><div class="l">de ${(p.planned / 60).toFixed(0)}h previstas</div><div class="bar"><span style="width:${pctTime}%"></span></div></div>
        <div class="tile"><div class="k">${p.streak}</div><div class="l">dias seguidos · ${p.sessions} sessões</div></div>
        <div class="tile"><div class="k">${counts.done + counts.ok}<span class="muted" style="font-size:16px">/${p.spine.length}</span></div><div class="l">unidades · ${counts.redo} a repetir</div></div>
      </div>
      <div class="two">
        <div class="box2"><h2>Calendário</h2><div class="cal">${cal}</div></div>
        <div class="box2"><h2>Checkpoints</h2><ul class="list">${p.checkpoints.map((c) => `<li class="${c.past ? "past" : ""}"><span>${c.name}</span><span>${fmtDate(c.date)}</span></li>`).join("")}</ul>
          ${p.results.length ? `<h2 style="margin-top:16px">Resultados</h2><ul class="list">${p.results.map((r) => `<li><a href="#" data-open="${esc(r)}">${esc(r.split("/").pop())}</a></li>`).join("")}</ul>` : ""}
          ${p.reviews.length ? `<h2 style="margin-top:16px">Revisões semanais</h2><ul class="list">${p.reviews.map((r) => `<li><a href="#" data-open="${esc(r)}">${esc(r.split("/").pop())}</a></li>`).join("")}</ul>` : ""}
        </div>
      </div>
      <div class="two">
        <div class="box2"><h2>Erros recorrentes</h2>${p.errors.length ? `<table class="tbl"><tr><th>Erro</th><th>Correção</th><th>×</th></tr>${p.errors.map((e) => `<tr><td>${MD.inline(e.err)}</td><td>${MD.inline(e.fix)}</td><td>${e.n}</td></tr>`).join("")}</table>` : `<p class="muted">Ainda nenhum.</p>`}</div>
        <div class="box2"><h2>Últimas sessões</h2>${p.recent.length ? `<table class="tbl"><tr><th>Data</th><th>Min</th><th>Gram.</th><th>%</th></tr>${p.recent.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${r.min}</td><td>${esc(r.grammar)}</td><td>${esc(r.pct)}</td></tr>`).join("")}</table>` : `<p class="muted">A primeira é o diagnóstico C0.</p>`}</div>
      </div>`;
    $$("[data-open]", $("#progress")).forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDoc(a.dataset.open); }));
  }

  /* ---------------- resources page ---------------- */
  async function openResource(path) {
    if (path === "@week") path = S.state?.plan?.file || "plan/weeks/semana-01.md";
    store.set("resDoc", path);
    $$("#res-seg button").forEach((b) => b.classList.toggle("active", (b.dataset.doc === "@week" ? S.state?.plan?.file : b.dataset.doc) === path));
    try {
      const d = await api(`/api/doc?path=${encodeURIComponent(path)}`);
      $("#res-doc").innerHTML = MD.render(d.md);
      wireDocLinks($("#res-doc"), d.path);
    } catch { $("#res-doc").innerHTML = `<div class="empty">Indisponível.</div>`; }
  }

  /* ---------------- settings / git ---------------- */
  function openSettings() {
    const d = $("#dlg-settings"), f = $("form", d), st = S.state;
    $("#set-codex").innerHTML = (st.codex_models.length ? st.codex_models : ["gpt-6-sol"]).map((m) => `<option ${m === st.settings.codex_model ? "selected" : ""}>${esc(m)}</option>`).join("");
    f.claude_model.value = st.settings.claude_model || "";
    f.claude_bin.value = st.settings.claude_bin || "";
    f.codex_bin.value = st.settings.codex_bin || "";
    $("#set-cbin").placeholder = st.paths.claude ? `automático: ${st.paths.claude}` : "não encontrado: indica o caminho";
    $("#set-xbin").placeholder = st.paths.codex ? `automático: ${st.paths.codex}` : "não encontrado: indica o caminho";
    $("#set-status").textContent = `Claude ${st.agents.claude ? "✓" : "✗"} · Codex ${st.agents.codex ? "✓" : "✗"}. Deixa os caminhos vazios para a deteção automática.`;
    d.showModal();
    d.onclose = async () => {
      if (d.returnValue !== "ok") return;
      await api("/api/settings", Object.fromEntries(new FormData(f)));
      await loadState(); toast("Definições guardadas");
    };
  }
  async function gitSave() {
    const b = $("#btn-git"); b.disabled = true; b.textContent = "A guardar…";
    try { const r = await api("/api/git/save", {}); toast(r.msg, 4200); } catch (e) { toast(String(e.message || e)); }
    b.disabled = false; b.textContent = "Guardar no Git";
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
    $("#btn-settings").onclick = openSettings;
    $("#btn-git").onclick = gitSave;
    setAgent(S.agent);
    if (window.innerWidth > 980) openPanel("today");
    route();
  }
  init().catch((e) => { document.body.innerHTML = `<p style="padding:24px">Erro ao iniciar: ${esc(e.message)}</p>`; });
})();
