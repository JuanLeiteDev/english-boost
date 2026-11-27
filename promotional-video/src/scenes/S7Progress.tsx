import { AbsoluteFill } from "remotion";
import { Background } from "../components/Background";
import { Chip } from "../components/Kinetic";
import { fit, mark, Rec, Recording, Screen } from "../components/Screen";
import { Sfx } from "../components/Sfx";
import { C, MONO } from "../theme";
import { say, scene } from "../timing";
import data from "../../public/recordings/progress.json";

const rec = data as Rec;

// 7 · Progresso: stats and the day plan from the calendar, then the level document.
export const S7Progress: React.FC = () => {
  const len = scene("s7").duration;
  const stats = mark(rec, "stats");
  const day = mark(rec, "day-dialog");
  const level = mark(rec, "level");
  const tNivel = say("s7", "s7", "nivel");
  const tHoras = say("s7", "s7", "horas");
  const tHist = say("s7", "s7", "historico");
  const cut = len * 0.58;
  const a = fit(0, stats.t - 0.2, day.t + 1.4, cut);
  const b = fit(cut, level.t - 0.1, Math.min(rec.duration, level.t + 2.4), len - cut);
  return (
    <AbsoluteFill>
      <Background />
      <Screen keys={[
        { t: 0, x: 1000, y: 420, z: 1.05 },
        { t: 0.1, x: 900, y: 480, z: 1.18, d: 1.4 },
        { t: cut - 1.2, x: day.x ?? 900, y: day.y ?? 560, z: 1.3, d: 1.0 },
        { t: cut, x: 820, y: 460, z: 1.25, d: 0.01 },
        { t: cut + 0.05, x: 780, y: 420, z: 1.4, d: 1.6 },
      ]}>
        <Recording name="progress" rec={rec} segs={[a, b]} />
      </Screen>
      <AbsoluteFill style={{ background: "linear-gradient(0deg, rgba(13,14,12,0.97) 0%, rgba(13,14,12,0.85) 16%, rgba(13,14,12,0) 34%)" }} />
      <div style={{ position: "absolute", left: 120, bottom: 96, display: "flex", gap: 16 }}>
        <Chip text="nível A2+ / B1-" at={tNivel} strong />
        <Chip text="11,8 h estudadas" at={tHoras} />
        <Chip text="histórico e plano de cada dia" at={tHist} />
      </div>
      <div style={{ position: "absolute", right: 60, bottom: 40, fontFamily: MONO, fontSize: 20, color: C.subtle }}>dados de demonstração</div>
      <Sfx at={tNivel} name="tick" volume={0.14} />
      <Sfx at={tHoras} name="tick" volume={0.14} />
      <Sfx at={tHist} name="tick" volume={0.14} />
    </AbsoluteFill>
  );
};
