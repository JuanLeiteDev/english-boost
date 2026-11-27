import React from "react";
import { Video } from "@remotion/media";
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, EASE_IO, EASE_OUT } from "../theme";

/* ------------------------------------------------------------------ data */
export type RecEvent = { t: number; type: string; x?: number; y?: number; label?: string; box?: [number, number, number, number] };
export type Rec = { fps: number; width: number; height: number; duration: number; events: RecEvent[] };

export const mark = (rec: Rec, label: string): RecEvent => {
  const e = rec.events.find((x) => x.type === "mark" && x.label === label);
  if (!e) throw new Error(`mark "${label}" not found`);
  return e;
};

/* ------------------------------------------------------------------ camera */
// Keyframes in scene seconds. x,y = point of the 1920x1080 app (CSS px) put at the centre of the frame,
// z = zoom (0.86 = whole app framed with margin; 2 = 2x, still sharp because the capture is 4K).
// rx/ry = 3D tilt in degrees. Each move eases over d seconds starting at t.
export type Key = { t: number; x?: number; y?: number; z?: number; rx?: number; ry?: number; d?: number };
type Cam = { x: number; y: number; z: number; rx: number; ry: number };

const camAt = (keys: Key[], s: number): Cam => {
  let cur: Cam = { x: 960, y: 540, z: 0.86, rx: 0, ry: 0, ...stripT(keys[0]) };
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (s < k.t) break;
    const p = EASE_IO(Math.min(1, (s - k.t) / (k.d ?? 0.9)));
    const target: Cam = { ...cur, ...stripT(k) };
    cur = {
      x: cur.x + (target.x - cur.x) * p, y: cur.y + (target.y - cur.y) * p, z: cur.z + (target.z - cur.z) * p,
      rx: cur.rx + (target.rx - cur.rx) * p, ry: cur.ry + (target.ry - cur.ry) * p,
    };
  }
  return cur;
};
function stripT(k: Key): Partial<Cam> {
  const o: Partial<Cam> = {};
  (["x", "y", "z", "rx", "ry"] as const).forEach((n) => { if (k[n] !== undefined) o[n] = k[n]; });
  return o;
}

// The app "screen": a framed 1920x1080 world moved by a virtual camera, with depth shadow.
export const Screen: React.FC<{ keys: Key[]; children: React.ReactNode; radius?: number; opacity?: number }> = ({ keys, children, radius = 20, opacity = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = camAt(keys, frame / fps);
  const tx = 960 - c.x * c.z;
  const ty = 540 - c.y * c.z;
  return (
    <AbsoluteFill style={{ perspective: 2400, opacity }}>
      <div
        style={{
          position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${c.z}) rotateX(${c.rx}deg) rotateY(${c.ry}deg)`,
          borderRadius: radius, overflow: "hidden", background: C.bg,
          boxShadow: `0 0 0 1px ${C.lineStrong}, 0 60px 140px -30px rgba(0,0,0,0.85), 0 0 120px -40px rgba(255,107,44,0.25)`,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ recordings */
// A piece of a recording placed in the scene: scene time `from` shows clip time `start`..`end` at `rate`.
export type Seg = { from: number; start: number; end: number; rate?: number };

export const Recording: React.FC<{ name: string; rec: Rec; segs: Seg[]; cursor?: boolean }> = ({ name, rec, segs, cursor = true }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {segs.map((s, i) => {
        const rate = s.rate ?? 1;
        const len = Math.max(1, Math.round(((s.end - s.start) / rate) * fps));
        return (
          <Sequence key={i} from={Math.round(s.from * fps)} durationInFrames={len} name={`${name} ${s.start.toFixed(1)}s`}>
            <Video src={staticFile(`recordings/${name}.mp4`)} trimBefore={Math.round(s.start * fps)} playbackRate={rate} muted
              style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }} />
            {cursor ? <Cursor rec={rec} start={s.start} rate={rate} /> : null}
          </Sequence>
        );
      })}
    </>
  );
};

export const Still: React.FC<{ src: string }> = ({ src }) => (
  <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }} />
);

/* ------------------------------------------------------------------ cursor */
// Drawn from the coordinates the automation really used (headless browsers have no cursor).
const Cursor: React.FC<{ rec: Rec; start: number; rate: number }> = ({ rec, start, rate }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = start + (frame / fps) * rate;
  const pts = rec.events.filter((e) => e.x !== undefined && e.type !== "mark");
  if (!pts.length || t < pts[0].t - 0.3) return null;
  let i = pts.findIndex((e) => e.t > t);
  if (i === -1) i = pts.length;
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i)];
  const p = b.t === a.t ? 1 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  const x = a.x! + (b.x! - a.x!) * p;
  const y = a.y! + (b.y! - a.y!) * p;
  const lastDown = [...rec.events].reverse().find((e) => (e.type === "down" || e.type === "click") && e.t <= t);
  const since = lastDown ? t - lastDown.t : 9;
  const press = since < 0.18 ? 0.86 : 1;
  const ring = since < 0.5 ? since / 0.5 : 1;
  return (
    <>
      {lastDown && since < 0.5 ? (
        <div style={{
          position: "absolute", left: lastDown.x! - 28, top: lastDown.y! - 28, width: 56, height: 56, borderRadius: "50%",
          border: `2px solid ${C.signal}`, scale: `${0.3 + ring * 1.1}`, opacity: 1 - ring,
        }} />
      ) : null}
      <svg width={30} height={34} viewBox="0 0 30 34" style={{ position: "absolute", left: x - 4, top: y - 2, scale: `${press}`, transformOrigin: "4px 2px", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }}>
        <path d="M4 2 L4 26 L10.5 20.2 L14.6 30 L19 28.1 L14.9 18.6 L23.5 18.4 Z" fill="#fff" stroke="#111" strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </>
  );
};

/* ------------------------------------------------------------------ highlight */
// Orange outline drawn around a UI element (box in app CSS px), inside the camera world.
export const Focus: React.FC<{ box: [number, number, number, number]; at: number; until?: number; pad?: number }> = ({ box, at, until, pad = 10 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [at * fps, (at + 0.5) * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  const q = until === undefined ? 0 : interpolate(frame, [until * fps, (until + 0.35) * fps], [0, 1], clamp);
  const [x, y, w, h] = box;
  return (
    <div style={{
      position: "absolute", left: x - pad, top: y - pad, width: w + pad * 2, height: h + pad * 2, borderRadius: 12,
      border: `2.5px solid ${C.signal}`, boxShadow: `0 0 0 6px rgba(255,107,44,0.14), 0 0 40px rgba(255,107,44,0.35)`,
      opacity: p * (1 - q), scale: `${1.06 - 0.06 * p}`,
    }} />
  );
};

/* ------------------------------------------------------------------ helpers */
// Show clip time start..end inside `len` scene seconds starting at `from` (speeds up or slows down to fit).
export const fit = (from: number, start: number, end: number, len: number): Seg => ({
  from, start: Math.max(0, start), end, rate: Math.min(3, Math.max(0.6, (end - Math.max(0, start)) / len)),
});

// Scene time at which clip time `t` is shown by segment `s`.
export const at = (s: Seg, t: number) => s.from + (t - s.start) / (s.rate ?? 1);
