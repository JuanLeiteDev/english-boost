// Helpers for scripts/record.mjs: demo server control, CDP screencast capture, human-like input, MP4 build.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PORT = 8790;
export const ORIGIN = `http://127.0.0.1:${PORT}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------------- demo server ---------------- */
let server = null;
export function killPort(port = PORT) {
  try {
    const out = execFileSync("ss", ["-ltnpH", `sport = :${port}`]).toString();
    for (const m of out.matchAll(/pid=(\d+)/g)) { try { process.kill(+m[1], "SIGTERM"); } catch { /* gone */ } }
  } catch { /* nothing listening */ }
}
export async function freshServer() {
  stopServer();
  killPort();
  execFileSync(path.join(PV, ".venv/bin/python"), [path.join(PV, "scripts/setup_demo.py")], { stdio: "ignore" });
  await sleep(400);
  server = spawn(path.join(PV, ".venv/bin/python"), [path.join(PV, "scripts/demo_server.py"), "--port", String(PORT)],
    { cwd: PV, stdio: ["ignore", fs.openSync(path.join(PV, "recordings/server.log"), "a"), fs.openSync(path.join(PV, "recordings/server.log"), "a")] });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${ORIGIN}/api/health`); if (r.ok) return; } catch { /* starting */ }
    await sleep(200);
  }
  throw new Error("demo server did not start");
}
export function stopServer() {
  if (server) { try { server.kill("SIGTERM"); } catch { /* gone */ } server = null; }
}

/* ---------------- browser context ---------------- */
export async function newContext(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await ctx.grantPermissions(["microphone"], { origin: ORIGIN });
  await ctx.addInitScript(() => {
    try { if (!sessionStorage.getItem("__init")) { localStorage.setItem("theme", '"dark"'); localStorage.setItem("chatW", "540"); sessionStorage.setItem("__init", "1"); } } catch { /* ignore */ }
  });
  // Block navigation away from the app: every external request gets an empty 204.
  await ctx.route((url) => !url.href.startsWith(ORIGIN) && !url.href.startsWith("data:") && !url.href.startsWith("blob:"),
    (route) => route.fulfill({ status: 204, body: "" }));
  ctx.on("page", (p) => { if (ctx.__main && p !== ctx.__main) p.close().catch(() => {}); });
  const page = await ctx.newPage();
  ctx.__main = page;
  return { ctx, page };
}

/* ---------------- clip recorder ---------------- */
export class Clip {
  constructor(page, name) {
    this.page = page; this.name = name; this.events = [];
    this.dir = path.join(PV, "recordings/frames", name);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.frames = []; this.pending = [];
    this.mouse = { x: 960, y: 540 };
  }
  now() { return Date.now() / 1000 - this.t0; }
  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", (f) => {
      this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      const i = this.frames.length;
      const file = path.join(this.dir, `f${String(i).padStart(6, "0")}.jpg`);
      this.frames.push({ file, ts: f.metadata.timestamp });
      this.pending.push(fs.promises.writeFile(file, Buffer.from(f.data, "base64")));
    });
    this.t0 = Date.now() / 1000;
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 96, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
  }
  log(type, x, y, label, extra = {}) {
    const e = { t: +this.now().toFixed(3), type };
    if (x !== undefined) { e.x = Math.round(x); e.y = Math.round(y); }
    if (label) e.label = label;
    Object.assign(e, extra);
    this.events.push(e);
    return e;
  }
  async box(sel) {
    const loc = typeof sel === "string" ? this.page.locator(sel).first() : sel;
    await loc.waitFor({ state: "visible", timeout: 20000 });
    const b = await loc.boundingBox();
    return b;
  }
  async mark(label, sel, opts = {}) {
    let b = sel ? (sel.x !== undefined ? sel : await this.box(sel)) : null;
    if (b && opts.pad) b = { x: b.x - opts.pad, y: b.y - opts.pad, width: b.width + 2 * opts.pad, height: b.height + 2 * opts.pad };
    if (!b) return this.log("mark", undefined, undefined, label);
    return this.log("mark", b.x + b.width / 2, b.y + b.height / 2, label, { box: [b.x, b.y, b.width, b.height].map(Math.round) });
  }
  // Natural pointer path: eased curve with a small arc, real hover states along the way.
  async moveTo(x, y, ms = 650) {
    const { x: x0, y: y0 } = this.mouse;
    const dist = Math.hypot(x - x0, y - y0);
    const bend = Math.min(80, dist * 0.12) * (Math.random() < 0.5 ? -1 : 1);
    const nx = -(y - y0) / (dist || 1), ny = (x - x0) / (dist || 1);
    this.log("move", x0, y0, "start");
    const start = Date.now();
    for (let i = 1; ; i++) {  // time-based, so the move lasts `ms` whatever the input latency
      const t = Math.min(1, (Date.now() - start) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const arc = Math.sin(Math.PI * e) * bend;
      const px = x0 + (x - x0) * e + nx * arc, py = y0 + (y - y0) * e + ny * arc;
      await this.page.mouse.move(px, py);
      if (i % 3 === 0 || t >= 1) this.log("move", px, py);
      if (t >= 1) break;
      await sleep(12);
    }
    this.mouse = { x, y };
  }
  async moveToSel(sel, ms, dx = 0, dy = 0) {
    const b = await this.box(sel);
    const x = b.x + b.width / 2 + dx, y = b.y + b.height / 2 + dy;
    await this.moveTo(x, y, ms);
    return { x, y, b };
  }
  async click(label) {
    const { x, y } = this.mouse;
    await this.page.mouse.down(); this.log("down", x, y, label);
    await sleep(rnd(70, 110));
    await this.page.mouse.up(); this.log("up", x, y, label);
    this.log("click", x, y, label);
  }
  async clickSel(sel, label, ms = 650) { const r = await this.moveToSel(sel, ms); await sleep(rnd(120, 200)); await this.click(label); return r; }
  async type(text) {
    for (const ch of text) {
      if (ch === "\n") { await this.page.keyboard.press("Shift+Enter"); this.log("key", undefined, undefined, "Shift+Enter"); }
      else { await this.page.keyboard.type(ch); this.log("key", undefined, undefined, ch); }
      await sleep(rnd(40, 90));
    }
  }
  async key(k) { await this.page.keyboard.press(k); this.log("key", undefined, undefined, k); }
  async wheel(dy, ms = 1200) {  // smooth scroll in small wheel steps
    let done = 0; const start = Date.now();
    this.log("wheel", this.mouse.x, this.mouse.y, `scroll start ${dy}`);
    for (;;) {
      const t = Math.min(1, (Date.now() - start) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const target = Math.round(dy * e);
      if (target !== done) { await this.page.mouse.wheel(0, target - done); done = target; }
      if (t >= 1) break;
      await sleep(14);
    }
    this.log("wheel", this.mouse.x, this.mouse.y, `scroll ${dy}`);
  }
  // Drop the first `sec` seconds (dead loading time): shift the clock and the logged events.
  trimStart(sec) {
    if (sec <= 0) return;
    this.t0 += sec;
    this.events = this.events.map((e) => ({ ...e, t: +(e.t - sec).toFixed(3) })).filter((e) => e.t >= 0);
  }
  async stop() {
    await this.cdp.send("Page.stopScreencast");
    await sleep(300);
    await Promise.all(this.pending);
    const end = this.now();
    return this.build(end);
  }
  // Constant 60 fps MP4: concat demuxer with per-frame durations (idle time holds the last frame).
  build(end) {
    const fr = this.frames.map((f) => ({ ...f, t: f.ts - this.t0 })).filter((f) => f.t < end);
    if (!fr.length) throw new Error(`${this.name}: no frames`);
    fr[0].t = Math.min(fr[0].t, 0); // first frame covers the start
    // Resample to an exact 60 fps grid: output frame k shows the newest captured frame at or before k/60 s
    // (idle time simply holds the last frame). Symlinks make this an image sequence for ffmpeg.
    const seq = path.join(this.dir, "cfr");
    fs.rmSync(seq, { recursive: true, force: true }); fs.mkdirSync(seq);
    const n = Math.round(end * 60); let j = 0;
    for (let k = 0; k < n; k++) {
      while (j + 1 < fr.length && fr[j + 1].t <= k / 60) j++;
      fs.symlinkSync(fr[j].file, path.join(seq, `${String(k).padStart(6, "0")}.jpg`));
    }
    const out = path.join(PV, "public/recordings", `${this.name}.mp4`);
    const dur = n / 60;
    execFileSync("ffmpeg", ["-y", "-v", "error", "-framerate", "60", "-i", path.join(seq, "%06d.jpg"),
      "-vf", "scale=3840:2160:flags=lanczos,setsar=1", "-r", "60", "-c:v", "libx264", "-crf", "16", "-preset", "slow",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
    const json = { fps: 60, width: 1920, height: 1080, duration: +dur.toFixed(3), events: this.events.filter((e) => e.t <= end) };
    fs.writeFileSync(path.join(PV, "public/recordings", `${this.name}.json`), JSON.stringify(json, null, 1));
    const gaps = fr.slice(1).map((f, i) => f.t - fr[i].t);
    return { name: this.name, duration: json.duration, frames: fr.length, maxGap: Math.max(...gaps).toFixed(3),
      marks: json.events.filter((e) => e.type === "mark").map((e) => `${e.label}@${e.t.toFixed(2)}`) };
  }
}
