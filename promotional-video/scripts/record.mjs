// Record the real English Boost UI (demo copy) as 4K 60 fps clips + event JSON for the Remotion video.
// Usage:  source env.sh && PLAYWRIGHT_BROWSERS_PATH=$PWD/.tools/ms-playwright node scripts/record.mjs [stills today exercise research cambridge speaking progress]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { PV, ORIGIN, sleep, freshServer, stopServer, newContext, Clip } from "./rec-lib.mjs";

const WAV = path.join(PV, "recordings/learner-en.wav");
const ALL = ["stills", "today", "exercise", "research", "cambridge", "speaking", "progress"];
const want = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${WAV}%noloop`, "--force-color-profile=srgb", "--hide-scrollbars"],
});

async function openApp(hash = "#study", ls = null) {
  const { ctx, page } = await newContext(browser);
  if (ls) await ctx.addInitScript((o) => { try { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v); } catch { /* ignore */ } }, ls);
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(`${ORIGIN}/${hash}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#blocks .block").first().waitFor();
  await sleep(1200);
  return { ctx, page };
}
async function begin(page, name, rest = [1180, 620]) {
  await page.mouse.move(rest[0], rest[1]);
  await sleep(300);
  const c = new Clip(page, name);
  c.mouse = { x: rest[0], y: rest[1] };
  await c.start();
  c.log("move", rest[0], rest[1], "rest");
  await sleep(700);
  return c;
}
async function finish(c, ctx, hold = 1000) {
  await sleep(hold);
  const r = await c.stop();
  await ctx.close();
  console.log(JSON.stringify(r));
  return r;
}
const waitIdle = (page, t = 30000) => page.waitForFunction(() => !document.querySelector("#btn-send.stop"), null, { timeout: t });

const clips = {
  async stills() {
    await freshServer();
    const { ctx, page } = await openApp();
    const out = (n) => path.join(PV, "public/stills", n);
    await page.mouse.move(1180, 1000);
    await page.screenshot({ path: out("app-today.png") });
    await page.click("a.nav[data-view=progress]"); await page.locator(".stats").waitFor(); await sleep(1500);
    await page.mouse.move(1180, 1000);
    await page.screenshot({ path: out("progress.png") });
    await page.click("a.nav[data-view=grammar]"); await page.locator("#units .uid").first().waitFor(); await sleep(1500);
    await page.mouse.move(1180, 1060);
    await page.screenshot({ path: out("grammar.png") });
    await ctx.close();
  },

  async today() {
    await freshServer();
    const { ctx, page } = await openApp();
    const c = await begin(page, "today");
    await sleep(250);
    await c.clickSel("#t-toggle", "timer play", 750);
    await c.mark("timer-start", ".timer-box", { pad: 8 });
    await sleep(900);
    await c.clickSel("#blocks .block:nth-child(4) .chk", "block 04 done", 800);
    await c.mark("block-done", "#blocks .block:nth-child(4)");
    await sleep(700);
    await c.moveToSel("#blocks .block:nth-child(1) .act button", 850);
    c.log("mark", c.mouse.x, c.mouse.y, "hover-open");
    await sleep(1200);
    return finish(c, ctx);
  },

  async exercise() {
    await freshServer();
    // Draft answers for every item except the 4 typed on camera, taken from the answer key (so the score is ~21/22).
    const key = fs.readFileSync(path.join(PV, "demo-workspace/materials/grammar/answers/P1-01.md"), "utf8");
    const draft = {};
    for (const m of key.matchAll(/^(\d+)\. (.+)$/gm)) if (+m[1] > 4) { const v = m[2].replace(/\*\*/g, "").split(" / ").map((x) => x.trim()); draft[m[1]] = v.find((x) => !x.startsWith("'")) || v[0]; }
    const { ctx, page } = await openApp("#study", { "ans:P1-01": JSON.stringify(draft) });
    const c = await begin(page, "exercise");
    await c.clickSel("a.nav[data-view=grammar]", "Grammar nav", 700);
    await page.locator("#units .uid").first().waitFor();
    await sleep(550);
    const card = page.locator("#units button").filter({ has: page.locator(".uid", { hasText: /^P1-01$/ }) }).first();
    await c.moveToSel(card, 700);
    await sleep(200);
    await c.mark("open-unit", card);
    await c.click("P1-01 card");
    await page.locator("#panel-unit .ex-input").first().waitFor();
    await sleep(700);
    // smooth scroll so the first exercise list sits in the upper part of the pane
    const dy = await page.evaluate(() => {
      const pane = document.querySelector("#panel-unit"), h3 = [...pane.querySelectorAll("h3")].find((h) => /^A\b/.test(h.textContent.trim()));
      return Math.round(h3.getBoundingClientRect().top - pane.getBoundingClientRect().top - 150);
    });
    await c.moveTo(1000, 560, 400);
    await c.wheel(dy, 1400);
    await sleep(300);
    const inputs = page.locator("#panel-unit .ex-input");
    await c.clickSel(inputs.nth(0), "input 1", 600);
    const answers = ["am", "is", "is", "aren't"]; // item 3 is the learner mistake (key: are)
    for (let i = 0; i < answers.length; i++) {
      await sleep(200);
      await c.type(answers[i]);
      if (i < answers.length - 1) { await sleep(250); await c.key("Enter"); }
    }
    await sleep(350);
    await c.clickSel("#ex-check", "Check", 750);
    await page.locator("#panel-unit .mk").first().waitFor();
    const list = page.locator("#panel-unit ol").filter({ has: page.locator(".ex-input") }).first();
    await c.mark("check", list);
    await c.mark("score", "#score");
    await sleep(500);
    await c.moveTo(c.mouse.x - 260, c.mouse.y - 120, 600);
    return finish(c, ctx, 1200);
  },

  async research() {
    await freshServer();
    const { ctx, page } = await openApp();
    // Open the document through the app's own doc-link handler (off camera).
    await page.click("a.nav[data-view=progress]");
    await page.locator("#progress a[data-open]").first().waitFor();
    await page.evaluate(() => { const a = document.querySelector("#progress a[data-open]"); a.dataset.open = "research/2026-11-24-fundamentacao.md"; a.click(); });
    await page.locator("#panel-doc article.doc h1").waitFor();
    await sleep(1500);
    const c = await begin(page, "research", [900, 700]);
    const dy = await page.evaluate(() => {
      const pane = document.querySelector("#panel-doc");
      const h = [...pane.querySelectorAll("h2")].find((x) => /Compara/.test(x.textContent));
      return Math.round(h.getBoundingClientRect().top - pane.getBoundingClientRect().top - 110);
    });
    await c.moveTo(860, 600, 600);
    await c.wheel(dy, 3600);
    await sleep(300);
    await page.evaluate(() => {  // tag the first table after the heading (no visual change)
      let n = [...document.querySelectorAll("#panel-doc h2")].find((x) => /Compara/.test(x.textContent));
      while ((n = n.nextElementSibling)) { const t = n.matches("table") ? n : n.querySelector("table"); if (t) { t.dataset.rec = "table"; break; } }
    });
    await c.mark("table", "#panel-doc [data-rec=table]");
    await sleep(800);
    await c.moveTo(c.mouse.x + 120, c.mouse.y + 60, 900);
    return finish(c, ctx, 1500);
  },

  async cambridge() {
    await freshServer();
    const { ctx, page } = await openApp();
    const c = await begin(page, "cambridge");
    await c.clickSel("#input", "chat input", 800);
    await sleep(200);
    await c.type("Let's do today's listening.");
    await sleep(300);
    await c.clickSel("#btn-send", "send", 450);
    await c.mark("send-1", "#msgs .msg.user >> nth=-1");
    await page.locator("#msgs .open-pill").first().waitFor({ timeout: 20000 });
    await c.mark("pill", "#msgs .open-pill");
    await waitIdle(page);
    await sleep(300);
    await c.moveToSel("#msgs .open-pill", 700);
    await sleep(450);
    await c.click("open ceq.inspera.com (blocked)");
    await sleep(600);
    await c.clickSel("#input", "chat input", 650);
    await c.type("1. B\n2. B\n3. A\n4. C\n5. B\n6. C\n7. C");
    await sleep(350);
    await c.clickSel("#btn-send", "send", 450);
    await c.mark("send-2", "#msgs .msg.user >> nth=-1");
    const score = page.locator("#msgs .msg:last-child .body p").filter({ hasText: "6/7" }).first();
    await score.waitFor({ timeout: 20000 });
    await c.mark("reply-2", score);
    await waitIdle(page);
    await c.moveTo(c.mouse.x - 200, c.mouse.y - 260, 800);
    return finish(c, ctx, 1300);
  },

  async speaking() {
    await freshServer();
    // warm up local Whisper in the fresh server process, so the on-camera transcription is quick
    const tok = (await (await fetch(`${ORIGIN}/api/token`)).json()).token;
    const t0 = Date.now();
    const w = await fetch(`${ORIGIN}/api/transcribe`, { method: "POST", headers: { "X-Token": tok, "Content-Type": "audio/wav" }, body: fs.readFileSync(WAV) });
    console.error("whisper warm-up:", w.status, (await w.text()).slice(0, 120), `${Date.now() - t0} ms`);
    const { ctx, page } = await openApp();
    const c = await begin(page, "speaking");
    await c.clickSel("#btn-mic", "mic on", 900);
    await c.mark("mic-on", "#btn-mic", { pad: 6 });
    await page.locator("#rec-bar.on").waitFor();
    await sleep(300);
    await c.moveToSel("#btn-mic", 350);  // the recording bar pushes the composer up a little
    await sleep(4000);
    await c.click("mic off");
    await c.mark("mic-off", "#btn-mic", { pad: 6 });
    await page.waitForFunction(() => document.querySelector("#input").value.trim().length > 0, null, { timeout: 30000 })
      .catch(async (e) => { await page.screenshot({ path: path.join(PV, "recordings/debug.png") }); console.error("toast:", await page.locator(".toast").allTextContents().catch(() => [])); throw e; });
    await c.mark("transcript", "#chat .composer .box");
    console.error("transcript:", await page.inputValue("#input"));
    await sleep(1000);
    await c.clickSel("#btn-send", "send", 600);
    await c.mark("send", "#msgs .msg.user >> nth=-1");
    const fix = page.locator("#msgs .msg:last-child .body li").filter({ has: page.locator("del") }).first();
    await fix.waitFor({ timeout: 20000 });
    await c.mark("correction", fix, { pad: 6 });
    await waitIdle(page);
    await c.moveTo(c.mouse.x - 220, c.mouse.y - 300, 800);
    return finish(c, ctx, 1400);
  },

  // The REAL Cambridge B1 Preliminary listening practice test (public, no login). Only explicit: needs network.
  // The exam audio is never played or captured: muted browser + the audio file request is aborted.
  async "cambridge-tab"() {
    const CEQ = "https://ceq.inspera.com/player/?assessmentRunId=539335544&context=exam";
    const b = await chromium.launch({ headless: true, args: ["--mute-audio", "--force-color-profile=srgb", "--hide-scrollbars"] });
    try {
      const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, serviceWorkers: "block" });
      await ctx.route(/\/audio(\?|$)/, (r) => r.abort());
      ctx.on("request", (q) => { if (q.resourceType() === "media") console.error("media request (aborted):", q.url().slice(0, 90)); });
      const page = await ctx.newPage();
      await page.goto("about:blank");
      const c = new Clip(page, "cambridge-tab");
      c.mouse = { x: 1180, y: 760 };
      await page.mouse.move(1180, 760);
      await c.start();
      const tNav = c.now();
      console.error("nav at", tNav.toFixed(2));
      await page.goto(CEQ, { waitUntil: "commit" });
      const play = page.getByRole("button", { name: "Play" });
      await play.waitFor({ state: "visible", timeout: 45000 });
      await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 }).catch(() => {});
      await sleep(250);
      const tLoaded = c.now();
      console.error("loaded at", tLoaded.toFixed(2));
      await c.mark("loaded", play);
      // keep about 1 s of loading before the welcome screen (at least 0.4 s of the loading state)
      c.trimStart(Math.max(0, tLoaded - 1.0 - tNav));
      c.log("move", c.mouse.x, c.mouse.y, "rest");
      await sleep(1000);
      await c.moveToSel(play, 850);
      await sleep(180);
      await c.mark("start", play);
      await c.click("Play (audio request blocked, muted)");
      await play.waitFor({ state: "hidden", timeout: 15000 });
      await sleep(350);
      const box = await page.evaluate(() => {
        const q = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /What did the girl buy/.test(e.textContent));
        const radios = [...document.querySelectorAll("input[type=radio]")].slice(0, 3);
        const cards = radios.map((r) => { let n = r; for (let i = 0; i < 6 && n.parentElement; i++) { n = n.parentElement; if (n.getBoundingClientRect().height > 150) break; } return n.getBoundingClientRect(); });
        const rs = [q.getBoundingClientRect(), ...cards];
        const x = Math.min(...rs.map((r) => r.left)) - 8, y = Math.min(...rs.map((r) => r.top)) - 8;
        const a = cards[0];
        return { x, y, width: Math.max(...rs.map((r) => r.right)) + 8 - x, height: Math.max(...rs.map((r) => r.bottom)) + 8 - y, ax: a.left + a.width / 2, ay: a.top + a.height * 0.45 };
      });
      await c.mark("question", box);
      await sleep(500);
      await c.moveTo(box.ax, box.ay, 850);
      c.log("mark", box.ax, box.ay, "hover-option-a");
      await sleep(1300);
      await sleep(1000);
      const r = await c.stop();
      await page.screenshot({ path: path.join(PV, "public/stills/cambridge-question.png") });
      console.log(JSON.stringify(r), JSON.stringify(box));
      return r;
    } finally { await b.close(); }
  },

  async progress() {
    await freshServer();
    const { ctx, page } = await openApp();
    const c = await begin(page, "progress", [700, 760]);
    await c.clickSel("a.nav[data-view=progress]", "Progress nav", 800);
    await page.locator("#progress .stats").waitFor();
    await sleep(80);
    await c.mark("stats", "#progress .stats");
    await sleep(1300);
    for (const d of ["2026-11-28", "2026-12-05"]) { await c.moveToSel(`.cal button.d[data-date="${d}"]`, 480); await sleep(240); }
    await c.clickSel('.cal button.d[data-date="2026-12-03"]', "day 2026-12-03", 600);
    await page.locator("#dlg-day .dd-blocks").waitFor();
    await sleep(350);
    await c.mark("day-dialog", "#dlg-day");
    await sleep(2500);
    await c.clickSel("#dlg-day .form-head button.icon", "close dialog", 600);
    await sleep(350);
    const link = page.locator('#progress a[data-open*="2026-11-25-C0-result"]');
    if (!(await link.isVisible()) || (await link.boundingBox()).y > 1000) {
      await c.moveTo(900, 640, 500);
      await c.wheel(Math.round((await link.boundingBox()).y - 700), 1200);
      await sleep(300);
    }
    await c.clickSel(link, "C0 result", 700);
    await page.locator("#panel-doc article.doc h1").waitFor();
    await sleep(450);
    const dy = await page.evaluate(() => {
      const pane = document.querySelector("#panel-doc");
      const h = [...pane.querySelectorAll("h2")].find((x) => /^Results/.test(x.textContent.trim()));
      return Math.round(h.getBoundingClientRect().top - pane.getBoundingClientRect().top - 140);
    });
    await c.moveTo(900, 600, 400);
    await c.wheel(dy, 1600);
    await sleep(200);
    await c.mark("level", "#panel-doc h2:has-text('Results') + ul");
    return finish(c, ctx, 1700);
  },
};

const results = [];
try {
  for (const name of [...ALL, "cambridge-tab"].filter((n) => want.includes(n))) {  // cambridge-tab: only when named (needs network)
    console.error(`== ${name}`);
    const r = await clips[name]();
    if (r) results.push(r);
  }
} finally {
  await browser.close();
  stopServer();
}
fs.writeFileSync(path.join(PV, "recordings/last-run.json"), JSON.stringify(results, null, 1));
