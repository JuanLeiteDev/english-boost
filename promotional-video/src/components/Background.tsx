import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";

// Dark canvas with the app's dot grid, a slow drift and a soft vignette for depth.
export const Background: React.FC<{ glow?: number }> = ({ glow = 0.18 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${C.grid} 1.4px, transparent 1.4px)`,
          backgroundSize: "28px 28px",
          backgroundPosition: `${interpolate(frame, [0, 3600], [0, -140])}px ${interpolate(frame, [0, 3600], [0, -70])}px`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 55% at 70% 35%, rgba(255,107,44,${glow * 0.35}) 0%, transparent 70%)`,
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
    </AbsoluteFill>
  );
};

// Left-side darkening that fades in when text or cards arrive on that side (scene seconds).
export const Scrim: React.FC<{ at: number; until?: number }> = ({ at, until }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = interpolate(frame, [at * fps, (at + 0.5) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outP = until === undefined ? 0 : interpolate(frame, [until * fps, (until + 0.5) * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: inP * (1 - outP), background: "linear-gradient(90deg, rgba(13,14,12,0.99) 0%, rgba(13,14,12,0.97) 43%, rgba(13,14,12,0) 61%)" }} />
  );
};
