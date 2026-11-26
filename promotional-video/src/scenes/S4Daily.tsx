import { AbsoluteFill } from "remotion";
import { Background } from "../components/Background";
import { Chip, Words } from "../components/Kinetic";
import { at, fit, Focus, mark, Rec, Recording, Screen } from "../components/Screen";
import { Sfx } from "../components/Sfx";
import { say, scene } from "../timing";
import todayData from "../../public/recordings/today.json";
import exData from "../../public/recordings/exercise.json";

const today = todayData as Rec;
const ex = exData as Rec;

// 4 · Plano diário: today's 4 blocks + timer, then an exercise corrected on the spot.
export const S4Daily: React.FC = () => {
  const len = scene("s4").duration;
  const cut = Math.min(2.3, len * 0.48);
  const tStart = mark(today, "timer-start");
  const done = mark(today, "block-done");
  const check = mark(ex, "check");
  const tWords = say("s4", "s4", "estudar");
  const tFix = say("s4", "s4", "corrigidos");
  const segToday = fit(0, tStart.t - 0.7, done.t + 0.5, cut);
  const segEx = fit(cut, check.t - 1.0, Math.min(ex.duration, check.t + 1.6), len - cut);
  const tCheck = at(segEx, check.t);
  return (
    <AbsoluteFill>
      <Background />
      <Screen keys={[
        { t: 0, x: 980, y: 470, z: 1.02 },
        { t: 0.2, x: 760, y: 560, z: 1.12, d: 1.8 },
        { t: cut, x: (check.x ?? 760), y: (check.y ?? 600) - 60, z: 1.15, d: 0.01 },
        { t: cut + 0.05, x: (check.x ?? 760) - 60, y: (check.y ?? 600) - 120, z: 1.32, d: 1.8 },
      ]}>
        <Recording name="today" rec={today} segs={[segToday]} />
        <Recording name="exercise" rec={ex} segs={[segEx]} />
        {check.box ? <Focus box={check.box} at={tCheck + 0.15} /> : null}
      </Screen>
      <AbsoluteFill style={{ background: "linear-gradient(0deg, rgba(13,14,12,0.92) 0%, rgba(13,14,12,0) 30%)" }} />
      <div style={{ position: "absolute", left: 120, bottom: 96, display: "flex", alignItems: "center", gap: 16 }}>
        <Chip text="Gramática" at={tWords} />
        <Chip text="Listening" at={tWords + 0.12} />
        <Chip text="Speaking" at={tWords + 0.24} />
        <Chip text="Vocabulário" at={tWords + 0.36} />
      </div>
      <Words text="Corrigido na hora." at={tFix} size={64} accent={["hora"]}
        style={{ position: "absolute", right: 120, bottom: 92, width: 640, justifyContent: "flex-end" }} />
      <Sfx at={at(segToday, tStart.t)} name="click" volume={0.4} />
      <Sfx at={at(segToday, done.t)} name="click" volume={0.4} />
      <Sfx at={tCheck} name="click" volume={0.4} />
      <Sfx at={tCheck + 0.15} name="success" volume={0.22} />
    </AbsoluteFill>
  );
};
