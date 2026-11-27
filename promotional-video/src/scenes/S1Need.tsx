import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { Chip, Eyebrow, Words } from "../components/Kinetic";
import { C, clamp, EASE_IO, EASE_OUT, MONO } from "../theme";
import { say } from "../timing";

// 1 · Necessidade: the countdown to Belgium, then "my English was not ready".
const Countdown: React.FC<{ leaveAt: number }> = ({ leaveAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [0.35 * fps, 2.4 * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  const n = Math.round(99 - (99 - 56) * p);
  const appear = interpolate(frame, [0.25 * fps, 0.85 * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  const leave = interpolate(frame, [leaveAt * fps, (leaveAt + 0.6) * fps], [0, 1], { ...clamp, easing: EASE_IO });
  return (
    <div style={{ position: "absolute", left: 160, top: 300, opacity: appear * (1 - leave), translate: `0 ${-leave * 120}px`, filter: `blur(${leave * 10}px)` }}>
      <div style={{ fontFamily: MONO, fontSize: 380, fontWeight: 500, letterSpacing: "-0.06em", lineHeight: 0.9, color: C.fg, fontVariantNumeric: "tabular-nums", translate: `0 ${(1 - appear) * 40}px` }}>
        {n}<span style={{ color: C.signal }}>.</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 38, color: C.muted, marginTop: 26 }}>dias para a partida <span style={{ color: C.subtle }}>·</span> <span style={{ color: C.signal }}>01.02.2027</span></div>
    </div>
  );
};

export const S1Need: React.FC = () => {
  const t2 = say("s1", "s1", "E");
  return (
    <AbsoluteFill>
      <Background glow={0.12} />
      <Eyebrow text="Erasmus · Howest, Bélgica" at={0.15} style={{ position: "absolute", left: 164, top: 220 }} />
      <Countdown leaveAt={t2 - 0.25} />
      <Words text="O meu inglês ainda não estava pronto." at={t2 + 0.05} stagger={0.09} size={122} accent={["pronto"]}
        style={{ position: "absolute", left: 160, top: 400, width: 1500 }} />
      <div style={{ position: "absolute", left: 164, top: 720, display: "flex", gap: 18 }}>
        <Chip text="nível A2" at={t2 + 1.4} />
        <Chip text="meta: B1+" at={t2 + 1.7} strong />
      </div>
    </AbsoluteFill>
  );
};
