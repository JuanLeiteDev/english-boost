import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { Eyebrow, Words } from "../components/Kinetic";
import { Screen, Still } from "../components/Screen";
import { clamp, EASE_OUT } from "../theme";
import { say } from "../timing";

// 2 · Iniciativa: the real app rises in 3D while "built from scratch with Claude Code" lands.
export const S2Build: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tCC = say("s2", "s2", "Claude");
  const tTutor = say("s2", "s2", "construi");
  const appear = interpolate(frame, [0, 0.5 * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <AbsoluteFill>
      <Background glow={0.22} />
      <Eyebrow text="Feito do zero com Claude Code" at={Math.max(0.05, tCC - 0.2)} style={{ position: "absolute", left: 160, top: 96 }} />
      <Words text="O meu próprio tutor de inglês." at={tTutor} stagger={0.07} size={84} accent={["tutor"]}
        style={{ position: "absolute", left: 160, top: 150, width: 1600 }} />
      <Screen
        opacity={appear}
        keys={[
          { t: 0, x: 960, y: 180, z: 0.6, rx: 42 },
          { t: 0.05, y: 300, z: 0.66, rx: 16, d: 1.6 },
          { t: 1.6, y: 330, z: 0.68, rx: 0, d: 2.4 },
        ]}
      >
        <Still src="stills/app-today.png" />
      </Screen>
    </AbsoluteFill>
  );
};
