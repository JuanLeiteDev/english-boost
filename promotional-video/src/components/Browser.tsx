import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, EASE_IO, EASE_OUT, FONT, MONO } from "../theme";

// A browser window that opens a new tab (the app's "open" pill → the real Cambridge test).
// The content is a 1920x1080 world (e.g. a <Recording>) scaled to `scale`.
type Props = {
  at: number; // scene s: the window flies in from the chat pill
  until: number; // scene s: the window leaves
  from: [number, number]; // frame px where it starts (the pill)
  scale?: number;
  url: string;
  tab: string;
  children: React.ReactNode;
};

export const Browser: React.FC<Props> = ({ at, until, from, scale = 0.74, url, tab, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [at * fps, (at + 0.7) * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  const q = interpolate(frame, [until * fps, (until + 0.5) * fps], [0, 1], { ...clamp, easing: EASE_IO });
  const tabP = interpolate(frame, [(at + 0.15) * fps, (at + 0.55) * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  const W = 1920 * scale;
  const H = 1080 * scale;
  const bar = 92;
  const cx = 960;
  const cy = 540 + bar / 2 - 10;
  const x = from[0] + (cx - from[0]) * p;
  const y = from[1] + (cy - from[1]) * p;
  return (
    <div style={{
      position: "absolute", left: x - W / 2, top: y - (H + bar) / 2, width: W, height: H + bar, borderRadius: 18, overflow: "hidden",
      background: "#1b1c19", boxShadow: "0 70px 160px -30px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.09)",
      scale: `${0.18 + 0.82 * p}`, opacity: Math.min(1, p * 2.5) * (1 - q), translate: `0 ${q * 40}px`,
    }}>
      {/* tab strip */}
      <div style={{ height: 48, display: "flex", alignItems: "flex-end", gap: 6, padding: "0 16px", background: "#111210" }}>
        <div style={{ display: "flex", gap: 8, alignSelf: "center", marginRight: 14 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />)}
        </div>
        <Tab label="English Boost" active={tabP < 0.5} dot />
        <div style={{ overflow: "hidden", width: 260 * tabP }}>
          <Tab label={tab} active={tabP >= 0.5} />
        </div>
      </div>
      {/* address bar */}
      <div style={{ height: bar - 48, display: "flex", alignItems: "center", padding: "0 18px", background: "#1b1c19", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ flex: 1, height: 30, borderRadius: 15, background: "#0f100e", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", fontFamily: MONO, fontSize: 15, color: C.muted }}>
          <span style={{ color: C.good }}>●</span>
          <span style={{ color: C.fg }}>{url.split("/")[0]}</span>
          <span>{url.slice(url.indexOf("/"))}</span>
        </div>
      </div>
      {/* page */}
      <div style={{ position: "relative", width: W, height: H, overflow: "hidden", background: "#fff" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", scale: `${scale}` }}>
          {children}
        </div>
      </div>
    </div>
  );
};

const Tab: React.FC<{ label: string; active: boolean; dot?: boolean }> = ({ label, active, dot }) => (
  <div style={{
    height: 38, minWidth: 220, padding: "0 16px", display: "flex", alignItems: "center", gap: 10, borderRadius: "10px 10px 0 0",
    background: active ? "#1b1c19" : "transparent", color: active ? C.fg : C.subtle, fontFamily: FONT, fontSize: 16, whiteSpace: "nowrap",
  }}>
    {dot ? <span style={{ width: 9, height: 9, background: C.signal }} /> : <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${C.muted}` }} />}
    {label}
  </div>
);
