import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { Chip, Eyebrow, Words } from "../components/Kinetic";
import { fit, mark, Rec, Recording, Screen } from "../components/Screen";
import { Sfx } from "../components/Sfx";
import { C, clamp, EASE_OUT, FONT, MONO } from "../theme";
import { say, scene } from "../timing";
import data from "../../public/recordings/research.json";

const rec = data as Rec;

// Big "22" that counts up when the voice says "vinte e dois".
const Studies: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [at * fps, (at + 0.9) * fps], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <div style={{ opacity: Math.min(1, p * 3), translate: `0 ${(1 - p) * 30}px` }}>
      <div style={{ fontFamily: FONT, fontSize: 150, fontWeight: 600, letterSpacing: "-0.06em", lineHeight: 1, color: C.fg }}>
        {Math.round(22 * p)}<span style={{ color: C.signal }}>.</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 26, color: C.muted, marginTop: 8 }}>estudos científicos, verificados por DOI</div>
    </div>
  );
};

export const S3Research: React.FC = () => {
  const len = scene("s3").duration;
  const table = mark(rec, "table");
  const tPlan = say("s3", "s3", "plano");
  const tCam = say("s3", "s3", "Cambridge");
  const tQuadro = say("s3", "s3", "Quadro");
  const t22 = say("s3", "s3", "vinte");
  const start = Math.max(0, table.t - 3.2);
  return (
    <AbsoluteFill>
      <Background glow={0.16} />
      <Screen keys={[
        // the document is shown on the right half; the left half carries the text
        { t: 0, x: 620, y: 560, z: 0.8 },
        { t: 0.1, x: 560, y: 520, z: 0.95, d: 2.2 },
        { t: 3.0, x: (table.x ?? 800) - 330, y: table.y ?? 560, z: 1.18, d: 1.6 },
      ]}>
        <Recording name="research" rec={rec} segs={[fit(0, start, Math.min(rec.duration, start + len), len)]} />
      </Screen>
      {/* left column: the claim and the sources, over a soft dark panel */}
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(13,14,12,0.97) 0%, rgba(13,14,12,0.9) 36%, rgba(13,14,12,0) 56%)" }} />
      <div style={{ position: "absolute", left: 120, top: 150, width: 820 }}>
        <Eyebrow text="O plano" at={Math.max(0.05, tPlan - 0.3)} />
        <Words text="Não foi inventado pela IA." at={tPlan} size={86} accent={["IA"]} style={{ marginTop: 26 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 44, width: 760 }}>
          <Chip text="Cambridge English" at={tCam} strong />
          <Chip text="Quadro Europeu · CEFR" at={tQuadro} />
          <Chip text="British Council · EAQUALS" at={tQuadro + 0.35} />
          <Chip text="VOA · BBC · ELLLO" at={tQuadro + 0.6} />
        </div>
        <div style={{ marginTop: 56 }}><Studies at={t22} /></div>
      </div>
      <Sfx at={tCam} name="tick" volume={0.14} />
      <Sfx at={t22} name="rise" volume={0.18} />
    </AbsoluteFill>
  );
};
