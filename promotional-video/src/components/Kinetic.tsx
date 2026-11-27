import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, EASE_IO, EASE_OUT, FONT, MONO } from "../theme";

type WordsProps = {
  text: string;
  at: number; // seconds (scene time) when the first word starts
  stagger?: number; // seconds between words
  size?: number;
  weight?: number;
  color?: string;
  accent?: string[]; // words drawn in the signal colour
  out?: number; // seconds when the line leaves (optional)
  style?: React.CSSProperties;
  lineHeight?: number;
};

// Words rise out of a mask one by one (no fades of whole paragraphs).
export const Words: React.FC<WordsProps> = ({
  text, at, stagger = 0.06, size = 96, weight = 600, color = C.fg, accent = [], out, style, lineHeight = 1.02,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  const leave = out === undefined ? 0 : interpolate(frame, [out * fps, out * fps + 0.45 * fps], [0, 1], { ...clamp, easing: EASE_IO });
  return (
    <div
      style={{
        fontFamily: FONT, fontSize: size, fontWeight: weight, letterSpacing: "-0.045em", lineHeight,
        color, display: "flex", flexWrap: "wrap", columnGap: "0.24em", opacity: 1 - leave,
        translate: `0 ${-leave * 30}px`, filter: `blur(${leave * 8}px)`, ...style,
      }}
    >
      {words.map((w, i) => {
        const start = (at + i * stagger) * fps;
        const p = interpolate(frame, [start, start + 0.55 * fps], [0, 1], { ...clamp, easing: EASE_OUT });
        const clean = w.replace(/[.,:!?]/g, "");
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: "0.08em", marginBottom: "-0.08em" }}>
            <span
              style={{
                display: "inline-block", translate: `0 ${(1 - p) * 105}%`, opacity: p,
                color: accent.includes(clean) ? C.signal : undefined,
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

// The app's eyebrow: a signal square + mono label.
export const Eyebrow: React.FC<{ text: string; at: number; size?: number; style?: React.CSSProperties }> = ({ text, at, size = 26, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [at * fps, at * fps + 0.5 * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.6, fontFamily: MONO, fontSize: size, color: C.muted, fontWeight: 500, ...style }}>
      <span style={{ width: size * 0.42, height: size * 0.42, background: C.signal, scale: `${p}` }} />
      <span style={{ opacity: p, translate: `${(1 - p) * -14}px 0` }}>{text}</span>
    </div>
  );
};

// A pill/tag like the app's chips.
export const Chip: React.FC<{ text: string; at: number; strong?: boolean; size?: number }> = ({ text, at, strong, size = 30 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [at * fps, at * fps + 0.5 * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 14, height: size * 2, padding: `0 ${size * 0.8}px`,
        borderRadius: 999, border: `1.5px solid ${strong ? C.signal : C.lineStrong}`,
        background: strong ? "rgba(255,107,44,0.12)" : "rgba(20,21,18,0.85)", backdropFilter: "blur(8px)",
        fontFamily: MONO, fontSize: size, fontWeight: 500, color: strong ? C.signal : C.fg,
        opacity: p, translate: `0 ${(1 - p) * 26}px`, scale: `${0.92 + 0.08 * p}`, whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};
