import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { Eyebrow, Words } from "../components/Kinetic";
import { Screen, Still } from "../components/Screen";
import { C, clamp, EASE_IO, EASE_OUT, FONT, MONO } from "../theme";
import { say } from "../timing";

// 8 · Objetivo: the UI recedes, the brand mark and the closing line land with the voice.
const Mark: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [at * fps, (at + 0.7) * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  const u = interpolate(frame, [(at + 0.4) * fps, (at + 0.9) * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <div style={{
      position: "relative", width: 132, height: 132, border: `2px solid ${C.lineStrong}`, borderRadius: 16, background: C.raised,
      display: "grid", placeItems: "center", fontFamily: FONT, fontWeight: 700, fontSize: 46, letterSpacing: "-0.02em", color: C.fg,
      opacity: p, scale: `${0.85 + 0.15 * p}`,
    }}>
      EB
      <span style={{ position: "absolute", right: 30, bottom: 26, width: 22 * u, height: 5, background: C.signal }} />
    </div>
  );
};

export const S8Goal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t1 = say("s8", "s8", "Uma");
  const t2 = say("s8", "s8", "resolvida");
  const t3 = say("s8", "s8", "chegar");
  const end = interpolate(frame, [durationInFrames - 0.7 * fps, durationInFrames], [0, 1], { ...clamp, easing: EASE_IO });
  const recede = interpolate(frame, [0, 2.2 * fps], [0, 1], { ...clamp, easing: EASE_IO });
  return (
    <AbsoluteFill style={{ opacity: 1 - end }}>
      <Background glow={0.28} />
      <AbsoluteFill style={{ filter: `blur(${recede * 14}px)`, opacity: 1 - recede * 0.82 }}>
        <Screen keys={[{ t: 0, z: 0.86 }, { t: 0, z: 0.62, rx: 24, y: 420, d: 2.4 }]}>
          <Still src="stills/progress.png" />
        </Screen>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40 }}>
        <Mark at={Math.max(0.1, t1 - 0.4)} />
        <div style={{ textAlign: "center" }}>
          <Words text="Uma necessidade real." at={t1} size={92} style={{ justifyContent: "center" }} />
          <Words text="Resolvida com IA." at={t2} size={92} accent={["IA"]} style={{ justifyContent: "center", marginTop: 6 }} />
        </div>
        <Eyebrow text="Chegar à Bélgica preparado · 01.02.2027" at={t3} size={30} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, textAlign: "center", fontFamily: MONO, fontSize: 24, color: C.subtle,
        opacity: interpolate(frame, [(t3 + 1.2) * fps, (t3 + 1.8) * fps], [0, 1], clamp) }}>
        English Boost · feito com Claude Code · tutores Claude e Codex
      </div>
    </AbsoluteFill>
  );
};
